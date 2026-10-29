"""The two requested groups share one whitelist for jobs and public cache reads."""
import asyncio
import json
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from modules.movies import forum
from test_forum_movies import FakeBrowser

CATALOGUE = json.loads((Path(__file__).parent / 'fixtures/forum_sources.json').read_text())


def test_sources_include_every_section_in_the_requested_groups():
    assert forum.forum_sources() == CATALOGUE


@pytest.mark.parametrize('section', CATALOGUE['forums'], ids=lambda section: str(section['id']))
def test_every_section_can_create_a_filtered_job_and_reuse_its_own_page_cache(tmp_path, monkeypatch, section):
    import main
    from modules.movies import router
    from modules.common.tasks import background_tasks
    cache = forum.ForumCache(tmp_path)
    monkeypatch.setattr(forum, 'forum_cache', cache)
    board = section['id']

    class SectionBrowser(FakeBrowser):
        async def fetch_html(self, url):
            result = await super().fetch_html(url)
            return result.replace('forum-36-2.html', f'forum-{board}-2.html') if 'forum-' in url else result

    browser = SectionBrowser()
    monkeypatch.setattr(router, 'ForumPageJob', lambda payload: forum.ForumPageJob(payload, cache=cache, client_factory=lambda: browser, delay=0))

    async def exercise():
        async with AsyncClient(transport=ASGITransport(app=main.app), base_url='http://test') as client:
            created = await client.post('/api/movies/forum/jobs', json={'forum_id': board, 'keywords': ['LTX']})
            assert created.status_code == 202
            await asyncio.gather(*background_tasks._running)
            task = (await client.get('/api/system/jobs/' + created.json()['task_id'])).json()
            assert task['result']['forum_name'] == section['name'] and task['result']['has_next']
            assert browser.calls == [f'https://dmn12.vip/forum-{board}-1.html', 'https://dmn12.vip/thread-1-1-1.html']
            # Fetching matching details must not turn a partial page into a full cache hit.
            response = await client.get(f'/api/movies/forum/cache?forum_id={board}&page=1')
            assert response.status_code == 200 and not response.json()['cached']
            await forum.ForumPageJob(forum.ForumPageRequest(forum_id=board), cache=cache,
                                    client_factory=lambda: browser, delay=0)(lambda _: None)
            assert browser.calls[-1] == 'https://dmn12.vip/thread-2-1-1.html'
            cached = await client.get(f'/api/movies/forum/cache?forum_id={board}&page=1')
            assert cached.json()['cached'] and cached.json()['result']['forum_id'] == board
            assert cached.headers['cache-control'] == 'no-store'
            other = 103 if board != 103 else 36
            assert not (await client.get(f'/api/movies/forum/cache?forum_id={other}&page=1')).json()['cached']

    asyncio.run(exercise())


@pytest.mark.parametrize('value', ['999', '171', '41', 'https://example.invalid', '0', '-1'])
def test_unlisted_sections_remain_rejected_for_jobs_and_cache(value):
    import main

    async def exercise():
        async with AsyncClient(transport=ASGITransport(app=main.app), base_url='http://test') as client:
            assert (await client.get('/api/movies/forum/cache', params={'forum_id': value})).status_code == 422
            assert (await client.post('/api/movies/forum/jobs', json={'forum_id': value})).status_code == 422

    asyncio.run(exercise())
