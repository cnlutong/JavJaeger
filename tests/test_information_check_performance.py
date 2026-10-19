import asyncio
import builtins
import json
import time
from types import SimpleNamespace

from modules.history.service import ActorLibraryService, LocalMovieLibraryService
from modules.movies import local_library
from modules.movies.schemas import LocalLibraryInformationDownloadRequest


def test_information_check_copies_only_fields_needed_for_validation(tmp_path):
    class UnusedBlob:
        def __deepcopy__(self, memo):
            raise AssertionError("information checks must not copy unused scrape or media blobs")

    service = LocalMovieLibraryService(str(tmp_path / "library.json"))
    service._loaded = True
    service._cache = {f"QA-{i:05d}": {
        "movie_id": f"QA-{i:05d}", "title": f"QA-{i:05d}", "scrape_status": "",
        "full_text": UnusedBlob(),
        "metadata": {"raw": {"id": f"QA-{i:05d}", "html": UnusedBlob()},
                     "samples": UnusedBlob(), "stars": ["QA"], "genres": ["QA"],
                     "date": "2026-09-01", "cover_url": "https://example.invalid/cover.jpg"},
        "files": [{"path": "unused", "media_extra": UnusedBlob(),
                   "filesystem": {"checked_at": "2026-09-01", "exists": True, "nfo": True, "poster": True}}],
    } for i in range(10_000)}

    result = asyncio.run(service.get_information_check())
    assert result["total_movies"] == result["complete_count"] == 10_000
    assert result["incomplete_count"] == result["unchecked_count"] == 0
    assert result["records"][0] == {
        "movie_id": "QA-00000", "title": "QA-00000", "scrape_status": "", "has_metadata": True,
        "info_complete": True, "unchecked_fields": [], "missing_fields": [], "missing_labels": [],
    }
    assert "exists" not in service._cache["QA-00000"]["files"][0]


def test_10000_movie_information_download_builds_refresh_membership_once(monkeypatch):
    movie_ids = [f"QA-{i:05d}" for i in range(10_000)]
    records = [{"movie_id": movie_id, "missing_fields": ["title"]} for movie_id in movie_ids]
    membership_builds = []
    updates = []

    def counted_set(values=()):
        if isinstance(values, list) and len(values) == len(movie_ids):
            membership_builds.append(len(values))
        return builtins.set(values)

    async def check(*args, **kwargs):
        return {"records": records, "incomplete_count": 0}

    async def refresh(*args):
        pass

    async def status(movie_id):
        return {"record": {"movie_id": movie_id}}

    async def update(movie_id, *args, **kwargs):
        updates.append(movie_id)
        return True

    async def scrape(ids, concurrent):
        return {movie_id: {"metadata": {"id": movie_id}, "scrape_status": "found",
                           "scrape_error": None, "full_text": ""} for movie_id in ids}

    async def assets(*args):
        return {}

    monkeypatch.setattr(local_library, "set", counted_set, raising=False)
    monkeypatch.setattr(local_library, "local_movie_library_service", SimpleNamespace(
        refresh_file_states=refresh, get_information_check=check, get_status=status,
        update_information=update, flush_information_updates=refresh))
    monkeypatch.setattr(local_library, "_scrape_metadata", scrape)
    monkeypatch.setattr(local_library, "_write_local_library_information_assets", assets)
    result = asyncio.run(local_library.download_missing_local_library_information(
        LocalLibraryInformationDownloadRequest(fields=["title"])))

    assert result["updated_count"] == len(updates) == 10_000
    assert membership_builds == [10_000]


def test_information_download_batches_large_library_and_actor_snapshots(tmp_path, monkeypatch):
    count, batch_size = 10_000, 20
    actors = ActorLibraryService(str(tmp_path / "actors.json"), str(tmp_path / "avatars"))
    service = LocalMovieLibraryService(str(tmp_path / "library.json"), actors)
    service._loaded = actors._loaded = True
    service._cache = {f"QA-{i:05d}": {
        "movie_id": f"QA-{i:05d}", "title": f"Title {i}", "stars": ["Original Actor"],
        "metadata": {"title": f"Title {i}", "stars": ["Original Actor"]},
        "files": [{"path": str(tmp_path / f"QA-{i:05d}.mp4"), "size": 5_000_000_000}],
        "file_count": 1, "total_size": 5_000_000_000,
    } for i in range(count)}
    movie_ids = list(service._cache)[:batch_size]
    calls = {"library_saves": 0, "actor_saves": 0, "actor_records": 0}
    save_library, save_actors = service._save_locked, actors._save_locked
    actor_refs = actors._actor_refs_from_record

    async def counted_library_save():
        calls["library_saves"] += 1
        await save_library()

    async def counted_actor_save():
        calls["actor_saves"] += 1
        await save_actors()

    def counted_actor_refs(record):
        calls["actor_records"] += 1
        return actor_refs(record)

    async def no_avatar(*args):
        return False

    async def scrape(ids, concurrent):
        return {movie_id: {"metadata": {"id": movie_id, "title": f"Enriched {movie_id}",
                           "stars": ["Updated Actor"]}, "scrape_status": "found",
                           "scrape_error": None, "full_text": "public metadata"} for movie_id in ids}

    async def assets(movie_id, metadata, request):
        path = service._cache[movie_id]["files"][0]["path"]
        await service.update_file_media_info(movie_id, {path: {"width": 1920, "height": 1080, "codec": "hevc"}})
        return {}

    monkeypatch.setattr(service, "_save_locked", counted_library_save)
    monkeypatch.setattr(actors, "_save_locked", counted_actor_save)
    monkeypatch.setattr(actors, "_actor_refs_from_record", counted_actor_refs)
    monkeypatch.setattr(actors, "_ensure_actor_avatar", no_avatar)
    monkeypatch.setattr(service, "_scan_file_states", lambda files: {
        file["path"]: {"checked_at": "2026-10-19", "exists": True} for file in files})
    monkeypatch.setattr(local_library, "local_movie_library_service", service)
    monkeypatch.setattr(local_library, "_scrape_metadata", scrape)
    monkeypatch.setattr(local_library, "_write_local_library_information_assets", assets)

    start = time.perf_counter()
    result = asyncio.run(local_library.download_missing_local_library_information(
        LocalLibraryInformationDownloadRequest(movie_ids=movie_ids, fields=["title", "stars"], only_missing=False)))
    print({"index_movies": count, "updated_movies": batch_size, **calls,
           "elapsed_seconds": round(time.perf_counter() - start, 3)})

    assert result["updated_count"] == batch_size
    assert result["failed_count"] == 0
    assert calls["library_saves"] <= 3, "whole-library snapshots must be bounded per workflow, not per movie"
    assert calls["actor_saves"] == 1, "all updated movies share one durable actor index rebuild"
    assert calls["actor_records"] <= count, "actor synchronization must scan the library once"
    saved = json.loads((tmp_path / "library.json").read_text())["movies"]
    assert all(saved[movie_id]["title"] == f"Enriched {movie_id}" for movie_id in movie_ids)
    assert all(saved[movie_id]["files"][0]["height"] == 1080 for movie_id in movie_ids)
    saved_actors = json.loads((tmp_path / "actors.json").read_text())["actors"]
    assert saved_actors["Updated Actor"]["movie_count"] == batch_size
    assert saved_actors["Original Actor"]["movie_count"] == count - batch_size
