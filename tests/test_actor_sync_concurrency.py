import asyncio
from types import SimpleNamespace

import pytest

from modules.history.service import ActorLibraryService, LocalMovieLibraryService


def test_deleting_movie_during_avatar_lookup_keeps_actor_index_current(tmp_path, monkeypatch):
    async def check():
        actors = ActorLibraryService(str(tmp_path / "actors.json"), str(tmp_path / "avatars"))
        library = LocalMovieLibraryService(str(tmp_path / "library.json"), actors)
        actors._loaded = library._loaded = True
        library._actor_revision = 0
        record = {"movie_id": "QA-1", "files": [], "metadata": {"id": "QA-1", "stars": ["Actor QA"]}}
        library._cache = {"QA-1": record}
        started, release = asyncio.Event(), asyncio.Event()
        synced_revisions = []

        async def save_actors():
            pass

        async def save_library():
            library._actor_revision += 1

        async def mark_synced(revision):
            synced_revisions.append(revision)

        async def delayed_avatar(*args):
            assert not library._lock.locked(), "avatar network requests must not hold the movie write lock"
            started.set()
            await release.wait()
            return False

        monkeypatch.setattr(actors, "_save_locked", save_actors)
        monkeypatch.setattr(library, "_save_locked", save_library)
        monkeypatch.setattr(library, "_mark_actors_synced", mark_synced, raising=False)
        monkeypatch.setattr(actors, "_ensure_actor_avatar", delayed_avatar)
        updating = asyncio.create_task(library._sync_actor_library([record]))
        await asyncio.wait_for(started.wait(), 1)
        deleting = asyncio.create_task(library.delete_movie("QA-1"))
        try:
            await asyncio.sleep(0)
            assert library._cache == {}, "deleting must remain possible while an avatar lookup waits"
            assert not deleting.done(), "the newer actor sync must wait for the older one"
        finally:
            release.set()
            await asyncio.gather(updating, deleting)

        assert actors._cache == {}, "the older sync must not restore a deleted movie's actor association"
        assert synced_revisions == [0, 1]

    asyncio.run(check())


def test_actor_sync_uses_isolated_narrow_snapshot_from_current_cache(tmp_path, monkeypatch):
    class UnusedBlob:
        def __deepcopy__(self, memo):
            raise AssertionError("actor synchronization must not copy unused scrape or media blobs")

    record = {
        "movie_id": "QA-1", "title": "QA", "date": "2026-10-19", "full_text": UnusedBlob(),
        "files": UnusedBlob(), "stars": ["Actor QA"],
        "metadata": {"id": "QA-1", "title": "QA", "date": "2026-10-19", "cover_url": "https://example.invalid/cover.jpg",
                     "actor_refs": [{"id": "qa", "name": "Actor QA"}], "stars": ["Actor QA"],
                     "samples": UnusedBlob(), "raw": {"stars": [{"id": "qa", "name": "Actor QA"}], "html": UnusedBlob()}},
    }
    snapshots, marked = [], []

    async def synchronize(records, **kwargs):
        snapshots.extend(records)
        snapshot = records[0]
        assert "full_text" not in snapshot and "files" not in snapshot
        assert "samples" not in snapshot["metadata"] and "html" not in snapshot["metadata"]["raw"]
        snapshot["stars"].append("changed")
        snapshot["metadata"]["actor_refs"][0]["name"] = "changed"
        snapshot["metadata"]["raw"]["stars"][0]["name"] = "changed"
        return {"success": True}

    async def mark_synced(revision):
        marked.append(revision)

    library = LocalMovieLibraryService(str(tmp_path / "library.json"), SimpleNamespace(sync_from_movie_records=synchronize))
    library._loaded = True
    library._actor_revision = 7
    library._cache = {"QA-1": record}
    monkeypatch.setattr(library, "_mark_actors_synced", mark_synced, raising=False)
    asyncio.run(library._sync_actor_library([{"movie_id": "obsolete-record"}]))

    assert [item["movie_id"] for item in snapshots] == ["QA-1"]
    assert record["stars"] == ["Actor QA"]
    assert record["metadata"]["actor_refs"][0]["name"] == "Actor QA"
    assert record["metadata"]["raw"]["stars"][0]["name"] == "Actor QA"
    assert marked == [7]


def test_failed_actor_sync_does_not_mark_revision_synced(tmp_path, monkeypatch):
    async def synchronize(*args, **kwargs):
        raise OSError("fixture write failed")

    async def mark_synced(revision):
        raise AssertionError("failed actor persistence must remain dirty")

    library = LocalMovieLibraryService(str(tmp_path / "library.json"), SimpleNamespace(sync_from_movie_records=synchronize))
    library._loaded = True
    library._actor_revision = 1
    monkeypatch.setattr(library, "_mark_actors_synced", mark_synced, raising=False)
    with pytest.raises(OSError, match="fixture write failed"):
        asyncio.run(library._sync_actor_library())
