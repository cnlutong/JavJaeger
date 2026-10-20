import asyncio
import json
import threading
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

import main
from modules.common.tasks import BackgroundTaskManager
from modules.webdav import service
from modules.webdav.schemas import AddDownloadsRequest


def test_cancel_waits_for_current_submission_and_retry_skips_acknowledged_paths(monkeypatch):
    entered, release = threading.Event(), threading.Event()
    sent = []
    class Dav:
        base_url, username, password, timeout_seconds = 'https://dav.test/', 'user', 'private', 10
        def __init__(self, *args): pass
        def list_directory(self, path):
            return [service.WebDavFile('same.mp4', path + '/' + str(i), False, 100) for i in range(3)]
        def _build_download_url(self, path): return 'https://dav.test' + path
        def build_aria2_options(self, options): return options
        def close(self): pass
    class Aria:
        def submit_file(self, url, options, gid, verify_only=False):
            sent.append(url)
            if len(sent) == 1:
                entered.set()
                assert release.wait(5)
            return gid
    monkeypatch.setattr(service, 'WebDavClient', Dav)
    async def exercise():
        manager = BackgroundTaskManager()
        payload = AddDownloadsRequest(files=[{'name': 'folder', 'path': '/folder', 'is_directory': True}], min_file_size_mb=0)
        runner = service.file_dispatch_runner(Dav(), Aria(), payload)
        task_id = manager.start_task('file-dispatch', runner, 'owner', cancellable=True, retryable=runner.can_retry)
        assert await asyncio.to_thread(entered.wait, 5)
        assert manager.cancel(task_id, 'other') is None
        assert manager.cancel(task_id, 'owner')['cancel_requested']
        assert manager.get_task(task_id, 'owner')['status'] == 'running'
        release.set()
        await asyncio.gather(*manager._running)
        stopped = manager.get_task(task_id, 'owner')
        assert stopped['status'] == 'cancelled'
        assert stopped['result']['results'][0]['success']
        assert len(sent) == 1 and stopped['can_retry']
        assert 'private' not in json.dumps(stopped)
        assert manager.retry(task_id, 'other') is None
        manager.retry(task_id, 'owner')
        with pytest.raises(ValueError): manager.retry(task_id, 'owner')
        await asyncio.gather(*manager._running)
        finished = manager.get_task(task_id, 'owner')
        assert finished['status'] == 'success' and not finished['can_retry']
        assert len(sent) == len(set(sent)) == 3
        assert len(finished['result']['results']) == 3
        assert manager.dismiss(task_id, 'owner')
        assert task_id not in manager._controls
    asyncio.run(exercise())


def test_failed_files_only_retry_and_ambiguous_acknowledgements_never_resubmit():
    from modules.webdav.clients import Aria2Client, SubmissionUnknown
    import aria2p
    accepted, calls = {}, []
    class Rpc:
        def add_uris(self, urls, options):
            calls.append(urls[0])
            if urls[0].endswith('/fail') and calls.count(urls[0]) == 1:
                raise aria2p.ClientException(1, 'rejected')
            if urls[0].endswith('/unknown'):
                raise TimeoutError('private-token')
            accepted[options['gid']] = SimpleNamespace(gid=options['gid'])
            if urls[0].endswith('/lost-ack'): raise TimeoutError('lost ACK')
            return accepted[options['gid']]
        def get_download(self, gid):
            if gid not in accepted: raise aria2p.ClientException(1, 'not found')
            return accepted[gid]
    aria = object.__new__(Aria2Client)
    aria.aria2 = Rpc()
    assert aria.submit_file('https://dav.test/lost-ack', {}, '1234567890abcdef') == '1234567890abcdef'
    with pytest.raises(SubmissionUnknown): aria.submit_file('https://dav.test/unknown', {}, '2234567890abcdef')
    with pytest.raises(SubmissionUnknown): aria.submit_file('https://dav.test/unknown', {}, '2234567890abcdef', verify_only=True)
    assert calls.count('https://dav.test/unknown') == 1
    async def exercise():
        payload = AddDownloadsRequest(files=[{'name': path, 'path': '/' + path} for path in ['ok', 'fail']], min_file_size_mb=0)
        dav = SimpleNamespace(_build_download_url=lambda path: 'https://dav.test' + path, build_aria2_options=lambda options: options)
        journal = service.FileDispatchJournal()
        first = await service.dispatch_files_to_aria2(dav, aria, payload, journal=journal)
        assert first['retryable'] and not first['success']
        second = await service.dispatch_files_to_aria2(dav, aria, payload, journal=journal)
        assert second['success'] and not second['retryable']
        assert calls.count('https://dav.test/ok') == 1 and calls.count('https://dav.test/fail') == 2
        uncertain = service.FileDispatchJournal()
        payload = AddDownloadsRequest(files=[{'name': 'unknown', 'path': '/unknown'}], min_file_size_mb=0)
        for _ in range(2):
            result = await service.dispatch_files_to_aria2(dav, aria, payload, journal=uncertain)
            assert result['results'][0]['error'] == 'submission_unknown'
        assert calls.count('https://dav.test/unknown') == 2  # One direct probe above, one journal submission.
        gid = result['results'][0]['gid']
        accepted[gid] = SimpleNamespace(gid=gid)
        recovered = await service.dispatch_files_to_aria2(dav, aria, payload, journal=uncertain)
        assert recovered['success'] and calls.count('https://dav.test/unknown') == 2
    asyncio.run(exercise())


def test_job_controls_are_owned_and_conflicting_requests_return_409(monkeypatch):
    from modules.system import router as system
    async def exercise():
        manager = BackgroundTaskManager()
        monkeypatch.setattr(system, 'background_tasks', manager)
        entered, release = asyncio.Event(), asyncio.Event()
        async def runner(progress):
            entered.set()
            await release.wait()
            progress({'message': 'checkpoint'})
            return {'success': False}
        async with AsyncClient(transport=ASGITransport(app=main.app), base_url='http://test') as owner:
            await owner.get('/api/system/jobs')
            from itsdangerous import TimestampSigner
            from modules.common.runtime import SESSION_SECRET
            import base64
            session = json.loads(base64.b64decode(TimestampSigner(SESSION_SECRET).unsign(owner.cookies['session'])))
            task_id = manager.start_task('test', runner, session['webdav_session_id'], cancellable=True, retryable=True)
            await entered.wait()
            async with AsyncClient(transport=ASGITransport(app=main.app), base_url='http://test') as other:
                for action in ['cancel', 'retry']:
                    assert (await other.post(f'/api/system/jobs/{task_id}/{action}')).status_code == 404
            assert (await owner.post(f'/api/system/jobs/{task_id}/retry')).status_code == 409
            assert (await owner.post(f'/api/system/jobs/{task_id}/cancel')).status_code == 200
            release.set()
            await asyncio.gather(*manager._running)
            assert (await owner.get('/api/system/jobs/' + task_id)).json()['status'] == 'cancelled'
            assert (await owner.post(f'/api/system/jobs/{task_id}/retry')).status_code == 200
            await asyncio.gather(*manager._running)
    asyncio.run(exercise())


def test_pan115_recursive_retry_skips_successful_ids_before_resolving_fresh_urls(monkeypatch):
    from modules.pan115 import service as pan115
    from unittest.mock import AsyncMock
    resolved, sent = [], []
    async def direct(code, **kwargs):
        resolved.append(code)
        return pan115.Pan115ResolvedDownload(name='same.mp4', url='https://cdn.test/' + code, headers=[])
    pan = SimpleNamespace(list_directory_all=AsyncMock(return_value={'items': [
        {'id': key, 'name': 'same.mp4', 'pick_code': key} for key in ['a', 'b']]}), resolve_direct_download=direct)
    async def resolve(entries, **kwargs):
        return await pan115._resolve_download_entries(pan, entries, **kwargs)
    monkeypatch.setattr(pan115, 'resolve_download_entries_from_config', resolve)
    class Aria:
        def submit_file(self, url, options, gid, verify_only=False):
            sent.append(url)
            if url.endswith('/b') and sent.count(url) == 1: raise ValueError('rejected')
            return gid
    async def exercise():
        payload = AddDownloadsRequest(files=[{'source_type': 'pan115', 'name': 'folder', 'path': 'root', 'is_directory': True}], min_file_size_mb=0)
        journal = service.FileDispatchJournal()
        first = await service.dispatch_files_to_aria2(None, Aria(), payload, journal=journal)
        assert not first['success'] and len(first['results']) == 2
        second = await service.dispatch_files_to_aria2(None, Aria(), payload, journal=journal)
        assert second['success'] and len(second['results']) == 2
        assert resolved == ['a', 'b', 'b']
        assert sent == ['https://cdn.test/a', 'https://cdn.test/b', 'https://cdn.test/b']
        payload = AddDownloadsRequest(files=[{'source_type': 'pan115', 'name': 'same.mp4', 'pick_code': code, 'path': ''} for code in ['a', 'b']], min_file_size_mb=0)
        journal = service.FileDispatchJournal()
        for _ in range(2):
            result = await service.dispatch_files_to_aria2(None, Aria(), payload, journal=journal)
            assert result['success'] and len(result['results']) == 2
        assert resolved == ['a', 'b', 'b', 'a', 'b']
    asyncio.run(exercise())
