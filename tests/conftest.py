"""Download history and shared metadata caches always use disposable test paths."""
import asyncio

import pytest

from modules.history.service import download_history_service
from modules.javbus_api import javbus_api_service
from modules.javbus_api.metadata_cache import MovieMetadataCache
from modules.proxy import service as image_proxy_module


@pytest.fixture(autouse=True)
def isolated_download_history(tmp_path, monkeypatch):
    monkeypatch.setattr(image_proxy_module, "image_proxy_service", image_proxy_module.ImageProxyService(tmp_path / "images"))
    monkeypatch.setattr(javbus_api_service, "metadata_cache", MovieMetadataCache(tmp_path / "movie-metadata-cache.json"))
    monkeypatch.setattr(download_history_service, "file_path", str(tmp_path / "download-history.json"))
    monkeypatch.setattr(download_history_service, "_cache", {})
    monkeypatch.setattr(download_history_service, "_loaded", True)
    monkeypatch.setattr(download_history_service, "_lock", asyncio.Lock())
