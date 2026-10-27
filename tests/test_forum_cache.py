import asyncio
import json

import pytest
from httpx import ASGITransport, AsyncClient

from modules.movies import forum
from test_forum_movies import FakeBrowser


@pytest.fixture(autouse=True)
def isolated_forum_cache(tmp_path, monkeypatch):
    cache = forum.ForumCache(tmp_path)
    monkeypatch.setattr(forum, 'forum_cache', cache)
    return cache


def test_complete_page_is_reused_across_restart_and_filters_without_opening_a_browser(tmp_path, isolated_forum_cache):
    async def exercise():
        browser = FakeBrowser()
        first = await forum.ForumPageJob(forum.ForumPageRequest(), client_factory=lambda: browser, delay=0)(lambda _: None)
        assert len(browser.calls) == 3 and not first['cache']['hit']
        restarted = forum.ForumCache(tmp_path)
        def forbidden():
            pytest.fail('a fully cached page must not start Chromium or fetch robots')
        result = await forum.ForumPageJob(forum.ForumPageRequest(keywords=['LTX']), cache=restarted, client_factory=forbidden)(lambda _: None)
        assert result['cache']['hit'] and result['cache']['saved_at']
        assert len(result['movies']) == 1 and result['movies'][0]['magnets'] == first['movies'][0]['magnets']
        assert len((await restarted.get_page(36, 1))['movies']) == 2
        assert await restarted.get_page(103, 1) is None
        assert await restarted.get_page(36, 2) is None
    asyncio.run(exercise())


def test_listing_expiry_rechecks_membership_but_reuses_unexpired_post_resources(tmp_path):
    async def exercise():
        now = [100000.0]
        cache = forum.ForumCache(tmp_path, clock=lambda: now[0])
        browser = FakeBrowser()
        await forum.ForumPageJob(forum.ForumPageRequest(), cache=cache, client_factory=lambda: browser, delay=0)(lambda _: None)
        now[0] += 1801
        browser.calls.clear()
        assert await cache.get_page(36, 1) is None
        result = await forum.ForumPageJob(forum.ForumPageRequest(), cache=cache, client_factory=lambda: browser, delay=0)(lambda _: None)
        assert browser.calls == ['https://dmn12.vip/forum-36-1.html']
        assert result['cache']['reused_posts'] == 2
        now[0] += 86401
        browser.calls.clear()
        await forum.ForumPageJob(forum.ForumPageRequest(), cache=cache, client_factory=lambda: browser, delay=0)(lambda _: None)
        assert len(browser.calls) == 3
    asyncio.run(exercise())


def test_filtered_or_partial_jobs_never_poison_the_full_page_cache(isolated_forum_cache):
    async def exercise():
        browser = FakeBrowser()
        await forum.ForumPageJob(forum.ForumPageRequest(keywords=['LTX']), client_factory=lambda: browser, delay=0)(lambda _: None)
        assert await isolated_forum_cache.get_page(36, 1) is None
        browser.calls.clear()
        result = await forum.ForumPageJob(forum.ForumPageRequest(), client_factory=lambda: browser, delay=0)(lambda _: None)
        assert browser.calls == ['https://dmn12.vip/thread-2-1-1.html']
        assert len(result['movies']) == 2
    asyncio.run(exercise())


def test_force_refresh_bypasses_cache_and_a_failed_refresh_preserves_saved_results(isolated_forum_cache):
    async def exercise():
        browser = FakeBrowser()
        await forum.ForumPageJob(forum.ForumPageRequest(), client_factory=lambda: browser, delay=0)(lambda _: None)
        browser.calls.clear()
        await forum.ForumPageJob(forum.ForumPageRequest(force_refresh=True), client_factory=lambda: browser, delay=0)(lambda _: None)
        assert len(browser.calls) == 3
        class Offline(FakeBrowser):
            async def fetch_html(self, url):
                raise RuntimeError('cookie=secret')
        failed = await forum.ForumPageJob(forum.ForumPageRequest(force_refresh=True), client_factory=Offline, delay=0)(lambda _: None)
        assert not failed['success'] and len(failed['movies']) == 2
        assert 'secret' not in json.dumps(failed)
        assert len((await isolated_forum_cache.get_page(36, 1))['movies']) == 2
        filtered = await forum.ForumPageJob(forum.ForumPageRequest(force_refresh=True, keywords=['LTX']), client_factory=Offline, delay=0)(lambda _: None)
        assert len(filtered['movies']) == 1 and filtered['listed_count'] == 2
    asyncio.run(exercise())


def test_public_cache_endpoint_is_validated_and_contains_no_job_or_session_state(isolated_forum_cache):
    import main
    async def exercise():
        async with AsyncClient(transport=ASGITransport(app=main.app), base_url='http://test') as client:
            assert (await client.get('/api/movies/forum/cache')).json() == {'cached': False, 'result': None}
            await forum.ForumPageJob(forum.ForumPageRequest(), client_factory=FakeBrowser, delay=0)(lambda _: None)
            response = await client.get('/api/movies/forum/cache?forum_id=36&page=1')
            assert response.status_code == 200 and response.json()['cached']
            assert response.headers['cache-control'] == 'no-store'
            text = response.text
            assert all(secret not in text for secret in ['task_id', 'cookie', 'session_id', 'user_data_dir'])
            assert (await client.get('/api/movies/forum/cache?forum_id=999')).status_code == 422
            assert (await client.get('/api/movies/forum/cache?page=0')).status_code == 422
    asyncio.run(exercise())


def test_malformed_records_are_cache_misses_and_only_public_fields_are_persisted(isolated_forum_cache):
    async def exercise():
        await isolated_forum_cache.store.put('list:36:1', {'movies': [None], 'has_next': True}, 1800)
        assert await isolated_forum_cache.get_listing(36, 1) is None
        await isolated_forum_cache.store.put('post:1', {'status': 'ready', 'images': None, 'magnets': None}, 86400)
        assert await isolated_forum_cache.get_post('1') is None
        await isolated_forum_cache.store.put('post:1', {'status': 'ready', 'images': [], 'magnets': [{'link': 123}]}, 86400)
        assert await isolated_forum_cache.get_post('1') is None
        result = await forum.ForumPageJob(forum.ForumPageRequest(), client_factory=FakeBrowser, delay=0)(lambda _: None)
        await isolated_forum_cache.put_post({**result['movies'][0], 'cookie': 'private-token', 'raw_html': 'untrusted'})
        contents = ''.join(path.read_text() for path in isolated_forum_cache.store.directory.glob('*.json'))
        assert all(value not in contents for value in ['private-token', 'raw_html', 'cookie'])
    asyncio.run(exercise())
