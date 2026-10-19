"""Library indexes, history and shared caches always use disposable test paths."""
import asyncio

import pytest

from modules.history.service import download_history_service, local_actor_library_service, local_movie_library_service
from modules.javbus_api import javbus_api_service
from modules.javbus_api.metadata_cache import MovieMetadataCache
from modules.proxy import service as image_proxy_module


@pytest.fixture(autouse=True)
def isolated_download_history(tmp_path, monkeypatch):
    for service, name in ((local_actor_library_service, "actors"), (local_movie_library_service, "library")):
        monkeypatch.setattr(service, "file_path", str(tmp_path / f"{name}.json"))
        monkeypatch.setattr(service, "_cache", {})
        monkeypatch.setattr(service, "_loaded", False)
        monkeypatch.setattr(service, "_lock", asyncio.Lock())
    monkeypatch.setattr(local_actor_library_service, "image_dir", str(tmp_path / "actor-images"))
    monkeypatch.setattr(local_movie_library_service, "_actor_sync_lock", asyncio.Lock())
    monkeypatch.setattr(local_movie_library_service, "_actor_revision", 0)
    monkeypatch.setattr(local_movie_library_service, "_snapshot_generation", "legacy")
    monkeypatch.setattr(local_movie_library_service, "_has_updates", False)
    monkeypatch.setattr(local_movie_library_service, "_actors_dirty", False)
    monkeypatch.setattr(image_proxy_module, "image_proxy_service", image_proxy_module.ImageProxyService(tmp_path / "images"))
    monkeypatch.setattr(javbus_api_service, "metadata_cache", MovieMetadataCache(tmp_path / "movie-metadata-cache.json"))
    monkeypatch.setattr(download_history_service, "file_path", str(tmp_path / "download-history.json"))
    monkeypatch.setattr(download_history_service, "_cache", {})
    monkeypatch.setattr(download_history_service, "_loaded", True)
    monkeypatch.setattr(download_history_service, "_lock", asyncio.Lock())
