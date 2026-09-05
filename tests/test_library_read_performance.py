import asyncio
import threading
import os
import time
from pathlib import Path

from modules.history.service import ActorLibraryService, LocalMovieLibraryService
from modules.movies import local_library


def test_10000_movie_rescan_reuses_media_probes_and_runs_off_event_loop(tmp_path, monkeypatch):
    service = LocalMovieLibraryService(str(tmp_path / "library.json"))
    service._loaded = True
    paths = [tmp_path / f"disk-{i % 50}" / f"QA-{i + 10000}.mp4" for i in range(10_000)]
    media = {"width": 1920, "height": 1080, "codec": "h264", "bitrate": 5_000_000}
    service._cache = {path.stem: {"movie_id": path.stem, "files": [{
        "path": str(path), "scan_root": str(tmp_path), "size": 5_000_000_000, "modified_at": "2026-09-01", **media,
    }]} for path in paths}
    probes, walk_threads, directories = [], [], []
    changed = False
    scandir = os.scandir

    def walk(*args):
        walk_threads.append(threading.get_ident())
        return paths

    def probe(path):
        probes.append(path)
        assert threading.get_ident() != event_loop_thread
        return media

    def scan(path):
        directories.append(str(path))
        return scandir(path)

    monkeypatch.setattr(local_library, "local_movie_library_service", service)
    monkeypatch.setattr(local_library, "_walk_video_files", walk)
    monkeypatch.setattr(local_library, "_file_size", lambda path: 5_000_000_000 + int(changed and path == paths[0]))
    monkeypatch.setattr(local_library, "_iso_mtime", lambda path: "2026-09-01")
    monkeypatch.setattr(local_library, "_read_nfo_record", lambda *args: {})
    monkeypatch.setattr(local_library, "_probe_video_metadata", probe)
    monkeypatch.setattr(os, "scandir", scan)
    event_loop_thread = threading.get_ident()

    async def check():
        nonlocal changed
        request = local_library.LocalLibraryScanRequest(directory=str(tmp_path), probe_media=True)
        await local_library.scan_local_library(request)
        assert probes == []
        assert walk_threads and event_loop_thread not in walk_threads
        assert len(directories) == len(set(directories)) == 50
        summary = await service.get_summary()
        assert summary["total_movies"] == 10_000
        assert summary["total_size"] == 50_000_000_000_000
        changed = True
        await local_library.scan_local_library(request)
        assert probes == [paths[0]], "only the changed file needs another ffprobe"
        print("10000 movie rescan: unchanged ffprobe=0; one changed file ffprobe=1; directory reads per verification=50")

    asyncio.run(check())


def test_10000_movies_50tb_browsing_never_touches_media_disk(tmp_path, monkeypatch):
    service = LocalMovieLibraryService(str(tmp_path / "library.json"))
    service._loaded = True
    service._cache = {f"QA-{i:05d}": {
        "movie_id": f"QA-{i:05d}", "title": f"QA {i}", "file_count": 1,
        "total_size": 5_000_000_000, "scrape_status": "found",
        "metadata": {"cover_url": "https://example.invalid/cover.jpg"},
        "files": [{"path": str(tmp_path / f"disk-{i % 50}" / f"QA-{i:05d}.mp4"), "size": 5_000_000_000}],
    } for i in range(10_000)}
    actors = ActorLibraryService(str(tmp_path / "actors.json"), str(tmp_path / "avatars"))
    actors._loaded = True
    actors._cache = {f"actor-{i}": {"name": f"Actor {i}", "avatar_file": f"actor-{i}.jpg", "movies": {}} for i in range(2_000)}
    disk_calls = []

    def forbidden_disk_read(*args, **kwargs):
        disk_calls.append(args[0])
        return False

    monkeypatch.setattr(Path, "is_file", forbidden_disk_read)
    monkeypatch.setattr(Path, "exists", forbidden_disk_read)
    monkeypatch.setattr(os, "scandir", forbidden_disk_read)

    async def check():
        start = time.perf_counter()
        for _ in range(3):
            summary = await service.get_summary()
            assert summary["total_movies"] == 10_000
            assert summary["total_size"] == 50_000_000_000_000
            information = await service.get_information_check()
            assert information["unchecked_count"] == 10_000
            assert (await actors.get_summary())["total_actors"] == 2_000
        print(f"10000 movies / 50 TB: 3 reads in {time.perf_counter() - start:.3f}s; media disk calls={len(disk_calls)}")
        assert disk_calls == []

    asyncio.run(check())


def test_file_verification_reads_each_directory_once_and_persists_snapshot(tmp_path, monkeypatch):
    service = LocalMovieLibraryService(str(tmp_path / "library.json"))
    video = tmp_path / "QA-001.mp4"
    video.write_bytes(b"fixture")
    (tmp_path / "QA-001-poster.jpg").write_bytes(b"poster")
    (tmp_path / "QA-001.nfo").write_text("nfo")
    calls = []
    scandir = os.scandir

    def counted_scandir(path):
        calls.append((str(path), threading.get_ident()))
        return scandir(path)

    monkeypatch.setattr(os, "scandir", counted_scandir)

    async def check():
        await service.update_from_scan(str(tmp_path), [
            {"movie_id": "QA-001", "path": str(video), "size": 5_000_000_000},
            {"movie_id": "QA-002", "path": str(tmp_path / "QA-002.mp4"), "size": 5_000_000_000},
        ])
        assert len(calls) == 1
        assert calls[0][1] != threading.get_ident()
        first = await service.get_summary()
        assert first["records"][0]["files"][0]["exists"] is True
        assert first["records"][1]["files"][0]["exists"] is False
        video.unlink()
        assert await service.get_video_file_path("QA-001") is None
        reloaded = LocalMovieLibraryService(service.file_path)
        assert (await reloaded.get_summary())["records"][0]["files"][0]["exists"] is True
        assert len(calls) == 1, "restart and browsing must reuse the persisted verification"
        await reloaded.get_information_check(refresh_files=True)
        assert len(calls) == 2
        assert (await reloaded.get_summary())["records"][0]["files"][0]["exists"] is False

    asyncio.run(check())


def test_library_read_disk_checks_leave_event_loop_available(tmp_path, monkeypatch):
    service = LocalMovieLibraryService(str(tmp_path / "library.json"))
    service._loaded = True
    video = tmp_path / "QA-001.mp4"
    video.write_bytes(b"fixture")
    (tmp_path / "QA-001-poster.jpg").write_bytes(b"poster")
    (tmp_path / "QA-001-thumb.jpg").write_bytes(b"thumbnail")
    service._cache = {"QA-001": {
        "movie_id": "QA-001", "title": "QA", "scrape_status": "found",
        "metadata": {"cover_url": "https://example.invalid/cover.jpg"},
        "files": [{"path": str(video)}],
    }}
    actors = ActorLibraryService(str(tmp_path / "actors.json"), str(tmp_path))
    actors._loaded = True
    actors._cache = {"qa": {"name": "QA", "movies": {}}}
    (tmp_path / "qa.jpg").write_bytes(b"avatar")
    event_loop_thread = threading.get_ident()
    disk_threads = []
    is_file = Path.is_file

    def checked_is_file(path):
        disk_threads.append(threading.get_ident())
        return is_file(path)

    monkeypatch.setattr(Path, "is_file", checked_is_file)

    async def check():
        for read in [lambda: service.get_poster_path("QA-001"),
                     lambda: service.get_thumbnail_path("QA-001"),
                     lambda: actors.get_avatar_path("qa")]:
            disk_threads.clear()
            assert await read()
            assert disk_threads and event_loop_thread not in disk_threads
        assert "exists" not in service._cache["QA-001"]["files"][0]

    asyncio.run(check())
