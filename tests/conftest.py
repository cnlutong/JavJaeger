"""Default download history is always disposable, including new failure paths."""
import asyncio

import pytest

from modules.history.service import download_history_service


@pytest.fixture(autouse=True)
def isolated_download_history(tmp_path, monkeypatch):
    monkeypatch.setattr(download_history_service, "file_path", str(tmp_path / "download-history.json"))
    monkeypatch.setattr(download_history_service, "_cache", {})
    monkeypatch.setattr(download_history_service, "_loaded", True)
    monkeypatch.setattr(download_history_service, "_lock", asyncio.Lock())
