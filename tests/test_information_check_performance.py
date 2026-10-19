import asyncio
import builtins
from types import SimpleNamespace

from modules.history.service import LocalMovieLibraryService
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

    async def update(movie_id, *args):
        updates.append(movie_id)
        return True

    async def scrape(ids, concurrent):
        return {movie_id: {"metadata": {"id": movie_id}, "scrape_status": "found",
                           "scrape_error": None, "full_text": ""} for movie_id in ids}

    async def assets(*args):
        return {}

    monkeypatch.setattr(local_library, "set", counted_set, raising=False)
    monkeypatch.setattr(local_library, "local_movie_library_service", SimpleNamespace(
        refresh_file_states=refresh, get_information_check=check, get_status=status, update_information=update))
    monkeypatch.setattr(local_library, "_scrape_metadata", scrape)
    monkeypatch.setattr(local_library, "_write_local_library_information_assets", assets)
    result = asyncio.run(local_library.download_missing_local_library_information(
        LocalLibraryInformationDownloadRequest(fields=["title"])))

    assert result["updated_count"] == len(updates) == 10_000
    assert membership_builds == [10_000]
