import asyncio
import json
import os
import stat
import threading
from pathlib import Path

import pytest

from modules.history.service import ActorLibraryService, LocalMovieLibraryService, local_actor_library_service, local_movie_library_service
from modules.common.runtime import finish_before_cancel


def test_cancelled_inner_operation_is_not_retried_forever(monkeypatch):
    shield = asyncio.shield
    calls = []

    def once(awaitable):
        calls.append(1)
        assert len(calls) == 1, "a cancelled inner task cannot finish by retrying it"
        return shield(awaitable)

    monkeypatch.setattr(asyncio, "shield", once)

    async def check():
        work = asyncio.Future()
        work.cancel()
        with pytest.raises(asyncio.CancelledError):
            await finish_before_cancel(work)

    asyncio.run(check())


@pytest.mark.parametrize("service_type", [ActorLibraryService, LocalMovieLibraryService])
def test_index_writes_are_atomic_and_do_not_block_the_event_loop(tmp_path, monkeypatch, service_type):
    path = tmp_path / "index.json"
    service = service_type(str(path))
    service._loaded = True
    work_threads = []
    dump = json.dump

    def encoding(*args, **kwargs):
        work_threads.append(threading.get_ident())
        return dump(*args, **kwargs)

    monkeypatch.setattr(json, "dump", encoding)

    async def check():
        async with service._lock:
            await service._save_locked()
        assert work_threads and threading.get_ident() not in work_threads
        previous = path.read_bytes()

        def fail_publish(*args):
            raise OSError("disk publication failed")

        monkeypatch.setattr(Path, "replace", fail_publish)
        async with service._lock:
            with pytest.raises(OSError):
                await service._save_locked()
        assert path.read_bytes() == previous
        assert not list(tmp_path.glob("*.tmp"))

    asyncio.run(check())


@pytest.mark.skipif(os.name == "nt", reason="POSIX file permissions")
@pytest.mark.parametrize("service_type", [ActorLibraryService, LocalMovieLibraryService])
def test_atomic_index_writes_preserve_private_file_permissions(tmp_path, service_type):
    path = tmp_path / "private.json"
    path.write_text("{}")
    path.chmod(0o600)
    service = service_type(str(path))
    asyncio.run(service._save_locked())
    assert stat.S_IMODE(path.stat().st_mode) == 0o600


@pytest.mark.skipif(os.name == "nt", reason="POSIX file permissions")
def test_movie_updates_inherit_the_private_library_permissions(tmp_path):
    path = tmp_path / "private.json"
    path.write_text(json.dumps({"movies": {"QA-001": {"movie_id": "QA-001", "files": []}}}))
    path.chmod(0o600)
    service = LocalMovieLibraryService(str(path))
    asyncio.run(service.update_information("QA-001", {"title": "private title"}, "found", None, "", "now", sync_actors=False))
    updates = list(service._updates_directory.glob("*.json"))
    assert updates and all(stat.S_IMODE(update.stat().st_mode) == 0o600 for update in updates)


def test_startup_library_singletons_use_disposable_test_paths(tmp_path):
    for service in (local_actor_library_service, local_movie_library_service):
        assert Path(service.file_path).is_relative_to(tmp_path)
    assert Path(local_actor_library_service.image_dir).is_relative_to(tmp_path)
