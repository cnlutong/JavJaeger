"""Public forum discovery; one disposable browser context belongs to each job."""
import asyncio
import copy
import re
import logging
import tempfile
import time
from time import monotonic
from contextlib import AsyncExitStack
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup
from pydantic import BaseModel, Field, field_validator

from modules.common.image_download import FORUM_ORIGIN, FORUM_IMAGE_HOSTS
from modules.common.tasks import TaskCancelled
from modules.common.cache import JsonTTLCache
from modules.magnets.forum import extract_forum_magnets
from .local_scrape import recognize_designation


FORUMS = {36: '亚洲无码原创', 103: '高清中文字幕'}
KEYWORDS = ['LTX']
FORUM_CACHE_DEFAULTS = {'list_minutes': 30, 'post_hours': 24, 'mb': 32}
logger = logging.getLogger(__name__)


def valid_cache_settings(values):
    return isinstance(values, dict) and all(type(values.get(key)) is int and 0 < values[key] <= 2 ** 53 - 1 for key in FORUM_CACHE_DEFAULTS)


class ForumPageRequest(BaseModel):
    forum_id: Literal[36, 103] = 36
    page: int = Field(default=1, ge=1, le=10000)
    title_query: str = Field(default='', max_length=200)
    keywords: list[Literal['LTX']] = Field(default_factory=list, max_length=1)
    force_refresh: bool = False

    @field_validator('title_query')
    @classmethod
    def trim_query(cls, value):
        return value.strip()


def forum_sources():
    return {'forums': [{'id': key, 'name': name} for key, name in FORUMS.items()], 'keywords': KEYWORDS}


def title_matches(title, query='', keywords=()):
    value = title.casefold()
    return query.strip().casefold() in value and all(keyword.casefold() in value for keyword in keywords)


def _public_thread_url(value):
    try:
        url = urljoin(FORUM_ORIGIN + '/', value)
        parsed = urlsplit(url)
        if (parsed.scheme == 'https' and parsed.netloc == 'dmn12.vip' and not parsed.query
                and re.fullmatch(r'/thread-\d+-1-\d+\.html', parsed.path)):
            return url
    except ValueError:
        pass
    return None


def _image_url(value):
    try:
        url = urljoin(FORUM_ORIGIN + '/', value)
        parsed = urlsplit(url)
        if (parsed.scheme == 'https' and parsed.hostname in FORUM_IMAGE_HOSTS and parsed.port in (None, 443)
                and parsed.username is None and parsed.password is None):
            return url
    except ValueError:
        pass
    return None


def parse_forum_list(html, forum_id, page):
    soup = BeautifulSoup(html, 'html.parser')
    if not soup.select_one('#threadlist'):
        raise ValueError('论坛暂时无法访问，可能需要完成安全验证，请稍后重试')
    movies, seen = [], set()
    for row in soup.select('#threadlist tbody[id^="normalthread_"]'):
        anchor = row.select_one('a.xst[href]')
        thread_id = row.get('id', '').removeprefix('normalthread_')
        url = _public_thread_url(anchor.get('href', '')) if anchor else None
        if not thread_id.isdecimal() or not url or thread_id in seen or not re.match(rf'/thread-{thread_id}-', urlsplit(url).path):
            continue
        seen.add(thread_id)
        title = anchor.get_text(' ', strip=True)[:1000]
        code = recognize_designation(title)
        movies.append({'thread_id': thread_id, 'movie_id': code or f'DMN12-{thread_id}', 'code': code or '',
                       'title': title, 'url': url, 'cover_url': '', 'images': [], 'magnets': [], 'status': 'pending'})
    next_url = urljoin(FORUM_ORIGIN, soup.select_one('.pg a.nxt').get('href', '')) if soup.select_one('.pg a.nxt') else ''
    return {'movies': movies, 'has_next': next_url == f'{FORUM_ORIGIN}/forum-{forum_id}-{page + 1}.html'}


def parse_forum_post(html, movie):
    soup = BeautifulSoup(html, 'html.parser')
    main = soup.select_one('[id^="postmessage_"]')
    if main is None:
        raise ValueError('帖子暂时不可读取或需要登录')
    for hidden in reversed(main.select('script, style, template, noscript, [hidden]')):
        hidden.decompose()
    for hidden in reversed(main.select('[style]')):
        if re.search(r'display\s*:\s*none|visibility\s*:\s*hidden', hidden.get('style', ''), re.I):
            hidden.decompose()
    images = []
    for image in main.select('img'):
        url = next((url for key in ('file', 'zoomfile', 'src') if (url := _image_url(image.get(key, '')))), None)
        if url and url not in images:
            images.append(url)
        if len(images) == 8:
            break
    text = main.get_text('\n', strip=True)
    fields = dict(re.findall(r'【([^】]+)】\s*[:：]\s*([^【]*)', text))
    fields = {key: value.strip().splitlines()[0] if value.strip() else '' for key, value in fields.items()}
    magnets = extract_forum_magnets(text, [a.get('href', '') for a in main.select('a[href]')])
    return {**movie, 'images': images, 'cover_url': images[0] if images else '', 'magnets': magnets,
            'size': fields.get('影片容量', '').strip()[:80], 'actors': fields.get('出演女优', '').strip()[:240],
            'status': 'ready' if magnets else 'no_resources'}


def _forum_browser_session(**options):
    """Adapt Scrapling 0.5's initial detection window; retain its challenge solver."""
    from scrapling.fetchers import AsyncStealthySession
    from scrapling.engines._browsers._stealth import __CF_PATTERN__
    from scrapling.engines.toolbelt.convertor import ResponseFactory

    class ForumSession(AsyncStealthySession):
        async def _cloudflare_solver(self, page, _attempts=0):
            if _attempts:
                return await super()._cloudflare_solver(page, _attempts)
            deadline = monotonic() + 3
            while True:
                challenge = self._detect_cloudflare(await ResponseFactory._get_async_page_content(page))
                if challenge and (challenge != 'embedded' or page.frame(url=__CF_PATTERN__) is not None):
                    return await super()._cloudflare_solver(page, _attempts)
                remaining = deadline - monotonic()
                if remaining <= 0:
                    return None
                await page.wait_for_timeout(min(500, remaining * 1000))

    return ForumSession(**options)


class ForumBrowser:
    """No persistent account state; navigation stays on the known forum and challenge hosts."""
    async def __aenter__(self):
        from scrapling.fetchers import Fetcher
        from protego import Protego
        robots = await asyncio.to_thread(Fetcher.get, FORUM_ORIGIN + '/robots.txt', impersonate='chrome', timeout=20)
        if robots.status != 200 or b'User-agent:' not in robots.body or b'<html' in robots.body.lower():
            raise ValueError('无法读取论坛访问规则，请稍后重试')
        self.rules = Protego.parse(robots.body.decode('utf-8', errors='replace'))
        self.profile = tempfile.TemporaryDirectory(prefix='javjaeger-forum-')
        self.session = _forum_browser_session(headless=True, user_data_dir=self.profile.name, timeout=90000, retries=1,
                                             solve_cloudflare=True, google_search=False, block_ads=True, max_pages=1)
        try:
            await self.session.__aenter__()
        except BaseException:
            self.profile.cleanup()
            raise
        return self

    async def __aexit__(self, *args):
        try:
            await self.session.__aexit__(*args)
        finally:
            self.profile.cleanup()

    def allowed(self, url):
        return self.rules.can_fetch(url, '*')

    async def fetch_html(self, url):
        if not self.allowed(url):
            raise ValueError('论坛访问规则不允许读取此页面')

        async def setup(page):
            async def route(request_route):
                request = request_route.request
                if urlsplit(request.url).hostname not in {'dmn12.vip', 'challenges.cloudflare.com'} or request.resource_type in {'image', 'media', 'font'}:
                    await request_route.abort()
                else:
                    await request_route.continue_()
            await page.route('**/*', route)

        async def enter(page):
            gate = page.locator('a.enter-btn')
            if await gate.count():
                href = await gate.first.get_attribute('href')
                if urlsplit(urljoin(FORUM_ORIGIN, href or '')).netloc == 'dmn12.vip':
                    await gate.first.click(no_wait_after=True)
                    await page.wait_for_timeout(2000)

        response = await self.session.fetch(url, page_setup=setup, page_action=enter, wait=1000)
        if not response.css('#threadlist, [id^="postmessage_"]'):
            response = await self.session.fetch(url, page_setup=setup, wait=1000)
        return response.body.decode('utf-8', errors='replace')


class ForumCache:
    """Shared public lists and first-post resources; never browser profiles or job state."""
    def __init__(self, directory='data/forum_cache', clock=time.time):
        self.clock = clock
        self.store = JsonTTLCache(directory, clock=clock)
        self.settings = dict(FORUM_CACHE_DEFAULTS)
        self._loaded = False
        self._settings_lock = asyncio.Lock()

    @property
    def list_ttl(self):
        return self.settings['list_minutes'] * 60

    @property
    def post_ttl(self):
        return self.settings['post_hours'] * 3600

    async def _load(self):
        if self._loaded:
            return
        values = await self.store.load_options()
        if valid_cache_settings(values):
            self.settings = {key: values[key] for key in FORUM_CACHE_DEFAULTS}
        await self.store.set_policy(self.settings['mb'] * 1024 ** 2, {'list:': self.list_ttl, 'post:': self.post_ttl})
        self._loaded = True

    async def load(self):
        async with self._settings_lock:
            try:
                await self._load()
            except OSError:
                logger.warning('Forum cache settings could not be read')

    async def status(self):
        async with self._settings_lock:
            await self._load()
            return {'settings': dict(self.settings), **await self.store.status()}

    async def configure(self, values):
        if not valid_cache_settings(values):
            raise ValueError('列表缓存分钟数、帖子缓存小时数和容量上限必须为正整数')
        settings = {key: values[key] for key in FORUM_CACHE_DEFAULTS}
        async with self._settings_lock:
            await self._load()
            await self.store.set_policy(settings['mb'] * 1024 ** 2,
                {'list:': settings['list_minutes'] * 60, 'post:': settings['post_hours'] * 3600}, options=settings)
            self.settings = settings
            return {'settings': dict(self.settings), **await self.store.status()}

    async def clear(self):
        async with self._settings_lock:
            await self._load()
            return {'settings': dict(self.settings), **await self.store.clear()}

    async def get_listing(self, forum_id, page):
        await self.load()
        record = await self.store.get(f'list:{forum_id}:{page}')
        value = record['value'] if record else None
        if not isinstance(value, dict) or not isinstance(value.get('movies'), list) or type(value.get('has_next')) is not bool:
            return None
        fields = ('thread_id', 'movie_id', 'code', 'title', 'url')
        movies = []
        for movie in value['movies']:
            if (not isinstance(movie, dict) or not all(isinstance(movie.get(key), str) for key in fields)
                    or not movie['thread_id'].isdecimal() or not _public_thread_url(movie['url'])
                    or not urlsplit(movie['url']).path.startswith('/thread-' + movie['thread_id'] + '-')):
                return None
            movies.append({key: movie[key] for key in fields})
        return {**record, 'value': {'movies': movies, 'has_next': value['has_next']}}

    async def put_listing(self, forum_id, page, listing):
        await self.load()
        movies = [{key: movie[key] for key in ('thread_id', 'movie_id', 'code', 'title', 'url')} for movie in listing['movies']]
        await self.store.put(f'list:{forum_id}:{page}', {'movies': movies, 'has_next': listing['has_next']}, self.list_ttl)

    @staticmethod
    def post_data(movie):
        if not isinstance(movie, dict) or movie.get('status') not in {'ready', 'no_resources'}:
            return None
        if not isinstance(movie.get('images'), list) or not isinstance(movie.get('magnets'), list):
            return None
        if any(not isinstance(m, dict) or not isinstance(m.get('link'), str) for m in movie['magnets']):
            return None
        images = [url for value in movie.get('images', []) if isinstance(value, str) and (url := _image_url(value))][:8]
        magnets = extract_forum_magnets('', [m.get('link', '') for m in movie.get('magnets', []) if isinstance(m, dict)])
        if movie['status'] == 'ready' and not magnets:
            return None
        return {'status': 'ready' if magnets else 'no_resources', 'images': images, 'cover_url': images[0] if images else '',
                'magnets': magnets, 'size': str(movie.get('size', ''))[:80], 'actors': str(movie.get('actors', ''))[:240]}

    async def get_post(self, thread_id):
        await self.load()
        record = await self.store.get('post:' + thread_id)
        return self.post_data(record['value']) if record else None

    async def put_post(self, movie):
        await self.load()
        data = self.post_data(movie)
        if data is not None:
            await self.store.put('post:' + movie['thread_id'], data, self.post_ttl)

    async def get_page(self, forum_id, page):
        record = await self.get_listing(forum_id, page)
        if record is None:
            return None
        movies = []
        for movie in record['value']['movies']:
            data = await self.get_post(movie['thread_id'])
            if data is None:
                return None
            movies.append({**movie, **data})
        return _page_result(ForumPageRequest(forum_id=forum_id, page=page), movies, len(movies), record['value']['has_next'],
                            record['saved_at'], True, len(movies), self.settings)


forum_cache = ForumCache()


async def get_cached_forum_page(forum_id, page):
    result = await forum_cache.get_page(forum_id, page)
    return {'cached': result is not None, 'result': result}


async def get_forum_cache_settings():
    return await forum_cache.status()


async def configure_forum_cache(values):
    return await forum_cache.configure(values)


async def clear_forum_cache():
    return await forum_cache.clear()


def _page_result(payload, movies, listed_count, has_next, saved_at, cache_hit, reused_posts, settings):
    failed = sum(m['status'] == 'failed' for m in movies)
    ready = sum(m['status'] == 'ready' for m in movies)
    completed = sum(m['status'] != 'pending' for m in movies)
    return {'success': not failed or ready > 0, 'forum_id': payload.forum_id, 'forum_name': FORUMS[payload.forum_id],
            'page': payload.page, 'has_next': has_next, 'listed_count': listed_count,
            'movies': copy.deepcopy(movies), 'failed_count': failed, 'ready_count': ready,
            'cache': {'hit': cache_hit, 'saved_at': datetime.fromtimestamp(saved_at, timezone.utc).isoformat() if saved_at is not None else None,
                      'reused_posts': reused_posts, 'list_ttl_seconds': settings['list_minutes'] * 60, 'post_ttl_seconds': settings['post_hours'] * 3600},
            'message': f'已读取 {completed}/{len(movies)} 条，{ready} 条可下发' + (f'，{failed} 条失败，可重试' if failed else '')}


class ForumPageJob:
    def __init__(self, payload, client_factory=None, delay=3, cache=None):
        self.payload = payload
        self.client_factory = client_factory or ForumBrowser
        self.delay = delay
        self.cache = cache or forum_cache
        self.saved_at = None
        self.cache_hit = False
        self.reused_posts = 0
        self.movies = []
        self.listed = False
        self.listed_count = 0
        self.has_next = False

    def can_retry(self):
        return not self.listed or any(m['status'] in {'pending', 'failed'} for m in self.movies)

    def result(self):
        return _page_result(self.payload, self.movies, self.listed_count, self.has_next, self.saved_at, self.cache_hit, self.reused_posts, self.cache.settings)

    async def __call__(self, progress):
        await self.cache.load()
        fallback = await self.cache.get_page(self.payload.forum_id, self.payload.page) if self.payload.force_refresh and not self.listed else None
        if fallback:
            movies = [movie for movie in fallback['movies'] if title_matches(movie['title'], self.payload.title_query, self.payload.keywords)]
            fallback = _page_result(self.payload, movies, fallback['listed_count'], fallback['has_next'],
                                    datetime.fromisoformat(fallback['cache']['saved_at']).timestamp(), True, len(movies), self.cache.settings)
        try:
            progress({'phase': 'forum-list', 'message': '正在读取论坛列表', 'result': fallback or self.result()})
            async with AsyncExitStack() as stack:
                client = None

                async def fetch(url):
                    nonlocal client
                    if client is None:
                        client = await stack.enter_async_context(self.client_factory())
                    return await client.fetch_html(url)

                if not self.listed:
                    cached = None if self.payload.force_refresh else await self.cache.get_listing(self.payload.forum_id, self.payload.page)
                    if cached:
                        listing = cached['value']
                        self.saved_at, self.cache_hit = cached['saved_at'], True
                    else:
                        listing = parse_forum_list(await fetch(f'{FORUM_ORIGIN}/forum-{self.payload.forum_id}-{self.payload.page}.html'), self.payload.forum_id, self.payload.page)
                        self.saved_at = self.cache.clock()
                        await self.cache.put_listing(self.payload.forum_id, self.payload.page, listing)
                    self.has_next = listing['has_next']
                    self.listed_count = len(listing['movies'])
                    self.movies = [{**m, 'status': 'pending', 'magnets': [], 'images': [], 'cover_url': ''} for m in listing['movies'] if title_matches(m['title'], self.payload.title_query, self.payload.keywords)]
                    self.listed = True
                progress({'phase': 'forum-details', 'total': len(self.movies), 'completed': 0,
                          'message': '列表已获取，正在逐条读取图片与资源', 'result': self.result()})
                for index, movie in enumerate(self.movies):
                    if movie['status'] not in {'pending', 'failed'}:
                        continue
                    try:
                        cached = None if self.payload.force_refresh else await self.cache.get_post(movie['thread_id'])
                        if cached is not None:
                            self.movies[index] = {**movie, **cached}
                            self.reused_posts += 1
                        else:
                            self.cache_hit = False
                            await asyncio.sleep(self.delay)
                            self.movies[index] = parse_forum_post(await fetch(movie['url']), movie)
                            await self.cache.put_post(self.movies[index])
                    except Exception:
                        self.movies[index] = {**movie, 'status': 'failed', 'error': '帖子暂时不可读取，请稍后重试'}
                    progress({'phase': 'forum-details', 'total': len(self.movies),
                              'completed': sum(m['status'] != 'pending' for m in self.movies),
                              'message': f'正在获取影片 {index + 1}/{len(self.movies)}', 'result': self.result()})
            return self.result()
        except TaskCancelled as exc:
            exc.result = self.result()
            raise
        except Exception:
            if fallback and not self.listed:
                self.movies, self.has_next, self.listed_count = fallback['movies'], fallback['has_next'], fallback['listed_count']
                self.cache_hit, self.reused_posts = True, len(self.movies)
                self.saved_at = datetime.fromisoformat(fallback['cache']['saved_at']).timestamp()
            result = self.result()
            result.update(success=False, message='刷新失败，已保留缓存结果，可稍后重试' if fallback else '论坛获取失败，请稍后重试；部署环境需安装论坛浏览器依赖')
            return result
