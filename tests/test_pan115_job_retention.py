import asyncio

import pytest

from modules.pan115 import service
from modules.pan115.schemas import DownloadRequest


@pytest.mark.parametrize('fails', [False, True])
def test_jobs_keep_only_recent_finished_results_in_completion_order_and_preserve_active_work(monkeypatch, fails):
    async def exercise():
        manager = service.Pan115DownloadJobManager(max_jobs=2)
        releases = [asyncio.Event() for _ in range(4)]

        async def download(request, progress_callback=None):
            index = int(request.movie_ids[0].removeprefix('QA-'))
            await releases[index].wait()
            if fails:
                raise OSError('fixture dispatch failure')
            return {'success': True, 'results': [{'movie_id': request.movie_ids[0], 'success': True}]}

        async def record_results(*args):
            pass

        monkeypatch.setattr(service, 'download', download)
        monkeypatch.setattr(service.download_history_service, 'record_dispatch_results', record_results)
        job_ids = [manager.submit(DownloadRequest(
            magnet_links=[f'magnet:?xt=urn:btih:{index:040x}'], movie_ids=[f'QA-{index}']))['job_id'] for index in range(4)]
        assert all(manager.get(job_id)['status'] == 'queued' for job_id in job_ids)
        await asyncio.sleep(0)
        assert len(manager._jobs) == 4
        completed = []
        try:
            # The oldest submitted job finishes last and must become the newest result.
            for index in [1, 2, 3, 0]:
                releases[index].set()
                await asyncio.sleep(0)
                completed.append(job_ids[index])
                active = [job_id for job_id in job_ids if job_id not in completed]
                assert all(manager.get(job_id)['status'] == 'running' for job_id in active)
                assert len(manager._jobs) == len(active) + min(2, len(completed))
                newest = manager.get(job_ids[index])
                assert newest['status'] == ('failed' if fails else 'completed')
                assert newest['completed_count'] == 1
                assert newest['result']['results'][0]['movie_id'] == f'QA-{index}'
                for expired in completed[:-2]:
                    with pytest.raises(service.Pan115Error) as error:
                        manager.get(expired)
                    assert error.value.code == 'pan115_job_not_found'
            assert manager.get(job_ids[0])['status'] == ('failed' if fails else 'completed')
        finally:
            for release in releases:
                release.set()
            await asyncio.sleep(0)
    asyncio.run(exercise())


@pytest.mark.parametrize('history_fails', [False, True])
def test_a_failed_job_is_active_until_its_history_write_finishes(monkeypatch, history_fails):
    async def exercise():
        manager = service.Pan115DownloadJobManager(max_jobs=1)
        entered, release = asyncio.Event(), asyncio.Event()
        started = []
        create_task = asyncio.create_task

        def track_task(coroutine):
            task = create_task(coroutine)
            started.append(task)
            return task

        async def download(request, progress_callback=None):
            if request.movie_ids == ['QA-FAILED']:
                raise OSError('fixture dispatch failure')
            return {'success': True, 'results': [{'movie_id': request.movie_ids[0], 'success': True}]}

        async def record_results(results, tool):
            entered.set()
            await release.wait()
            if history_fails:
                raise OSError('fixture history persistence failure')

        monkeypatch.setattr(service.asyncio, 'create_task', track_task)
        monkeypatch.setattr(service, 'download', download)
        monkeypatch.setattr(service.download_history_service, 'record_dispatch_results', record_results)
        failed = manager.submit(DownloadRequest(magnet_links=['magnet:failed'], movie_ids=['QA-FAILED']))['job_id']
        await asyncio.wait_for(entered.wait(), 5)
        latest = None
        try:
            for index in range(2):
                latest = manager.submit(DownloadRequest(magnet_links=['magnet:ok'], movie_ids=[f'QA-{index}']))['job_id']
                await started[-1]
                assert manager.get(failed)['status'] == 'running', 'pending history persistence is still active work'
                assert manager.get(latest)['status'] == 'completed'
                assert len(manager._jobs) == 2
        finally:
            release.set()
            outcomes = await asyncio.gather(*started, return_exceptions=True)
        assert not any(isinstance(outcome, KeyError) for outcome in outcomes)
        snapshot = manager.get(failed)
        assert snapshot['status'] == 'failed'
        assert snapshot['result']['results'][0]['movie_id'] == 'QA-FAILED'
        assert len(manager._jobs) == 1
        with pytest.raises(service.Pan115Error):
            manager.get(latest)
    asyncio.run(exercise())


def test_cancelled_jobs_keep_partial_progress_and_can_be_evicted_after_finishing(monkeypatch):
    async def exercise():
        manager = service.Pan115DownloadJobManager(max_jobs=1)
        release, entered = asyncio.Event(), asyncio.Event()
        started = []
        create_task = asyncio.create_task
        partial = [{'movie_id': 'QA-CANCEL', 'magnet': 'magnet:submitted', 'success': True}]

        def track_task(coroutine):
            task = create_task(coroutine)
            started.append(task)
            return task

        async def download(request, progress_callback=None):
            label = request.movie_ids[0]
            if label == 'QA-CANCEL':
                await progress_callback({'completed_count': 1, 'total_count': 2, 'results': partial})
                entered.set()
                await release.wait()
            elif label == 'QA-ACTIVE':
                await release.wait()
            return {'success': True, 'results': [{'movie_id': label, 'success': True}]}

        monkeypatch.setattr(service.asyncio, 'create_task', track_task)
        monkeypatch.setattr(service, 'download', download)
        active_id = manager.submit(DownloadRequest(magnet_links=['magnet:active'], movie_ids=['QA-ACTIVE']))['job_id']
        cancelled_id = manager.submit(DownloadRequest(
            magnet_links=['magnet:submitted', 'magnet:pending'], movie_ids=['QA-CANCEL', 'QA-PENDING']))['job_id']
        await asyncio.wait_for(entered.wait(), 5)
        before = manager.get(cancelled_id)
        try:
            started[1].cancel()
            with pytest.raises(asyncio.CancelledError):
                await started[1]
            snapshot = manager.get(cancelled_id)
            assert snapshot['status'] == 'failed' and snapshot['error']
            assert snapshot['results'] == partial and snapshot['completed_count'] == 1
            assert snapshot['result'] == before['result']
            assert manager.get(active_id)['status'] == 'running'
            latest = manager.submit(DownloadRequest(magnet_links=['magnet:ok'], movie_ids=['QA-LATEST']))['job_id']
            await started[-1]
            with pytest.raises(service.Pan115Error):
                manager.get(cancelled_id)
            assert manager.get(latest)['result']['results'][0]['movie_id'] == 'QA-LATEST'
            assert manager.get(active_id)['status'] == 'running'
        finally:
            release.set()
            await asyncio.gather(*started, return_exceptions=True)
    asyncio.run(exercise())
