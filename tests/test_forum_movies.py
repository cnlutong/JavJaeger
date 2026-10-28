import asyncio
import json

import pytest
from httpx import ASGITransport, AsyncClient

from modules.movies.forum import ForumPageJob, ForumPageRequest, parse_forum_list, parse_forum_post, title_matches


ORIGIN = 'https://dmn12.vip'


@pytest.fixture(autouse=True)
def isolated_forum_cache(tmp_path, monkeypatch):
    from modules.movies import forum
    monkeypatch.setattr(forum, 'forum_cache', forum.ForumCache(tmp_path))


LISTING = '''<div id="threadlist"><table>
<tbody id="stickthread_9"><tr><th><a class="xst" href="thread-9-1-1.html">公告</a></th></tr></tbody>
<tbody id="normalthread_1"><tr><th><a class="xst" href="thread-1-1-1.html">300MIUM-1457 [LTX模型] 影片甲</a></th></tr></tbody>
<tbody id="normalthread_2"><tr><th><a class="xst" href="thread-2-1-1.html">FC2PPV-4516441 影片乙</a></th></tr></tbody>
<tbody id="normalthread_3"><tr><th><a class="xst" href="https://untrusted.test/thread-3-1-1.html">外部广告</a></th></tr></tbody>
</table></div><div class="pg"><a class="nxt" href="forum-36-2.html">下一页</a></div>'''


def post(code='300MIUM-1457', value='a' * 40):
    return f'''<span id="thread_subject">{code} [LTX模型] 影片甲</span>
    <td id="postmessage_11">【影片名称】：影片甲<br>【出演女优】：演员甲<br>【影片容量】：3.3G<br>
    <img file="https://tu.djhdhs.us/tupian/cover.jpg" src="static/image/common/none.gif">
    <img zoomfile="https://tu.djhdhs.us/tupian/screen.jpg">
    <img src="http://127.0.0.1/secret.jpg"><img src="https://user:password@tu.djhdhs.us/private.jpg">
    <div class="blockcode">magnet:?xt=urn:btih:{value}</div>
    <a href="magnet:?xt=urn:btih:{value.upper()}&amp;dn=example">重复</a>
    <script>magnet:?xt=urn:btih:{'b' * 40}</script></td>
    <td id="postmessage_12">magnet:?xt=urn:btih:{'c' * 40}</td>'''


def test_list_excludes_announcements_external_links_and_preserves_paging():
    result = parse_forum_list(LISTING, 36, 1)
    assert [m['thread_id'] for m in result['movies']] == ['1', '2']
    assert result['movies'][0]['movie_id'] == '300MIUM-1457'
    assert result['movies'][1]['movie_id'] == 'FC2-4516441'
    assert result['has_next']


def test_nested_hidden_post_content_is_excluded_without_breaking_public_resources():
    html = post().replace('<div class="blockcode">', '<div style="display:none"><span style="display:none">hidden</span></div><div class="blockcode">')
    result = parse_forum_post(html, parse_forum_list(LISTING, 36, 1)['movies'][0])
    assert result['status'] == 'ready' and len(result['magnets']) == 1


def test_forum_duplicates_never_search_an_unrelated_source_for_replacement(monkeypatch):
    from modules.magnets import service
    async def forbidden(*args, **kwargs):
        pytest.fail('forum resources must not be replaced by a search from another provider')
    monkeypatch.setattr(service, 'get_best_magnet_payload', forbidden)
    monkeypatch.setattr(service.download_history_service, 'get_magnet_source', forbidden)
    assert asyncio.run(service.get_same_source_replacement_magnet_payload('QA-001', 'magnet:original', 'dmn12')) is None


def test_post_keeps_first_post_images_and_exact_original_magnet():
    result = parse_forum_post(post(), parse_forum_list(LISTING, 36, 1)['movies'][0])
    assert result['cover_url'] == 'https://tu.djhdhs.us/tupian/cover.jpg'
    assert len(result['images']) == 2
    assert result['size'] == '3.3G'
    assert result['actors'] == '演员甲'
    assert [r['link'] for r in result['magnets']] == ['magnet:?xt=urn:btih:' + 'a' * 40]
    assert result['magnets'][0]['source'] == 'dmn12'
    assert 'password' not in json.dumps(result)


@pytest.mark.parametrize('html', ['<title>Just a moment...</title>', '<a class="enter-btn">进入</a>', '请先登录'])
def test_verification_pages_do_not_become_empty_successful_results(html):
    with pytest.raises(ValueError):
        parse_forum_list(html, 36, 1)
    with pytest.raises(ValueError):
        parse_forum_post(html, {'thread_id': '1', 'title': '影片', 'movie_id': 'QA-001'})


def test_title_filter_is_literal_case_insensitive_and_supported_keywords_are_validated():
    assert title_matches('QA-123 [ltx模型] 影片甲', '', ['LTX'])
    assert not title_matches('QA-123 影片甲', '', ['LTX'])
    assert title_matches('QA-123 [LTX] 影片甲', '影片甲', ['LTX'])
    assert not title_matches('QA-123 [LTX] 影片甲', '.*', ['LTX'])
    with pytest.raises(ValueError):
        ForumPageRequest(forum_id=999)
    with pytest.raises(ValueError):
        ForumPageRequest(keywords=['unsupported'])


def test_forum_image_proxy_keeps_the_explicit_host_and_credentials_boundary():
    from modules.proxy.service import _is_allowed_image_host
    assert _is_allowed_image_host('https://tu.djhdhs.us/tupian/cover.jpg')
    for url in ['https://tu.djhdhs.us.evil.test/x.jpg', 'https://user:password@tu.djhdhs.us/x.jpg',
                'http://127.0.0.1/x.jpg', 'https://tu.djhdhs.us:8443/x.jpg']:
        assert not _is_allowed_image_host(url)


@pytest.mark.parametrize('tool', ['pikpak', 'pan115', 'aria2'])
def test_explicit_forum_magnet_is_dispatched_without_requerying_javbus(monkeypatch, tool):
    from modules.automation import service
    from modules.automation.schemas import OneOffDispatchRequest
    link = 'magnet:?xt=urn:btih:' + 'a' * 40
    sent = []
    async def forbidden(*args, **kwargs):
        raise AssertionError('An explicit forum magnet must not trigger a replacement search')
    async def cloud(payload, **kwargs):
        sent.append((payload.magnet_links, payload.magnet_sources))
        return {'success': True, 'results': [{'success': True}]}
    async def aria(client, links, codes, sources):
        sent.append((links, sources))
        return [{'success': True}]
    monkeypatch.setattr(service, 'get_batch_movies_payload', forbidden)
    monkeypatch.setattr(service, 'pikpak_download', cloud)
    monkeypatch.setattr(service, 'pan115_download', cloud)
    monkeypatch.setattr(service, 'dispatch_magnet_downloads_to_aria2', aria)
    result = asyncio.run(service.dispatch_once(OneOffDispatchRequest(tool=tool, movie_ids=['QA-001'],
        magnet_links=[link], magnet_sources=['dmn12']), object(), lambda _: None))
    assert result['success'] and sent == [([link], ['dmn12'])]


class FakeBrowser:
    def __init__(self, fail_second=False):
        self.fail_second = fail_second
        self.calls = []
        self.closed = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        self.closed = True

    def allowed(self, url):
        return True

    async def fetch_html(self, url):
        self.calls.append(url)
        if 'forum-' in url:
            return LISTING
        if 'thread-2-' in url and self.fail_second:
            raise RuntimeError('cookie=secret-token https://user:pass@private.test')
        return post()


def test_job_publishes_partial_rows_and_retries_only_failed_posts():
    async def exercise():
        browser = FakeBrowser(fail_second=True)
        job = ForumPageJob(ForumPageRequest(), client_factory=lambda: browser, delay=0)
        events = []
        first = await job(events.append)
        assert len(first['movies']) == 2 and first['failed_count'] == 1
        assert events[1]['result']['movies'][0]['status'] == 'pending'
        assert job.can_retry() and browser.closed
        assert 'secret-token' not in json.dumps(events + [first])
        before = len(browser.calls)
        browser.fail_second = False
        final = await job(events.append)
        assert browser.calls[before:] == [ORIGIN + '/thread-2-1-1.html']
        assert final['failed_count'] == 0 and not job.can_retry()
    asyncio.run(exercise())


def test_job_filters_before_fetching_details_and_keeps_empty_page_continuation():
    async def exercise():
        browser = FakeBrowser()
        result = await ForumPageJob(ForumPageRequest(keywords=['LTX']), client_factory=lambda: browser, delay=0)(lambda _: None)
        assert result['listed_count'] == 2 and len(result['movies']) == 1
        assert not any('thread-2-' in url for url in browser.calls)
        empty = await ForumPageJob(ForumPageRequest(title_query='无匹配'), client_factory=lambda: browser, delay=0)(lambda _: None)
        assert empty['success'] and empty['movies'] == [] and empty['has_next']
    asyncio.run(exercise())


@pytest.mark.parametrize('conditions, expected_threads', [
    ({'keywords': ['LTX']}, ['1']),
    ({'title_query': '  影片乙  '}, ['2']),
    ({'title_query': '影片甲', 'keywords': ['LTX']}, ['1']),
    ({'title_query': '影片乙', 'keywords': ['LTX']}, []),
    ({'title_query': '.*'}, []),
])
@pytest.mark.parametrize('force_refresh', [False, True])
def test_forum_api_filters_titles_before_any_detail_requests(monkeypatch, conditions, expected_threads, force_refresh):
    import main
    from modules.movies import router
    from modules.common.tasks import background_tasks
    browser = FakeBrowser()
    monkeypatch.setattr(router, 'ForumPageJob', lambda payload: ForumPageJob(payload, client_factory=lambda: browser, delay=0))

    async def exercise():
        async with AsyncClient(transport=ASGITransport(app=main.app), base_url='http://test') as client:
            response = await client.post('/api/movies/forum/jobs', json={'forum_id': 36, 'page': 1, **conditions, 'force_refresh': force_refresh})
            assert response.status_code == 202
            await asyncio.gather(*background_tasks._running)
            result = (await client.get('/api/system/jobs/' + response.json()['task_id'])).json()['result']
            assert result['success'] and result['listed_count'] == 2 and result['has_next']
            assert [movie['thread_id'] for movie in result['movies']] == expected_threads
            assert browser.calls == [ORIGIN + '/forum-36-1.html', *[ORIGIN + f'/thread-{thread}-1-1.html' for thread in expected_threads]]
            assert browser.closed

    asyncio.run(exercise())


def test_job_cancellation_closes_browser_and_preserves_partial_results():
    from modules.common.tasks import TaskCancelled
    async def exercise():
        browser = FakeBrowser()
        job = ForumPageJob(ForumPageRequest(), client_factory=lambda: browser, delay=0)
        def stop(event):
            if event.get('completed') == 1:
                raise TaskCancelled()
        with pytest.raises(TaskCancelled) as error:
            await job(stop)
        assert browser.closed and len(error.value.result['movies']) == 2
        assert error.value.result['movies'][0]['status'] == 'ready'
        assert job.can_retry()
    asyncio.run(exercise())


def test_forum_job_routes_are_owned_by_browser_session(monkeypatch):
    import main
    from modules.movies import forum
    from modules.common.tasks import background_tasks
    monkeypatch.setattr(forum.ForumBrowser, '__aenter__', FakeBrowser.__aenter__)
    async def fake_runner(self, progress):
        return {'success': True, 'movies': [], 'forum_id': self.payload.forum_id, 'page': self.payload.page}
    monkeypatch.setattr(forum.ForumPageJob, '__call__', fake_runner)
    async def exercise():
        async with AsyncClient(transport=ASGITransport(app=main.app), base_url='http://test') as first, AsyncClient(transport=ASGITransport(app=main.app), base_url='http://test') as other:
            created = await first.post('/api/movies/forum/jobs', json={'forum_id': 36, 'page': 1})
            assert created.status_code == 202
            task_id = created.json()['task_id']
            await asyncio.gather(*background_tasks._running)
            assert (await first.get('/api/system/jobs/' + task_id)).status_code == 200
            assert (await other.get('/api/system/jobs/' + task_id)).status_code == 404
            assert (await first.post('/api/movies/forum/jobs', json={'forum_id': 999})).status_code == 422
            sources = (await first.get('/api/movies/forum/sources')).json()
            assert sources['keywords'] == ['LTX'] and len(sources['forums']) == 2
    asyncio.run(exercise())
