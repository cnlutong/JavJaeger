import asyncio
import threading
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from modules.movies import local_scrape


def test_existing_actor_avatars_skip_remote_lookup_even_when_source_is_offline(tmp_path, monkeypatch):
    service = local_scrape.local_actor_library_service
    actors = [{"id": f"actor-{index}", "name": f"Actor {index}"} for index in range(20)]
    targets = [service.avatar_target_for(service.actor_key_for(actor)) for actor in actors]
    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"existing avatar")
    lookup = AsyncMock(side_effect=RuntimeError("source offline"))
    download = AsyncMock(side_effect=AssertionError("local avatar needs no download"))
    monkeypatch.setattr(local_scrape.javbus_api_service, "get_star_info", lookup)
    monkeypatch.setattr(local_scrape, "_download_image_or_warn", download)
    loop_thread = threading.get_ident()
    is_file = Path.is_file

    def off_loop_is_file(path, *args, **kwargs):
        if path in targets:
            assert threading.get_ident() != loop_thread
        return is_file(path, *args, **kwargs)

    monkeypatch.setattr(Path, "is_file", off_loop_is_file)
    result = asyncio.run(local_scrape._write_actor_images(
        tmp_path / "QA-001.mp4", {"actor_refs": [*actors, actors[0]]}, overwrite=False,
    ))
    assert result == [str(target) for target in targets]
    lookup.assert_not_awaited()
    download.assert_not_awaited()
    assert all(target.read_bytes() == b"existing avatar" for target in targets)


def test_an_unreadable_avatar_does_not_stop_other_actor_images(tmp_path, monkeypatch):
    service = local_scrape.local_actor_library_service
    actors = [{"id": name, "name": name} for name in ["unreadable", "cached"]]
    blocked, cached = [service.avatar_target_for(service.actor_key_for(actor)) for actor in actors]
    cached.parent.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(b"cached")
    is_file = Path.is_file

    def check(path, *args, **kwargs):
        if path == blocked:
            raise PermissionError("fixture unreadable")
        return is_file(path, *args, **kwargs)

    monkeypatch.setattr(Path, "is_file", check)
    monkeypatch.setattr(local_scrape.javbus_api_service, "get_star_info", AsyncMock(return_value={"avatar": "https://fixture.test/avatar.jpg"}))
    monkeypatch.setattr(local_scrape, "_download_image_or_warn", AsyncMock(return_value=None))
    assert asyncio.run(local_scrape._write_actor_images(
        tmp_path / "QA-001.mp4", {"actor_refs": actors}, overwrite=False,
    )) == [str(cached)]


@pytest.mark.parametrize("overwrite, exists", [(True, True), (False, False)])
def test_overwrite_and_missing_actor_avatars_still_fetch_the_source(tmp_path, monkeypatch, overwrite, exists):
    service = local_scrape.local_actor_library_service
    actor = {"id": "actor-1", "name": "Actor 1"}
    target = service.avatar_target_for(service.actor_key_for(actor))
    if exists:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"old avatar")
    lookup = AsyncMock(return_value={"avatar": "https://fixture.test/avatar.jpg"})
    download = AsyncMock(return_value=target.name)
    monkeypatch.setattr(local_scrape.javbus_api_service, "get_star_info", lookup)
    monkeypatch.setattr(local_scrape, "_download_image_or_warn", download)
    assert asyncio.run(local_scrape._write_actor_images(
        tmp_path / "QA-001.mp4", {"actor_refs": [actor]}, overwrite,
    )) == [str(target)]
    lookup.assert_awaited_once_with("actor-1")
    download.assert_awaited_once_with("https://fixture.test/avatar.jpg", target, overwrite)
