import json
import re
import subprocess

import pytest
from fastapi.testclient import TestClient

import main
from modules.common import runtime
from modules.system import router as system_router
from modules.ui import router as ui_router


REVISION = "1234567890abcdef1234567890abcdef12345678"
BUILT_AT = "2026-10-20T04:00:00Z"
DEPLOYED_AT = "2026-10-20T04:30:00Z"


@pytest.fixture(autouse=True)
def clean_build_environment(monkeypatch):
    for key in ("JAVJAEGER_REVISION", "JAVJAEGER_BUILT_AT", "JAVJAEGER_DEPLOYED_AT"):
        monkeypatch.delenv(key, raising=False)


def test_image_metadata_works_without_git_and_keeps_deployment_time(monkeypatch):
    monkeypatch.setenv("JAVJAEGER_REVISION", REVISION)
    monkeypatch.setenv("JAVJAEGER_BUILT_AT", BUILT_AT)
    monkeypatch.setenv("JAVJAEGER_DEPLOYED_AT", DEPLOYED_AT)
    monkeypatch.setattr(subprocess, "check_output", lambda *a, **kw: pytest.fail("image metadata must not require git"))
    info = runtime.get_version_info()
    assert info == runtime.get_version_info()
    assert info == {"version": "git-1234567", "revision": REVISION, "build_date": "2026-10-20",
                    "built_at": BUILT_AT, "deployed_at": DEPLOYED_AT}


def test_source_checkout_uses_actual_commit_and_never_calls_commit_time_deployment_time(monkeypatch):
    def git(args, **kwargs):
        return {("git", "rev-parse", "HEAD"): REVISION.encode(),
                ("git", "log", "-1", "--format=%cI"): b"2026-10-20T06:00:00+02:00"}[tuple(args)]
    monkeypatch.setattr(subprocess, "check_output", git)
    info = runtime.get_version_info()
    assert info["revision"] == REVISION and info["version"] == "git-1234567"
    assert info["built_at"] == BUILT_AT and info["deployed_at"] == ""


def test_missing_or_invalid_metadata_stays_unknown_instead_of_inventing_a_release(monkeypatch):
    def no_git(*args, **kwargs):
        raise FileNotFoundError("git unavailable")
    monkeypatch.setattr(subprocess, "check_output", no_git)
    monkeypatch.setenv("JAVJAEGER_REVISION", "not-a-commit")
    monkeypatch.setenv("JAVJAEGER_BUILT_AT", "invalid-date")
    monkeypatch.setenv("JAVJAEGER_DEPLOYED_AT", "2026-10-20T04:30:00")
    info = runtime.get_version_info()
    assert info["version"] == "版本未知"
    assert info["revision"] == info["built_at"] == info["build_date"] == info["deployed_at"] == ""


def test_shell_and_system_api_publish_the_same_deployment_metadata(monkeypatch):
    info = {"version": "git-1234567", "revision": REVISION, "built_at": BUILT_AT,
            "build_date": "2026-10-20", "deployed_at": DEPLOYED_AT}
    monkeypatch.setattr(ui_router, "VERSION_INFO", info)
    monkeypatch.setattr(system_router, "VERSION_INFO", info)
    client = TestClient(main.app)
    html = client.get("/").text
    injected = json.loads(re.search(r"window.versionInfo\s*=\s*(\{.*?\});", html, re.S).group(1))
    api = client.get("/api/system/info").json()["version"]
    assert all(injected[key] == api[key] == value for key, value in info.items())
