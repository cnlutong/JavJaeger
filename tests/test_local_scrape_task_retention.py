import asyncio

import pytest

from modules.movies.local_scrape_tasks import LocalScrapeTaskManager


def test_an_old_running_task_does_not_prevent_evicting_finished_results():
    async def exercise():
        manager = LocalScrapeTaskManager(max_tasks=3)
        release = asyncio.Event()

        async def running(progress):
            await release.wait()
            return {'success': True}

        async def finished(progress):
            progress({'message': 'finished'})
            return {'success': True, 'records': [{'movie_id': 'QA-001'}]}

        active = manager.start_task('long-running', running)
        completed = []
        try:
            for _ in range(10):
                latest = manager.start_task('quick', finished)
                completed.append(latest)
                await asyncio.sleep(0)
                assert manager.get_task(active)['status'] == 'running'
                assert manager.get_task(latest)['result']['records'] == [{'movie_id': 'QA-001'}]
                assert len(manager._tasks) == 1 + min(3, len(completed))
            assert all(manager.get_task(task_id) is None for task_id in completed[:-3])
            assert all(manager.get_task(task_id)['status'] == 'success' for task_id in completed[-3:])
        finally:
            release.set()
            await asyncio.sleep(0)
        assert manager.get_task(active)['status'] == 'success', 'the long-running task just completed and is now the newest result'
        assert manager.get_task(completed[-3]) is None
        assert all(manager.get_task(task_id)['status'] == 'success' for task_id in completed[-2:])
    asyncio.run(exercise())


@pytest.mark.parametrize('fails', [False, True])
def test_completing_tasks_trim_history_without_evicting_running_work(fails):
    async def exercise():
        manager = LocalScrapeTaskManager(max_tasks=2)
        releases = [asyncio.Event() for _ in range(4)]

        def runner(release):
            async def run(progress):
                await release.wait()
                if fails:
                    raise OSError('fixture failure')
                return {'success': True, 'message': 'complete'}
            return run

        task_ids = [manager.start_task('parallel', runner(release)) for release in releases]
        await asyncio.sleep(0)
        assert len(manager._tasks) == 4, 'running work does not consume finished-result slots'
        try:
            for index, release in enumerate(releases):
                release.set()
                await asyncio.sleep(0)
                running = task_ids[index + 1:]
                assert all(manager.get_task(task_id)['status'] == 'running' for task_id in running)
                assert len(manager._tasks) == len(running) + min(2, index + 1), 'completion must retain the newest results without waiting for another submission'
            assert all(manager.get_task(task_id) is None for task_id in task_ids[:-2])
            for task_id in task_ids[-2:]:
                snapshot = manager.get_task(task_id)
                assert snapshot['status'] == ('failed' if fails else 'success')
                assert snapshot['finished_at'] and snapshot['updated_at'] == snapshot['finished_at']
                assert snapshot['error'] == ('task_failed' if fails else None)
        finally:
            for release in releases:
                release.set()
            await asyncio.sleep(0)
    asyncio.run(exercise())


def test_cancelled_tasks_keep_progress_and_are_retained_then_evicted_like_other_results(monkeypatch):
    async def exercise():
        manager = LocalScrapeTaskManager(max_tasks=1)
        release, entered = asyncio.Event(), asyncio.Event()
        started = []
        create_task = asyncio.create_task

        def track_task(coroutine):
            task = create_task(coroutine)
            started.append(task)
            return task

        async def active(progress):
            await release.wait()
            return {'success': True}

        async def cancelled(progress):
            progress({'phase': 'download', 'completed': 1, 'total': 2, 'current': 'QA-001', 'message': 'first item complete'})
            entered.set()
            await release.wait()
            return {'success': True}

        async def complete(progress):
            return {'success': True, 'message': 'latest result'}

        monkeypatch.setattr(asyncio, 'create_task', track_task)
        active_id = manager.start_task('active', active)
        cancelled_id = manager.start_task('cancelled', cancelled)
        await asyncio.wait_for(entered.wait(), 5)
        try:
            started[1].cancel()
            with pytest.raises(asyncio.CancelledError):
                await started[1]
            snapshot = manager.get_task(cancelled_id)
            assert snapshot['status'] == 'failed' and snapshot['error'] == 'task_failed'
            assert snapshot['percent'] == 50 and snapshot['completed'] == 1
            assert snapshot['phase'] == 'download' and snapshot['current'] == 'QA-001'
            assert any(log['message'] == 'first item complete' for log in snapshot['logs'])
            assert manager.get_task(active_id)['status'] == 'running'
            latest = manager.start_task('complete', complete)
            await started[-1]
            assert manager.get_task(cancelled_id) is None
            assert manager.get_task(latest)['result']['message'] == 'latest result'
            assert manager.get_task(active_id)['status'] == 'running'
        finally:
            release.set()
            await asyncio.gather(*started, return_exceptions=True)
    asyncio.run(exercise())
