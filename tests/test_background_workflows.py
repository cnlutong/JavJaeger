import asyncio
import json

import pytest
from httpx import ASGITransport, AsyncClient

import main
from modules.common.tasks import BackgroundTaskManager, background_tasks


def test_background_work_survives_its_submitter_and_is_owned_and_bounded():
    async def exercise():
        manager = BackgroundTaskManager(max_tasks=1)
        entered, release = asyncio.Event(), asyncio.Event()

        async def work(progress):
            entered.set()
            await release.wait()
            progress({'completed': 1, 'total': 1, 'message': 'done'})
            return {'success': True, 'results': [{'name': 'public result'}]}

        task_id = manager.start_task('dispatch', work, owner='a')
        await entered.wait()
        assert manager.get_task(task_id, owner='b') is None
        assert manager.list_tasks('a')[0]['task_id'] == task_id
        assert manager.list_tasks('b') == []
        with pytest.raises(ValueError):
            manager.start_task('dispatch', work, owner='a')
        release.set()
        await asyncio.gather(*manager._running)
        assert manager.get_task(task_id, owner='a')['status'] == 'success'
        assert not manager._running
        assert manager.dismiss(task_id, 'b') is False
        assert manager.dismiss(task_id, 'a') is True
    asyncio.run(exercise())


def test_progress_keeps_phase_counts_and_failure_does_not_claim_completion():
    async def exercise():
        manager = BackgroundTaskManager()
        async def work(progress):
            progress({'phase': 'dispatch', 'completed': 1, 'total': 4, 'message': '已提交 1/4'})
            progress({'phase': 'dispatch', 'message': '等待下一项响应'})
            snapshot = next(iter(manager._tasks.values()))
            assert (snapshot['completed'], snapshot['total'], snapshot['percent']) == (1, 4, 25)
            return {'success': False, 'message': '提交中断'}
        task_id = manager.start_task('file-dispatch', work, owner='a')
        await asyncio.gather(*manager._running)
        snapshot = manager.get_task(task_id, 'a')
        assert snapshot['status'] == 'failed' and snapshot['percent'] == 25
        assert snapshot['logs'][-1]['message'] == '提交中断'
    asyncio.run(exercise())


def test_folder_resolution_and_aria2_submission_publish_live_file_events():
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from modules.pan115 import service as pan115
    from modules.webdav import service as webdav
    from modules.webdav.schemas import AddDownloadsRequest
    events = []
    client = SimpleNamespace(list_directory_all=AsyncMock(return_value={'items': [
        {'id': 'video', 'name': 'a.mp4', 'size': 2 * 1024 ** 3, 'pick_code': 'pick'},
        {'id': 'text', 'name': 'a.txt', 'size': 100, 'pick_code': 'text'}]}),
        resolve_direct_download=AsyncMock(return_value=SimpleNamespace(name='a.mp4', url='https://cdn.test/signed', headers=[])))
    async def resolve(files, video_filter, min_file_size_mb, progress_callback=None):
        return await pan115._resolve_download_entries(client, files, video_filter, min_file_size_mb, progress_callback)
    async def exercise():
        from unittest.mock import patch
        payload = AddDownloadsRequest(files=[{'path': 'folder', 'name': 'root', 'is_directory': True, 'source_type': 'pan115'}], video_filter=True, min_file_size_mb=1536)
        aria = SimpleNamespace(add_download=lambda *args: 'gid')
        with patch.object(pan115, 'resolve_download_entries_from_config', resolve):
            result = await webdav.dispatch_files_to_aria2(None, aria, payload, events.append)
        assert result['success']
    asyncio.run(exercise())
    assert any(event['phase'] == 'scan' and 'root' in event['message'] for event in events)
    assert any(event['phase'] == 'resolve' and 'a.mp4' in event['message'] for event in events)
    assert any('跳过' in event['message'] and 'a.txt' in event['message'] for event in events)
    assert any(event['phase'] == 'dispatch' and event.get('completed') == event.get('total') == 1 for event in events)
    assert 'https://' not in json.dumps(events)


def test_background_errors_do_not_publish_credentials_and_finished_jobs_do_not_evict_running_work():
    async def exercise():
        manager = BackgroundTaskManager(max_tasks=1)
        release = asyncio.Event()

        async def active(progress):
            await release.wait()
            return {'success': True}

        async def fails(progress):
            raise RuntimeError('password=private-password https://user:secret@example.test/')

        running = manager.start_task('long', active, owner='a')
        failed = manager.start_task('test', fails, owner='a')
        await asyncio.sleep(0)
        snapshot = manager.get_task(failed, owner='a')
        assert snapshot['status'] == 'failed' and snapshot['error'] == 'task_failed'
        assert 'private-password' not in json.dumps(snapshot)
        assert manager.get_task(running, owner='a')['status'] == 'running'
        release.set()
        await asyncio.gather(*manager._running)
        assert manager.get_task(failed, owner='a') is None
        assert manager.get_task(running, owner='a')['status'] == 'success'
    asyncio.run(exercise())


def test_dispatch_preflight_and_submission_continue_after_refresh_with_session_isolation(monkeypatch):
    from modules.automation import service

    async def exercise():
        entered, release = asyncio.Event(), asyncio.Event()
        sent = []

        async def batch(payload):
            entered.set()
            await release.wait()
            return {'success': True, 'results': [{'movie_id': 'QA-1', 'best_magnet': {'link': 'magnet:qa', 'source': 'javbus'}}]}

        async def download(payload):
            sent.append(payload.magnet_links)
            return {'success': True, 'results': [{'movie_id': 'QA-1', 'magnet': 'magnet:qa', 'success': True}]}

        monkeypatch.setattr(service, 'get_batch_movies_payload', batch)
        monkeypatch.setattr(service, 'pikpak_download', download)
        async with AsyncClient(transport=ASGITransport(app=main.app), base_url='http://test') as browser:
            response = await browser.post('/api/automation/dispatch-jobs', json={'tool': 'pikpak', 'movie_ids': ['QA-1'], 'username': 'fixture', 'password': 'private-password'})
            assert response.status_code == 202
            task_id = response.json()['task_id']
            await entered.wait()
            restored = (await browser.get('/api/system/jobs')).json()['tasks']
            assert any(task['task_id'] == task_id for task in restored)
            collection = await browser.get('/api/system/jobs')
            assert (await browser.get('/api/system/jobs', headers={'If-None-Match': collection.headers['ETag']})).status_code == 304
            async with AsyncClient(transport=ASGITransport(app=main.app), base_url='http://test') as other:
                assert (await other.get('/api/system/jobs')).json()['tasks'] == []
                assert (await other.get('/api/system/jobs/' + task_id)).status_code == 404
            release.set()
            await asyncio.gather(*background_tasks._running)
            result = (await browser.get('/api/system/jobs/' + task_id)).json()
            assert result['status'] == 'success'
            assert (await browser.get('/api/system/jobs', headers={'If-None-Match': collection.headers['ETag']})).status_code == 200
            assert sent == [['magnet:qa']]
            assert 'private-password' not in json.dumps(result)
    asyncio.run(exercise())


def test_search_enrichment_continues_on_server_with_four_requests_and_preserves_cover_on_failure(monkeypatch):
    from modules.movies import background
    from modules.movies.schemas import SearchEnrichmentRequest

    async def exercise():
        entered, release = asyncio.Event(), asyncio.Event()
        active = maximum = 0

        async def detail(code):
            nonlocal active, maximum
            active += 1; maximum = max(maximum, active)
            if active == 4: entered.set()
            await release.wait()
            active -= 1
            return {'id': code, 'title': 'full title', 'img': '', 'stars': [{'name': 'Actor'}]}

        async def magnets(code, query):
            assert query['source'] == 'javbus'
            return [{'link': 'magnet:' + code}]

        monkeypatch.setattr(background, 'get_movie_detail', detail)
        monkeypatch.setattr(background, 'get_magnets_payload', magnets)
        payload = SearchEnrichmentRequest(movies=[{'id': f'QA-{i}', 'img': 'https://www.javbus.com/cover.jpg'} for i in range(8)])
        updates = []
        worker = asyncio.create_task(background.enrich_search(payload, updates.append))
        await entered.wait()
        assert not worker.done()
        release.set()
        result = await worker
        assert maximum == 4
        assert len(result['movies']) == 8 and len(result['magnets']) == 8
        assert all(movie['img'].endswith('cover.jpg') and movie['stars'][0]['name'] == 'Actor' for movie in result['movies'])
        assert updates[0]['result']['movies'] and updates[-1]['completed'] == 8
    asyncio.run(exercise())


def test_file_dispatch_owns_a_private_connection_snapshot_until_completion(monkeypatch):
    from types import SimpleNamespace
    from modules.webdav import service
    from modules.webdav.schemas import AddDownloadsRequest

    async def exercise():
        entered, release = asyncio.Event(), asyncio.Event()
        original = SimpleNamespace(base_url='https://dav.test', username='u', password='private-password', timeout_seconds=30, closed=False)
        clones = []

        class Clone:
            def __init__(self, url, username, password, timeout_seconds):
                self.closed = False
                assert (url, username, password, timeout_seconds) == ('https://dav.test', 'u', 'private-password', 30)
                clones.append(self)
            def close(self): self.closed = True

        async def dispatch(webdav, aria2, payload, progress_callback=None):
            entered.set()
            await release.wait()
            assert original.closed and not webdav.closed
            return {'success': True, 'results': [{'filename': 'fixture.mp4', 'success': True}]}

        monkeypatch.setattr(service, 'WebDavClient', Clone)
        monkeypatch.setattr(service, 'dispatch_files_to_aria2', dispatch)
        runner = service.file_dispatch_runner(original, object(), AddDownloadsRequest(files=[]))
        worker = asyncio.create_task(runner(lambda event: None))
        await entered.wait()
        original.closed = True
        release.set()
        assert (await worker)['success']
        assert clones[0].closed
    asyncio.run(exercise())


def test_one_slow_movie_does_not_hold_back_other_search_results(monkeypatch):
    from modules.movies import background
    from modules.movies.schemas import SearchEnrichmentRequest

    async def exercise():
        release, published = asyncio.Event(), asyncio.Event()
        async def detail(code):
            if code == 'slow': await release.wait()
            return {'id': code.upper(), 'stars': ['Actor']}
        async def magnets(code, query): return []
        def progress(event):
            if 'FAST' in event.get('result', {}).get('completed_ids', []): published.set()
        monkeypatch.setattr(background, 'get_movie_detail', detail)
        monkeypatch.setattr(background, 'get_magnets_payload', magnets)
        worker = asyncio.create_task(background.enrich_search(SearchEnrichmentRequest(movies=[{'id': 'slow'}, {'id': 'fast'}]), progress))
        try:
            await asyncio.wait_for(published.wait(), .1)
            assert not worker.done()
        finally:
            release.set()
            result = await worker
        assert set(result['details_ready']) == {'FAST', 'SLOW'}
        assert set(result['magnets']) == {'FAST', 'SLOW'}
    asyncio.run(exercise())


def test_failed_preflight_cannot_be_reported_as_a_successful_empty_dispatch(monkeypatch):
    from modules.automation import service
    from modules.automation.schemas import OneOffDispatchRequest
    async def failed(payload): return {'success': False, 'error': 'batch_failed', 'results': []}
    monkeypatch.setattr(service, 'get_batch_movies_payload', failed)
    result = asyncio.run(service.dispatch_once(OneOffDispatchRequest(tool='aria2', movie_ids=['QA-1']), None, lambda event: None))
    assert not result['success']
    assert result['tool'] == 'aria2'


def test_search_summaries_accept_missing_optional_provider_fields():
    from modules.movies.schemas import SearchEnrichmentRequest
    payload = SearchEnrichmentRequest(movies=[{'id': 'QA-1', 'title': None, 'img': None, 'date': None}])
    assert payload.movies[0].id == 'QA-1'


def test_background_aria2_dispatch_keeps_the_original_session_connection(monkeypatch):
    from modules.automation import service
    from modules.webdav import router

    async def exercise():
        entered, release = asyncio.Event(), asyncio.Event()
        clients, sent = [], []
        class Client:
            def __init__(self, url, secret): self.url = url; clients.append(self)
            def test_connection(self): return True
        async def dispatch(client, links, codes, sources):
            entered.set(); await release.wait()
            sent.append((client, links))
            return [{'movie_id': codes[0], 'success': True}]
        monkeypatch.setattr(router, 'Aria2Client', Client)
        monkeypatch.setattr(service, 'dispatch_magnet_downloads_to_aria2', dispatch)
        async with AsyncClient(transport=ASGITransport(app=main.app), base_url='http://test') as browser:
            await browser.post('/api/aria2/connect', data={'aria2_url': 'http://first.test', 'aria2_secret': 'private'})
            response = await browser.post('/api/automation/dispatch-jobs', json={'tool': 'aria2', 'movie_ids': ['QA-1'], 'magnet_links': ['magnet:qa']})
            assert response.status_code == 202
            await entered.wait()
            await browser.post('/api/aria2/connect', data={'aria2_url': 'http://replacement.test'})
            async with AsyncClient(transport=ASGITransport(app=main.app), base_url='http://test') as other:
                await other.post('/api/aria2/connect', data={'aria2_url': 'http://other.test'})
                assert (await other.get('/api/system/jobs')).json()['tasks'] == []
            release.set(); await asyncio.gather(*background_tasks._running)
            assert sent == [(clients[0], ['magnet:qa'])]
    asyncio.run(exercise())


def test_dispatch_interruption_preserves_submitted_rows_and_records_only_remaining_failures(monkeypatch):
    from modules.automation import service
    from modules.automation.schemas import OneOffDispatchRequest
    recorded = []
    async def interrupted(payload, progress_callback):
        await progress_callback({'completed_count': 1, 'results': [{'movie_id': 'QA-1', 'magnet': 'magnet:one', 'success': True}]})
        raise RuntimeError('private-password')
    async def record(rows, tool): recorded.extend(rows)
    monkeypatch.setattr(service, 'pan115_download', interrupted)
    monkeypatch.setattr(service.download_history_service, 'record_dispatch_results', record)
    result = asyncio.run(service.dispatch_once(OneOffDispatchRequest(tool='pan115', movie_ids=['QA-1', 'QA-2'], magnet_links=['magnet:one', 'magnet:two']), None, lambda event: None))
    assert not result['success']
    assert result['results'][0]['success'] is True
    assert [row['movie_id'] for row in recorded] == ['QA-2']
    assert 'private-password' not in json.dumps(result)
