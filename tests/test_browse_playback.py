import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.responses import Response

import main
from modules.automation import playback
from modules.common.tasks import BackgroundTaskManager


HASH = 'a' * 40
MAGNET = {'link': f'magnet:?xt=urn:btih:{HASH}', 'source': 'javbus'}
VIDEO = {'name': 'QA-1.mp4', 'pick_code': 'play-pick', 'size': 1024}


def configure(monkeypatch, client):
    monkeypatch.setattr(playback.runtime, 'get_pan115_config', lambda: {
        'enabled': True, 'cookie': 'UID=account;CID=private;SEID=private', 'save_dir_id': '42'})
    monkeypatch.setattr(playback.pan115, 'Pan115Client', lambda cookie: client)
    select = AsyncMock(return_value=MAGNET.copy())
    monkeypatch.setattr(playback, 'get_best_magnet_payload', select)
    record = AsyncMock()
    monkeypatch.setattr(playback.download_history_service, 'record_dispatch_results', record)
    return select, record


def fake_client(tasks):
    return SimpleNamespace(user_id='account',
        get_offline_task=AsyncMock(side_effect=tasks),
        add_offline_tasks=AsyncMock(return_value=[{'success': True, 'info_hash': HASH}]),
        find_playable_file=AsyncMock(return_value=VIDEO))


def test_playback_waits_for_completed_task_and_ready_file_without_exposing_secrets(monkeypatch):
    client = fake_client([None, {'status': 'downloading', 'progress': 65},
                          {'status': 'completed'}, {'status': 'completed'}])
    client.find_playable_file.side_effect = [None, VIDEO]
    select, record = configure(monkeypatch, client)
    sleep = AsyncMock()
    monkeypatch.setattr(playback, 'poll_delay', sleep)
    events = []
    runner = playback.playback_runner('QA-1')
    result = asyncio.run(runner(events.append))
    assert result == {'success': True, 'movie_id': 'QA-1', 'file_name': 'QA-1.mp4',
                      'pick_code': 'play-pick', 'account_id': 'account', 'message': '视频已就绪，可以播放'}
    select.assert_awaited_once_with('QA-1', exclude_history_links=False)
    client.add_offline_tasks.assert_awaited_once_with([MAGNET['link']], save_dir_id='42')
    assert sleep.await_count == 3
    assert any(event.get('completed') == 65 for event in events)
    assert record.await_count == 1 and not runner.can_retry()
    public = json.dumps([result, events])
    assert 'private' not in public and 'https://' not in public and 'magnet:' not in public


def test_playback_reuses_existing_completed_cloud_task(monkeypatch):
    client = fake_client([{'status': 'completed'}])
    configure(monkeypatch, client)
    result = asyncio.run(playback.playback_runner('QA-1')(lambda event: None))
    assert result['success']
    client.add_offline_tasks.assert_not_awaited()


@pytest.mark.parametrize('timeout', [60, 2])
def test_playback_polls_no_faster_than_fifteen_seconds_unless_deadline_is_nearer(monkeypatch, timeout):
    client = fake_client([{'status': 'downloading', 'progress': 10}, {'status': 'completed'}])
    configure(monkeypatch, client)
    sleep = AsyncMock()
    monkeypatch.setattr(playback, 'poll_delay', sleep)
    monkeypatch.setattr(playback, 'PLAYBACK_WAIT_SECONDS', timeout)
    result = asyncio.run(playback.playback_runner('QA-1')(lambda event: None))
    assert result['success']
    sleep.assert_awaited_once()
    delay = sleep.await_args.args[0]
    assert delay == 15 if timeout >= 15 else 0 < delay <= timeout


def test_running_playback_snapshot_identifies_movie_without_claiming_readiness(monkeypatch):
    async def exercise():
        client = fake_client([])
        entered, release = asyncio.Event(), asyncio.Event()

        async def lookup(info_hash):
            entered.set()
            await release.wait()
            return {'status': 'completed'}

        client.get_offline_task.side_effect = lookup
        configure(monkeypatch, client)
        manager = BackgroundTaskManager()
        task_id = manager.start_task('browse-play', playback.playback_runner('QA-1'), 'owner')
        await entered.wait()
        snapshot = manager.get_task(task_id, 'owner')
        assert snapshot['status'] == 'running' and snapshot['result'] == {'movie_id': 'QA-1'}
        release.set()
        await asyncio.gather(*manager._running)
        assert manager.get_task(task_id, 'owner')['result']['success']
    asyncio.run(exercise())


def test_playback_cancel_after_submission_retries_same_task_without_resubmitting(monkeypatch):
    async def exercise():
        client = fake_client([None, {'status': 'completed'}])
        configure(monkeypatch, client)
        manager = BackgroundTaskManager()
        runner = playback.playback_runner('QA-1')
        entered, release = asyncio.Event(), asyncio.Event()

        async def submit(*args, **kwargs):
            entered.set()
            await release.wait()
            return [{'success': True, 'info_hash': HASH}]

        client.add_offline_tasks.side_effect = submit
        task_id = manager.start_task('browse-play', runner, 'owner', cancellable=True,
                                     retryable=runner.can_retry)
        await entered.wait()
        assert manager.cancel(task_id, 'other') is None
        manager.cancel(task_id, 'owner')
        release.set()
        await asyncio.gather(*manager._running)
        assert manager.get_task(task_id, 'owner')['status'] == 'cancelled'
        manager.retry(task_id, 'owner')
        await asyncio.gather(*manager._running)
        assert manager.get_task(task_id, 'owner')['status'] == 'success'
        assert client.add_offline_tasks.await_count == 1
    asyncio.run(exercise())


def test_playback_lost_submission_acknowledgement_never_resubmits_on_retry(monkeypatch):
    client = fake_client([None, {'status': 'completed'}])
    client.add_offline_tasks.side_effect = TimeoutError('Cookie=private https://signed.test/token')
    configure(monkeypatch, client)
    runner = playback.playback_runner('QA-1')
    first = asyncio.run(runner(lambda event: None))
    assert not first['success'] and runner.can_retry()
    second = asyncio.run(runner(lambda event: None))
    assert second['success']
    assert client.add_offline_tasks.await_count == 1
    assert 'private' not in json.dumps(first)


def test_playback_explicit_submission_rejection_can_resubmit_on_retry(monkeypatch):
    client = fake_client([None, None, {'status': 'completed'}])
    client.add_offline_tasks.side_effect = [[{'success': False, 'rejected': True}], [{'success': True}]]
    select, record = configure(monkeypatch, client)
    monkeypatch.setattr(playback, 'poll_delay', AsyncMock())
    runner = playback.playback_runner('QA-1')
    first = asyncio.run(runner(lambda event: None))
    assert not first['success'] and runner.can_retry()
    second = asyncio.run(runner(lambda event: None))
    assert second['success']
    assert client.add_offline_tasks.await_count == 2
    assert select.await_count == record.await_count == 1


@pytest.mark.parametrize('acknowledgement', [[], [None], [{}], [{'success': False}],
                                          [{'success': False, 'rejected': False}]])
def test_playback_unknown_submission_acknowledgement_never_resubmits(monkeypatch, acknowledgement):
    client = fake_client([None, {'status': 'completed'}])
    client.add_offline_tasks.return_value = acknowledgement
    configure(monkeypatch, client)
    runner = playback.playback_runner('QA-1')
    assert not asyncio.run(runner(lambda event: None))['success']
    assert asyncio.run(runner(lambda event: None))['success']
    assert client.add_offline_tasks.await_count == 1


def test_playback_does_not_resubmit_an_observed_task_that_later_disappears(monkeypatch):
    client = fake_client([{'status': 'failed'}, None])
    configure(monkeypatch, client)
    monkeypatch.setattr(playback, 'PLAYBACK_WAIT_SECONDS', 0)
    runner = playback.playback_runner('QA-1')
    for _ in range(2):
        assert not asyncio.run(runner(lambda event: None))['success']
    client.add_offline_tasks.assert_not_awaited()


@pytest.mark.parametrize('task,video,message', [
    ({'status': 'failed', 'message': 'Cookie=private'}, None, '离线下载失败'),
    ({'status': 'downloading', 'progress': 20}, None, '等待超时'),
    ({'status': 'completed'}, None, '等待超时'),
])
def test_playback_failure_and_timeout_never_claim_ready(monkeypatch, task, video, message):
    client = fake_client([])
    client.get_offline_task.side_effect = None
    client.get_offline_task.return_value = task
    client.find_playable_file.return_value = video
    configure(monkeypatch, client)
    monkeypatch.setattr(playback, 'PLAYBACK_WAIT_SECONDS', 0)
    result = asyncio.run(playback.playback_runner('QA-1')(lambda event: None))
    assert not result['success'] and message in result['message']
    assert 'pick_code' not in result and 'private' not in json.dumps(result)


def test_playback_job_routes_validate_input_ownership_conflicts_and_ready_stream(monkeypatch, caplog):
    from modules.automation import router
    from modules.common import tasks
    from modules.system import router as system

    async def exercise():
        manager = BackgroundTaskManager()
        monkeypatch.setattr(tasks, 'background_tasks', manager)
        monkeypatch.setattr(system, 'background_tasks', manager)
        monkeypatch.setattr(playback, 'background_tasks', manager)
        entered, release = asyncio.Event(), asyncio.Event()

        async def runner(progress):
            entered.set()
            await release.wait()
            return {'success': True, 'movie_id': 'QA-1', 'file_name': 'QA-1.mp4',
                    'pick_code': 'play-pick', 'account_id': 'account'}

        runner.can_retry = lambda: True
        monkeypatch.setattr(router, 'playback_runner', lambda movie_id: runner)
        stream = AsyncMock(return_value=Response(b'video', media_type='video/mp4'))
        monkeypatch.setattr(playback.pan115, 'stream_playback', stream, raising=False)
        async with AsyncClient(transport=ASGITransport(app=main.app), base_url='http://test') as owner:
            for movie_id in ['../QA-1', 'QA-1?cookie=x', 'QA/1', '']:
                assert (await owner.post('/api/automation/play-jobs', json={'movie_id': movie_id})).status_code == 422
            response = await owner.post('/api/automation/play-jobs', json={'movie_id': 'qa-1'})
            assert response.status_code == 202
            task_id = response.json()['task_id']
            await entered.wait()
            path = f'/api/automation/play-jobs/{task_id}/stream'
            assert (await owner.get(path)).status_code == 409
            assert (await owner.post('/api/automation/play-jobs', json={'movie_id': 'QA-2'})).status_code == 409
            async with AsyncClient(transport=ASGITransport(app=main.app), base_url='http://test') as other:
                assert (await other.get(path)).status_code == 404
                assert (await other.get('/api/system/jobs/' + task_id)).status_code == 404
            release.set()
            await asyncio.gather(*manager._running)
            response = await owner.get(path, headers={'Range': 'bytes=0-3'})
            assert response.status_code == 200 and response.content == b'video'
            stream.assert_awaited_once_with('play-pick', 'account', range_header='bytes=0-3')
            for code, status in [('pan115_account_changed', 409), ('pan115_range_invalid', 416),
                                 ('pan115_not_configured', 400), ('pan115_playback_unavailable', 502)]:
                stream.side_effect = playback.pan115.Pan115Error(code, 'Cookie=private https://signed.test/token')
                response = await owner.get(path)
                assert response.status_code == status
                assert 'private' not in response.text and 'signed.test' not in response.text
    asyncio.run(exercise())
    assert 'private' not in caplog.text and 'signed.test' not in caplog.text
