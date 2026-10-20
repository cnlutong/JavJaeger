import asyncio
import json
from pathlib import Path
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from modules.movies import transcoding
from modules.movies.transcoding import TranscodingService, resolve_transcoding_options
from modules.movies.transcoding_schemas import TranscodingTask, TranscodingTaskCreate


def task(task_id):
    return TranscodingTask(
        id=task_id, movie_id='QA-1', file_index=0, source_path='/qa/video.mkv', file_name='video.mkv',
        preset_id='quality_h265', preset_name='QA', options=resolve_transcoding_options('quality_h265'),
        created_at='2026-10-20', status='completed',
    )


def test_transcoding_persistence_runs_model_and_file_work_off_loop(tmp_path, monkeypatch):
    path = tmp_path / 'tasks.json'
    first = task('first')
    loop_thread = threading.get_ident()
    operations = []
    dump, read, write, replace = transcoding._model_dump, Path.read_text, Path.write_text, transcoding.os.replace

    def checked(operation, original):
        def call(*args, **kwargs):
            operations.append((operation, threading.get_ident()))
            return original(*args, **kwargs)
        return call

    monkeypatch.setattr(transcoding, '_model_dump', checked('model', dump))
    monkeypatch.setattr(Path, 'read_text', checked('read', read))
    monkeypatch.setattr(Path, 'write_text', checked('write', write))
    monkeypatch.setattr(transcoding.os, 'replace', checked('replace', replace))

    async def exercise():
        service = TranscodingService(path, require_binaries=False)
        service._tasks = {'first': first}
        async with service._lock:
            await service._save_unlocked()
        restarted = TranscodingService(path, require_binaries=False)
        async with restarted._lock:
            await restarted._load_unlocked()
        assert restarted._tasks['first'].movie_id == 'QA-1'
        assert {name for name, _ in operations} == {'model', 'read', 'write', 'replace'}
        assert all(thread != loop_thread for _, thread in operations), 'task history I/O and serialization must leave the API loop available'

    asyncio.run(exercise())


@pytest.mark.parametrize('operation', ['read', 'write'])
def test_cancelled_transcoding_io_keeps_lock_until_worker_finishes(tmp_path, monkeypatch, operation):
    path = tmp_path / 'tasks.json'
    path.write_text(json.dumps({'tasks': [task('first').model_dump()]}))
    entered, release = threading.Event(), threading.Event()
    original = getattr(Path, operation + '_text')

    def blocked(target, *args, **kwargs):
        if not entered.is_set():
            entered.set()
            assert release.wait(5)
        return original(target, *args, **kwargs)

    monkeypatch.setattr(Path, operation + '_text', blocked)

    async def exercise():
        service = TranscodingService(path, require_binaries=False)
        service._tasks = {'first': task('first')}
        async def first_io():
            async with service._lock:
                await (service._load_unlocked() if operation == 'read' else service._save_unlocked())
        async def later_save():
            async with service._lock:
                service._tasks['second'] = task('second')
                await service._save_unlocked()
        first = asyncio.create_task(first_io())
        later = None
        try:
            assert await asyncio.to_thread(entered.wait, 2)
            first.cancel()
            later = asyncio.create_task(later_save())
            await asyncio.sleep(0.02)
            assert not later.done(), 'cancellation must retain the lock until the history worker exits'
            first.cancel()
            await asyncio.sleep(0.02)
            assert not later.done()
        finally:
            release.set()
            results = await asyncio.gather(first, *([later] if later else []), return_exceptions=True)
        assert isinstance(results[0], asyncio.CancelledError)
        assert {item['id'] for item in json.loads(path.read_text())['tasks']} == {'first', 'second'}
        assert not list(tmp_path.glob('*.tmp'))

    asyncio.run(exercise())


def test_failed_transcoding_snapshot_preserves_saved_history_and_removes_temporary_file(tmp_path, monkeypatch):
    path = tmp_path / 'tasks.json'
    path.write_text('{"tasks":[]}')
    before = path.read_bytes()

    def deny_replace(source, target):
        raise PermissionError('snapshot is read-only')

    monkeypatch.setattr(transcoding.os, 'replace', deny_replace)

    async def exercise():
        service = TranscodingService(path, require_binaries=False)
        service._tasks = {'first': task('first')}
        async with service._lock:
            with pytest.raises(PermissionError):
                await service._save_unlocked()
        assert path.read_bytes() == before
        assert not list(tmp_path.glob('*.tmp'))

    asyncio.run(exercise())


@pytest.mark.parametrize('action', ['create', 'cancel'])
@pytest.mark.parametrize('failure', [False, True])
def test_transcoding_commit_finishes_enqueue_or_termination_before_propagating_cancellation(tmp_path, monkeypatch, action, failure):
    entered, release = threading.Event(), threading.Event()
    source = tmp_path / 'video.mkv'
    source.write_bytes(b'video')
    path = tmp_path / 'tasks.json'
    service = TranscodingService(path, require_binaries=False, library_service=SimpleNamespace(
        get_status=AsyncMock(return_value={'record': {'files': [{'path': str(source)}]}})))
    service._started = service._loaded = True
    process = SimpleNamespace(returncode=None, terminate=Mock())
    writer = service._write_tasks

    def blocked_writer():
        entered.set()
        assert release.wait(5)
        if failure:
            raise PermissionError('snapshot is read-only')
        writer()

    monkeypatch.setattr(service, '_write_tasks', blocked_writer)

    async def exercise():
        if action == 'create':
            request = service.create_task(TranscodingTaskCreate(movie_id='QA-1'))
        else:
            running = task('running')
            running.status = 'running'
            service._tasks[running.id] = running
            service._processes[running.id] = process
            service._cancel_events[running.id] = asyncio.Event()
            request = service.cancel_task(running.id)
        work = asyncio.create_task(request)
        try:
            assert await asyncio.to_thread(entered.wait, 2)
            work.cancel()
            await asyncio.sleep(0)
        finally:
            release.set()
            result = (await asyncio.gather(work, return_exceptions=True))[0]
        if failure:
            assert isinstance(result, PermissionError)
            assert service._queue.empty()
            process.terminate.assert_not_called()
        else:
            assert isinstance(result, asyncio.CancelledError)
            saved = json.loads(path.read_text())['tasks'][0]
            if action == 'create':
                assert saved['status'] == 'queued'
                assert service._queue.get_nowait() == saved['id']
                assert service._queue.empty(), 'the saved task must be enqueued exactly once'
            else:
                assert saved['cancel_requested'] is True
                process.terminate.assert_called_once_with()

    asyncio.run(exercise())
