import asyncio
import json
import os
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from pydantic import ValidationError

from fastapi import FastAPI
from fastapi.testclient import TestClient

from modules.automation.service import AutomationService
from modules.history.service import ActorLibraryService, DownloadHistoryService, LocalMovieLibraryService, javbus_api_service
from modules.javbus_api.client import JavBusClient
from modules.movies.transcoding import TranscodingService
from modules.movies import local_library, local_scrape, router as movies_router, transcoding
from modules.movies.schemas import LocalScrapePreviewRequest, LocalScrapeApplyRequest
from modules.movies.transcoding_schemas import TranscodingTask
from modules.system import path_browser, router as system_router


def test_compact_library_keeps_10000_movie_details_without_scrape_blobs(tmp_path, monkeypatch):
    library = LocalMovieLibraryService(str(tmp_path / 'library.json'))
    library._loaded = True
    library._cache = {f'QA-{i:05d}': {
        'movie_id': f'QA-{i:05d}', 'title': f'QA {i}', 'file_count': 1, 'total_size': 5_000_000_000,
        'full_text': 'QA description ' * 100,
        'metadata': {'title': f'QA {i}', 'genres': ['VR'], 'raw': {'description': 'QA metadata ' * 300}, 'samples': ['https://example.invalid/qa.jpg']},
        'files': [{'path': f'/qa/QA-{i:05d}.mp4', 'size': 5_000_000_000, 'filesystem': {'exists': True, 'poster': True}}],
    } for i in range(10_000)}
    actors = ActorLibraryService(str(tmp_path / 'actors.json'), str(tmp_path / 'images'))
    actors._loaded = True
    actors._cache = {'qa': {'name': 'QA Actor', 'avatar_file': 'qa.jpg', 'movies': library._cache, 'movie_ids': list(library._cache)}}
    monkeypatch.setattr(local_library, 'local_movie_library_service', library)
    monkeypatch.setattr(movies_router, 'local_actor_library_service', actors)

    async def check():
        full = await local_library.get_local_library_payload()
        compact = await local_library.get_local_library_payload(compact=True)
        assert compact['total_movies'] == 10_000 and compact['total_size'] == 50_000_000_000_000
        for original, reduced in zip(full['records'], compact['records']):
            assert reduced['files'] == original['files'] and reduced['is_vr'] is True
            assert reduced['poster_url'] == original['poster_url']
            assert 'full_text' not in reduced and 'raw' not in reduced['metadata'] and 'samples' not in reduced['metadata']
        full_bytes, compact_bytes = len(json.dumps(full)), len(json.dumps(compact))
        assert compact_bytes < full_bytes * 0.2
        print(f'10000 film library JSON: {full_bytes} -> {compact_bytes} bytes')
        compact['records'][0]['files'][0]['path'] = 'changed by caller'
        assert library._cache['QA-00000']['files'][0]['path'] != 'changed by caller'
        assert 'full_text' in library._cache['QA-00000'] and 'raw' in library._cache['QA-00000']['metadata']
        actor = (await actors.get_summary(compact=True))['actors'][0]
        assert actor['movie_count'] == 10_000 and actor['avatar_url'].endswith('/qa/avatar')
        assert 'movies' not in actor and 'movie_ids' not in actor
        assert len((await actors.get_summary())['actors'][0]['movies']) == 10_000

    asyncio.run(check())
    # Exercise the opt-in query contract while keeping the legacy default intact.
    library._cache = {'QA-00000': library._cache['QA-00000']}
    app = FastAPI()
    app.include_router(movies_router.router)
    with TestClient(app) as client:
        assert 'full_text' in client.get('/api/movies/local-library').json()['records'][0]
        assert 'full_text' not in client.get('/api/movies/local-library?compact=true').json()['records'][0]
        assert 'movies' not in client.get('/api/movies/local-library/actors?compact=true').json()['actors'][0]


def test_history_point_lookups_do_not_copy_10000_records(tmp_path):
    class CountingDict(dict):
        copies = 0

        def values(self):
            self.copies += 1
            return super().values()

    service = DownloadHistoryService(str(tmp_path / "history.json"))
    service._loaded = True
    service._cache = CountingDict({f"QA-{i}": {"movie_id": f"QA-{i}"} for i in range(10_000)})

    async def check():
        for i in range(10_000):
            assert await service.is_movie_downloaded(f"QA-{i}")
        assert service._cache.copies == 0

    asyncio.run(check())


def test_remote_metadata_wait_does_not_lock_history_readers_or_lose_links(tmp_path, monkeypatch):
    async def check():
        service = DownloadHistoryService(str(tmp_path / "history.json"))
        await service.load_records()
        started, release = asyncio.Event(), asyncio.Event()

        async def delayed_metadata(movie_id):
            started.set()
            await release.wait()
            return {"title": movie_id}

        monkeypatch.setattr(javbus_api_service, "get_movie_detail", delayed_metadata)
        saving = asyncio.create_task(service.save_movies(["QA-1"], ["magnet:first"], ["javbus"]))
        await started.wait()
        try:
            assert await asyncio.wait_for(service.get_history(), 0.5) == []
        finally:
            release.set()
            await saving
        await asyncio.gather(service.save_movies(["QA-1"], ["magnet:second"]), service.save_movies(["QA-1"], ["magnet:third"]))
        assert len(await service.get_downloaded_magnet_links("QA-1")) == 3

    asyncio.run(check())


def test_automation_polling_reuses_parsed_file_and_detects_external_updates(tmp_path, monkeypatch):
    path = tmp_path / "tasks.json"
    path.write_text('{"tasks": []}', encoding="utf-8")
    reads = []
    read_text = Path.read_text

    def counted_read(path, *args, **kwargs):
        reads.append(threading.get_ident())
        return read_text(path, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", counted_read)

    async def check():
        service = AutomationService(str(path), scheduler_enabled=False)
        for _ in range(20):
            assert await service.list_tasks() == []
        assert len(reads) == 1
        assert threading.get_ident() not in reads
        path.write_text('{"tasks": [], "revision": 2}', encoding="utf-8")
        assert await service.list_tasks() == []
        assert len(reads) == 2
        path.write_text('{"tasks": [{}]}', encoding="utf-8")
        with pytest.raises(ValidationError):
            await service.list_tasks()

    asyncio.run(check())


def test_directory_routes_leave_api_event_loop_available(monkeypatch):
    disk_threads = []

    def listing(path):
        disk_threads.append(threading.get_ident())
        return {"success": True, "entries": []}

    monkeypatch.setattr(system_router, "list_directory_payload", listing)
    monkeypatch.setattr(system_router, "list_file_entries_payload", listing)
    app = FastAPI()
    app.include_router(system_router.router)

    @app.get("/qa-thread")
    async def event_loop_thread():
        return threading.get_ident()

    with TestClient(app) as client:
        event_thread = client.get("/qa-thread").json()
        assert client.get("/api/system/directories").json()["success"]
        assert client.get("/api/system/files").json()["success"]
    assert disk_threads and event_thread not in disk_threads


def test_10000_directory_entries_use_scandir_facts_without_repeated_path_stats(tmp_path, monkeypatch):
    stats = []

    class Entry:
        def __init__(self, i):
            self.name = f"QA-{i:05d}.mp4"
            self.path = str(tmp_path / self.name)

        def is_symlink(self):
            return False

        def stat(self):
            stats.append(self.path)
            return SimpleNamespace(st_mode=0o100644, st_size=5_000_000_000, st_mtime=1)

    class Entries:
        def __enter__(self):
            return iter(Entry(i) for i in range(10_000))

        def __exit__(self, *args):
            pass

    monkeypatch.setattr(os, "scandir", lambda path: Entries())
    payload = path_browser._list_file_manager_entries(tmp_path)
    assert len(payload) == 10_000
    assert len(stats) == 10_000
    assert sum(item["size"] for item in payload) == 50_000_000_000_000


def test_concurrent_javbus_requests_share_fetch_and_retry_after_error(monkeypatch):
    async def check():
        client = JavBusClient(request_interval=0)
        calls = []
        fail = True

        async def get(url, **kwargs):
            calls.append((url, kwargs))
            await asyncio.sleep(0.01)
            return httpx.Response(503 if fail else 200, text="QA", request=httpx.Request("GET", url))

        async def http_client():
            return SimpleNamespace(get=get)

        monkeypatch.setattr(client, "_get_http_client", http_client)
        failures = await asyncio.gather(*(client.get_text('/QA-001') for _ in range(20)), return_exceptions=True)
        assert all(isinstance(error, httpx.HTTPStatusError) for error in failures)
        assert len(calls) == 1
        fail = False
        assert await asyncio.gather(*(client.get_text('/QA-001') for _ in range(20))) == ['QA'] * 20
        assert len(calls) == 2
        await asyncio.gather(client.get_text('/QA-001', headers={"Cookie": "existmag=all"}), client.get_text('/QA-001', headers={"Cookie": "existmag=mag"}))
        assert len(calls) == 4
        await asyncio.gather(client.get_text('/QA-001', use_cache=False), client.get_text('/QA-001', use_cache=False))
        assert len(calls) == 6
        first = asyncio.create_task(client.get_text('/QA-cancel'))
        second = asyncio.create_task(client.get_text('/QA-cancel'))
        await asyncio.sleep(0)
        first.cancel()
        assert isinstance((await asyncio.gather(first, return_exceptions=True))[0], asyncio.CancelledError)
        assert await second == 'QA', 'one cancelled reader must not abort another reader'
        assert len(calls) == 7 and not client._pending
        await client.shutdown()

    asyncio.run(check())


def test_concurrent_gpu_capability_requests_run_one_probe(tmp_path):
    calls = []

    def detect():
        calls.append(threading.get_ident())
        time.sleep(0.02)
        return {"gpu_available": False}

    async def check():
        service = TranscodingService(storage_path=str(tmp_path / 'transcoding.json'), capability_detector=detect)
        await asyncio.gather(*(service._get_capabilities() for _ in range(20)))
        assert len(calls) == 1
        assert threading.get_ident() not in calls

    asyncio.run(check())


def test_transcode_progress_uses_shared_checkpoints_and_keeps_live_values(tmp_path, monkeypatch):
    now = [100.0]
    monkeypatch.setattr(transcoding, "time", SimpleNamespace(monotonic=lambda: now[0]))
    checkpoints = []
    in_progress = False

    async def executor(task, source, temporary, progress, cancelled):
        nonlocal in_progress
        for step in range(6):
            in_progress = True
            await progress({"progress": step * 10})
            assert task.progress == step * 10
            in_progress = False
            now[0] += 1
        raise RuntimeError("QA executor stopped")

    async def check():
        service = TranscodingService(storage_path=tmp_path / 'tasks.json', executor=executor, require_binaries=False)

        async def save():
            if in_progress:
                checkpoints.append(now[0])

        monkeypatch.setattr(service, "_save_unlocked", save)
        for i in range(2):
            task = TranscodingTask(id=str(i), movie_id='QA-1', file_index=0, source_path=str(tmp_path / f'{i}.mkv'), file_name=f'{i}.mkv', preset_id='quality_h265', preset_name='QA', options=transcoding.resolve_transcoding_options('quality_h265'), created_at='2026-09-05')
            service._tasks[task.id] = task
            await service._run_task(task.id)
            assert task.status == 'failed'
        assert checkpoints == [100, 105, 110]

    asyncio.run(check())


def test_scrape_preview_and_apply_run_heavy_disk_operations_off_event_loop(tmp_path, monkeypatch):
    video = tmp_path / 'QA-001.mp4'
    video.write_bytes(b'original fixture')
    event_thread = threading.get_ident()
    seen = []
    previewing = True
    original_size = local_scrape._file_size

    def checked_size(path):
        if previewing:
            assert threading.get_ident() != event_thread, 'preview file stat blocks the event loop'
        return original_size(path)

    monkeypatch.setattr(local_scrape, '_file_size', checked_size)

    for name in ('_walk_video_files', '_file_detail', '_move_file', '_build_library_record_for_applied_video'):
        original = getattr(local_scrape, name)

        def checked(*args, _name=name, _original=original, **kwargs):
            seen.append(_name)
            assert threading.get_ident() != event_thread, _name
            return _original(*args, **kwargs)

        monkeypatch.setattr(local_scrape, name, checked)

    async def save(*args, **kwargs):
        return {"success": True}

    monkeypatch.setattr(local_scrape.local_movie_library_service, "update_from_scan", save)
    monkeypatch.setattr(local_scrape, "_probe_video_metadata", lambda path: {})

    async def check():
        nonlocal previewing
        preview = await local_scrape.preview_local_scrape(LocalScrapePreviewRequest(directory=str(tmp_path), scrape=False))
        assert preview['total_files'] == 1
        previewing = False
        result = await local_scrape.apply_local_scrape(LocalScrapeApplyRequest(items=[{"source_path": str(video), "code": 'QA-001', "metadata": {"id": 'QA-001', "title": 'QA'}}], target_directory=str(tmp_path / 'out'), organize=True, write_nfo=False, download_images=False))
        assert result['success'], result
        assert {'_walk_video_files', '_file_detail', '_move_file', '_build_library_record_for_applied_video'} <= set(seen)

    asyncio.run(check())
