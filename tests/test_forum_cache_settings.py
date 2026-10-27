import asyncio

import pytest
from httpx import ASGITransport, AsyncClient

from modules.movies import forum
from test_forum_movies import FakeBrowser


def test_forum_policy_survives_restart_and_changes_existing_record_expiry(tmp_path):
    async def exercise():
        now = [100000.0]
        cache = forum.ForumCache(tmp_path, clock=lambda: now[0])
        await forum.ForumPageJob(forum.ForumPageRequest(), cache=cache, client_factory=FakeBrowser, delay=0)(lambda _: None)
        status = await cache.configure({'list_minutes': 60, 'post_hours': 48, 'mb': 8})
        assert status['count'] == 3 and status['settings']['mb'] == 8
        now[0] += 2400
        restarted = forum.ForumCache(tmp_path, clock=lambda: now[0])
        page = await restarted.get_page(36, 1)
        assert page is not None and page['cache']['list_ttl_seconds'] == 3600
        assert page['cache']['post_ttl_seconds'] == 172800
        status = await restarted.configure({'list_minutes': 1, 'post_hours': 1, 'mb': 8})
        assert status['count'] == 2 and await restarted.get_page(36, 1) is None
        now[0] += 1201
        assert (await restarted.status())['count'] == 0
    asyncio.run(exercise())


def test_forum_capacity_reduction_prunes_immediately_and_clear_keeps_settings(tmp_path):
    async def exercise():
        cache = forum.ForumCache(tmp_path)
        for index in range(3):
            await cache.store.put(f'post:{index}', {'text': 'x' * 600000}, 86400)
        status = await cache.configure({'list_minutes': 10, 'post_hours': 2, 'mb': 1})
        assert status['count'] == 1 and status['size_bytes'] <= 1024 ** 2
        unrelated = tmp_path / 'unrelated.json'
        unrelated.write_text('keep')
        cleared = await cache.clear()
        assert cleared['count'] == 0 and cleared['size_bytes'] == 0
        assert unrelated.read_text() == 'keep'
        assert (await forum.ForumCache(tmp_path).status())['settings'] == {'list_minutes': 10, 'post_hours': 2, 'mb': 1}
    asyncio.run(exercise())


@pytest.mark.parametrize('bad', [None, [], {}, {'list_minutes': 0, 'post_hours': 24, 'mb': 32},
    {'list_minutes': 30, 'post_hours': -1, 'mb': 32}, {'list_minutes': 30, 'post_hours': 24, 'mb': 0},
    {'list_minutes': True, 'post_hours': 24, 'mb': 32}, {'list_minutes': '30', 'post_hours': 24, 'mb': 32},
    {'list_minutes': 30, 'post_hours': 1.5, 'mb': 32}])
def test_invalid_forum_settings_never_replace_the_saved_policy(tmp_path, bad):
    async def exercise():
        cache = forum.ForumCache(tmp_path)
        await cache.configure({'list_minutes': 15, 'post_hours': 12, 'mb': 4})
        with pytest.raises(ValueError):
            await cache.configure(bad)
        assert (await cache.status())['settings'] == {'list_minutes': 15, 'post_hours': 12, 'mb': 4}
    asyncio.run(exercise())


def test_forum_settings_routes_save_clear_and_report_write_failure(tmp_path, monkeypatch):
    import main
    cache = forum.ForumCache(tmp_path)
    monkeypatch.setattr(forum, 'forum_cache', cache)
    async def exercise():
        async with AsyncClient(transport=ASGITransport(app=main.app), base_url='http://test') as client:
            url = '/api/movies/forum/cache/settings'
            initial = await client.get(url)
            assert initial.status_code == 200 and initial.json()['settings'] == {'list_minutes': 30, 'post_hours': 24, 'mb': 32}
            assert initial.headers['cache-control'] == 'no-store'
            saved = {'list_minutes': 5, 'post_hours': 6, 'mb': 2}
            assert (await client.put(url, json=saved)).json()['settings'] == saved
            await forum.ForumPageJob(forum.ForumPageRequest(), client_factory=FakeBrowser, delay=0)(lambda _: None)
            assert (await client.get(url)).json()['count'] == 3
            assert (await client.delete('/api/movies/forum/cache')).json()['count'] == 0
            assert (await client.get('/api/movies/forum/cache')).json()['cached'] is False
            assert (await client.put(url, json={**saved, 'mb': 0})).status_code == 400
            def denied(*args):
                raise PermissionError('private-token')
            monkeypatch.setattr(cache.store, '_atomic_write', denied)
            response = await client.put(url, json={**saved, 'mb': 3})
            assert response.status_code == 500 and 'private-token' not in response.text
            assert (await client.get(url)).json()['settings'] == saved
    asyncio.run(exercise())
