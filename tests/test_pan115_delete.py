import asyncio
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi.testclient import TestClient

from main import app
from modules.pan115 import service


COOKIE = "UID=42_fixture;CID=private-cid;SEID=private-seid;KID=private-kid"


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(service, "get_pan115_config", lambda: {"enabled": True, "cookie": COOKIE})
    monkeypatch.setattr(service, "directory_cache", service.Pan115DirectoryCache())


def mock_http(monkeypatch, handler):
    client_class = httpx.AsyncClient
    monkeypatch.setattr(service.httpx, "AsyncClient", lambda **kwargs: client_class(transport=httpx.MockTransport(handler), **kwargs))


def test_directory_ids_are_the_entry_ids_and_never_a_files_parent_id():
    payload = service._normalize_directory_payload({"data": [
        {"cid": "12", "pid": "0", "fc": "0", "n": "folder"},
        {"cid": "12", "fid": "34", "fc": "1", "n": "file.mp4"},
        {"cid": "12", "fc": "1", "n": "missing-id.mp4"},
    ]})
    assert [item["id"] for item in payload["items"]] == ["12", "34", ""]
    assert [item["kind"] == "folder" for item in payload["items"]] == [True, False, False]


@pytest.mark.parametrize("body", [
    {}, {"ids": []}, {"ids": None}, {"ids": "123"},
    *({"ids": [value]} for value in ["", "0", "00", "-1", "1.2", "../12", "/12", "1,2", " 12", "１２", 12, 1.2, True, None]),
    {"ids": ["12", "0"]},
])
def test_delete_route_rejects_empty_and_non_positive_string_ids_before_upstream(body, monkeypatch):
    mock_http(monkeypatch, lambda _: pytest.fail("invalid ids must not reach 115"))
    response = TestClient(app).request("DELETE", "/api/115/files", json=body)
    assert response.status_code == 422


def test_delete_route_batches_files_and_folders_deduplicates_and_invalidates_only_account_cache(configured, monkeypatch):
    calls = []
    cache = service.directory_cache
    keys = [("42", "0", 0, 100), ("42", "12", 100, 100), ("42", "34", 0, 200), ("other", "0", 0, 100)]
    for key in keys:
        cache.set(key, {"items": [{"id": "stale"}]})

    def respond(request):
        calls.append(request)
        return httpx.Response(200, json={"state": True, "data": {}})

    mock_http(monkeypatch, respond)
    response = TestClient(app).request("DELETE", "/api/115/files", json={"ids": ["12", "34", "12"]})

    assert response.status_code == 200
    assert response.json() == {"success": True, "deleted_ids": ["12", "34"]}
    assert len(calls) == 1
    assert calls[0].method == "POST" and str(calls[0].url) == "https://webapi.115.com/rb/delete"
    assert parse_qs(calls[0].content.decode()) == {"fid[0]": ["12"], "fid[1]": ["34"]}
    assert calls[0].headers["cookie"] == COOKIE
    assert all(cache.get(key, 120) is None for key in keys[:-1])
    assert cache.get(keys[-1], 120) is not None
    assert "private-" not in response.text


@pytest.mark.parametrize("failure", ["rejected", "missing-state", "non-object", "http", "timeout", "invalid-json"])
def test_delete_failure_is_sanitized_and_invalidates_uncertain_account_cache(configured, monkeypatch, caplog, failure):
    key = ("42", "0", 0, 100)
    service.directory_cache.set(key, {"items": [{"id": "12"}]})

    def respond(request):
        if failure == "timeout":
            raise httpx.ReadTimeout("Cookie=" + COOKIE, request=request)
        if failure == "invalid-json":
            return httpx.Response(200, text="Cookie=" + COOKIE)
        if failure == "http":
            return httpx.Response(503, text="Cookie=" + COOKIE)
        payload = {"state": False, "error": "Cookie=" + COOKIE} if failure == "rejected" else {} if failure == "missing-state" else []
        return httpx.Response(200, json=payload)

    mock_http(monkeypatch, respond)
    response = TestClient(app).request("DELETE", "/api/115/files", json={"ids": ["12"]})

    assert response.status_code == 400
    assert response.json() == {"detail": "pan115_delete_failed"}
    assert service.directory_cache.get(key, 120) is None
    assert "private-" not in response.text + caplog.text


@pytest.mark.parametrize("config,error", [
    ({"enabled": False, "cookie": COOKIE}, "pan115_not_configured"),
    ({"enabled": True, "cookie": ""}, "pan115_not_configured"),
    ({"enabled": True, "cookie": "private-cookie"}, "pan115_cookie_invalid"),
])
def test_delete_requires_configured_valid_cookie(config, error, monkeypatch):
    monkeypatch.setattr(service, "get_pan115_config", lambda: config)
    mock_http(monkeypatch, lambda _: pytest.fail("unconfigured requests must not reach 115"))
    response = TestClient(app).request("DELETE", "/api/115/files", json={"ids": ["12"]})
    assert response.status_code == 400
    assert response.json() == {"detail": error}
    assert "private-" not in response.text


def test_inflight_directory_response_cannot_recache_old_contents_after_delete(configured, monkeypatch):
    async def exercise():
        started, finish = asyncio.Event(), asyncio.Event()

        async def respond(request):
            if request.method == "GET":
                started.set()
                await finish.wait()
                return httpx.Response(200, json={"state": True, "cid": "0", "data": [{"fid": "12", "n": "stale.mp4"}]})
            return httpx.Response(200, json={"state": True})

        mock_http(monkeypatch, respond)
        client = service.Pan115Client(COOKIE)
        listing = asyncio.create_task(client.list_directory())
        await started.wait()
        await client.delete_files(["12"])
        finish.set()
        await listing
        assert service.directory_cache.get(("42", "0", 0, 100), 120) is None

    asyncio.run(exercise())


def test_delete_requests_are_serialized_as_required_by_115(configured, monkeypatch):
    async def exercise():
        entered, finish = asyncio.Event(), asyncio.Event()
        calls = []

        async def respond(request):
            calls.append(request)
            if len(calls) == 1:
                entered.set()
                await finish.wait()
            return httpx.Response(200, json={"state": True})

        mock_http(monkeypatch, respond)
        first = asyncio.create_task(service.Pan115Client(COOKIE).delete_files(["12"]))
        await entered.wait()
        second = asyncio.create_task(service.Pan115Client(COOKIE).delete_files(["34"]))
        await asyncio.sleep(0)
        assert len(calls) == 1
        finish.set()
        await asyncio.gather(first, second)
        assert len(calls) == 2

    asyncio.run(exercise())


def test_delete_route_precedes_catch_all():
    routes = app.routes
    delete = next(index for index, route in enumerate(routes) if getattr(route, "path", "") == "/api/115/files" and "DELETE" in getattr(route, "methods", ()))
    catch_all = next(index for index, route in enumerate(routes) if getattr(route, "path", "") == "/api/{path:path}")
    assert delete < catch_all
