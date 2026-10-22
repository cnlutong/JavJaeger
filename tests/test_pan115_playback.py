import asyncio
import logging

import httpx
import pytest

from modules.pan115 import service


COOKIE = "UID=42_fixture;CID=private-cid;SEID=private-seid"
HASH = "a" * 40


@pytest.mark.parametrize("item,rejected", [
    ({"state": False}, True),
    ({"state": False, "errcode": 10008, "info_hash": HASH}, False),
    ({"state": True}, False),
    ({"state": 0}, False),
    ({"state": "false"}, False),
    ({}, False),
    (None, False),
])
def test_add_result_marks_only_explicit_non_existing_task_rejections(item, rejected):
    result = service._normalize_add_results(["magnet:test"], [item])[0]
    assert (result.get("rejected") is True) is rejected


def mock_http(monkeypatch, handler):
    client_class = httpx.AsyncClient
    monkeypatch.setattr(service.httpx, "AsyncClient", lambda **kwargs: client_class(transport=httpx.MockTransport(handler), **kwargs))


@pytest.mark.parametrize("status,expected", [(0, "downloading"), (1, "downloading"), (2, "completed"), (-1, "failed")])
def test_offline_task_matches_hash_across_pages_and_normalizes_provider_status(monkeypatch, status, expected):
    pages = []

    def respond(request):
        assert request.headers["cookie"] == COOKIE
        assert request.url.params["ac"] == "task_lists"
        page = int(request.url.params["page"])
        pages.append(page)
        tasks = [{"info_hash": "b" * 40}] if page == 1 else [{"info_hash": HASH.upper(), "status": status,
            "percentDone": "47.5", "file_id": "800", "wp_path_id": "0", "url": "private-url", "message": COOKIE}]
        return httpx.Response(200, json={"state": True, "page_count": 2, "tasks": tasks})

    mock_http(monkeypatch, respond)
    result = asyncio.run(service.Pan115Client(COOKIE).get_offline_task(HASH))
    assert pages == [1, 2]
    assert result == {"info_hash": HASH, "status": expected, "progress": 100 if status == 2 else 47.5, "file_id": "800", "folder_id": None}
    assert "private" not in str(result)


@pytest.mark.parametrize("present", [True, False])
def test_offline_task_large_history_needs_at_most_three_requests(monkeypatch, present):
    history = [{"info_hash": "b" * 40} for _ in range(3000)]
    if present:
        history[-1] = {"info_hash": HASH, "status": 2, "file_id": "800"}
    requests = []

    def respond(request):
        page, page_size = (int(request.url.params[key]) for key in ("page", "page_size"))
        requests.append(page)
        start = (page - 1) * page_size
        return httpx.Response(200, json={"state": True,
            "page_count": (len(history) + page_size - 1) // page_size,
            "tasks": history[start:start + page_size]})

    mock_http(monkeypatch, respond)
    result = asyncio.run(service.Pan115Client(COOKIE).get_offline_task(HASH))
    assert (result or {}).get("info_hash") == (HASH if present else None)
    assert len(requests) <= 3


def test_offline_task_absence_and_rejection_do_not_expose_provider_messages(monkeypatch):
    mock_http(monkeypatch, lambda request: httpx.Response(200, json={"state": True, "page_count": 1, "tasks": []}))
    assert asyncio.run(service.Pan115Client(COOKIE).get_offline_task(HASH)) is None
    mock_http(monkeypatch, lambda request: httpx.Response(200, json={"state": False, "error": COOKIE}))
    with pytest.raises(service.Pan115Error) as error:
        asyncio.run(service.Pan115Client(COOKIE).get_offline_task(HASH))
    assert error.value.code == "pan115_offline_list_failed"
    assert "private" not in str(error.value)


@pytest.mark.parametrize("folder", [True, False])
@pytest.mark.parametrize("compact", [True, False])
def test_completed_task_resolves_only_its_own_file_or_folder_with_fresh_pages(monkeypatch, folder, compact):
    listed = []

    def respond(request):
        assert request.url.path == "/files/get_info"
        assert request.url.params["file_id"] == "800"
        entry = ({"cid": "800", "n": "movie", "fc": 0, "pc": "directory-pick"} if folder else
            {"fid": "800", "cid": "99", "n": "movie.mp4", "fc": 1, "pc": "direct", "s": "900"}) if compact else {
            "file_id": "800", "file_category": 0 if folder else 1,
            "file_name": "movie" if folder else "movie.mp4", "pick_code": "direct", "file_size": "900"}
        return httpx.Response(200, json={"state": True, "data": [entry]})

    async def list_all(self, cid, **kwargs):
        assert kwargs == {"cache_ttl_seconds": 0}
        listed.append(cid)
        if cid == "800":
            return {"cid": cid, "items": [{"kind": "mp4", "name": "sample.mp4", "size": 10, "pick_code": "sample"},
                {"id": "801", "kind": "folder"}]}
        assert cid == "801"
        return {"cid": cid, "items": [{"kind": "mkv", "name": "main.mkv", "size": 2000, "pick_code": "main"},
            {"kind": "txt", "name": "readme.txt", "size": 5000, "pick_code": "text"}, {"id": "800", "kind": "folder"}]}

    mock_http(monkeypatch, respond)
    monkeypatch.setattr(service.Pan115Client, "list_directory_all", list_all)
    result = asyncio.run(service.Pan115Client(COOKIE).find_playable_file({"file_id": "800", "folder_id": None}))
    assert result == ({"name": "main.mkv", "pick_code": "main", "size": 2000} if folder else {"name": "movie.mp4", "pick_code": "direct", "size": 900})
    assert listed == (["800", "801"] if folder else [])


@pytest.mark.parametrize("folder", [True, False])
def test_compact_task_file_identity_mismatch_never_scans_or_plays(monkeypatch, folder):
    entry = {"cid": "999", "n": "unrelated", "fc": 0} if folder else {
        "fid": "999", "cid": "800", "n": "unrelated.mp4", "fc": 1, "pc": "wrong", "s": 99999}
    mock_http(monkeypatch, lambda request: httpx.Response(200, json={"state": True, "data": [entry]}))

    async def list_all(*args, **kwargs):
        pytest.fail("must not scan an uncorrelated file or folder")

    monkeypatch.setattr(service.Pan115Client, "list_directory_all", list_all)
    assert asyncio.run(service.Pan115Client(COOKIE).find_playable_file({"file_id": "800"})) is None


def test_task_without_correlated_id_and_directory_root_fallback_never_scan_account(monkeypatch):
    async def list_all(self, cid, **kwargs):
        assert cid == "800"
        return {"cid": "0", "items": [{"name": "unrelated.mp4", "size": 99999, "pick_code": "wrong"}]}

    monkeypatch.setattr(service.Pan115Client, "list_directory_all", list_all)
    client = service.Pan115Client(COOKIE)
    assert asyncio.run(client.find_playable_file({"file_id": None, "folder_id": None, "wp_path_id": "0"})) is None
    assert asyncio.run(client.find_playable_file({"folder_id": "800"})) is None


def stream_setup(monkeypatch, handler):
    monkeypatch.setattr(service, "get_pan115_config", lambda: {"enabled": True, "cookie": COOKIE})

    async def resolve(self, pick_code, **kwargs):
        assert pick_code == "main"
        return service.Pan115ResolvedDownload("movie.mp4", "https://cdn.test/movie?token=private-signed", ["Cookie: " + COOKIE, "Authorization: private-auth"])

    monkeypatch.setattr(service.Pan115Client, "resolve_direct_download", resolve)
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(service.httpx, "AsyncHTTPTransport", lambda **kwargs: transport)
    return transport


def test_stream_forwards_range_and_video_bytes_without_credentials_signed_url_or_logs(monkeypatch, caplog):
    calls = []

    def respond(request):
        calls.append(request)
        return httpx.Response(206, content=b"video", headers={"Content-Type": "video/mp4", "Content-Length": "5",
            "Content-Range": "bytes 10-14/100", "Accept-Ranges": "bytes", "Set-Cookie": "private-cookie", "Location": "private-url"})

    stream_setup(monkeypatch, respond)
    caplog.set_level(logging.INFO)

    async def exercise():
        response = await service.stream_playback("main", "42", range_header="bytes=10-14")
        assert response.status_code == 206
        assert response.headers["content-range"] == "bytes 10-14/100"
        assert response.headers["cache-control"] == "private, no-store"
        assert b"".join([chunk async for chunk in response.body_iterator]) == b"video"
        assert "private" not in str(dict(response.headers)).replace("private, no-store", "")

    asyncio.run(exercise())
    assert calls[0].headers["range"] == "bytes=10-14"
    assert calls[0].headers["user-agent"] == service.PAN115_DOWNLOAD_USER_AGENT
    assert all(name not in calls[0].headers for name in ["cookie", "authorization", "referer"])
    assert "private" not in caplog.text


@pytest.mark.parametrize("upstream_status,expected", [(416, 416), (302, None), (403, None)])
def test_stream_handles_unsatisfiable_range_and_sanitizes_upstream_failures(monkeypatch, upstream_status, expected):
    stream_setup(monkeypatch, lambda request: httpx.Response(upstream_status, content=b"private-upstream-error",
        headers={"Content-Range": "bytes */100", "Location": "https://cdn.test/?token=private-signed"}))

    async def exercise():
        if expected:
            response = await service.stream_playback("main", "42", "bytes=100-")
            assert response.status_code == 416 and response.body == b""
            assert response.headers["content-range"] == "bytes */100"
        else:
            with pytest.raises(service.Pan115Error) as error:
                await service.stream_playback("main", "42")
            assert error.value.code == "pan115_playback_unavailable"
            assert "private" not in str(error.value)

    asyncio.run(exercise())


def test_stream_rejects_account_switch_before_resolving_and_invalid_ranges(monkeypatch):
    stream_setup(monkeypatch, lambda request: pytest.fail("must not contact CDN"))

    async def resolve(*args, **kwargs):
        pytest.fail("must not resolve for a different account or invalid range")

    monkeypatch.setattr(service.Pan115Client, "resolve_direct_download", resolve)
    for account, range_header, error_code in [("other", None, "pan115_account_changed"), ("42", "bytes=0-1,5-6", "pan115_range_invalid"), ("42", "bytes=7-3", "pan115_range_invalid"), ("42", "bytes=" + "9" * 5000 + "-", "pan115_range_invalid")]:
        with pytest.raises(service.Pan115Error) as error:
            asyncio.run(service.stream_playback("main", account, range_header))
        assert error.value.code == error_code


@pytest.mark.parametrize("during_body", [False, True])
@pytest.mark.parametrize("error_class", [httpx.ReadError, RuntimeError])
def test_stream_network_failure_suppresses_signed_url_and_closes_transport(monkeypatch, caplog, during_body, error_class):
    class BrokenBody(httpx.AsyncByteStream):
        closed = False

        async def __aiter__(self):
            yield b"video"
            raise error_class("private-signed https://cdn.test/?token=private-signed")

        async def aclose(self):
            self.closed = True

    body = BrokenBody()
    closed = []

    def respond(request):
        if not during_body:
            raise httpx.ConnectError("private-signed https://cdn.test/?token=private-signed", request=request)
        return httpx.Response(200, stream=body, headers={"Content-Type": "video/mp4"})

    transport = stream_setup(monkeypatch, respond)

    async def close_transport():
        closed.append(True)

    monkeypatch.setattr(transport, "aclose", close_transport)
    caplog.set_level(logging.DEBUG)

    async def exercise():
        with pytest.raises(service.Pan115Error) as error:
            response = await service.stream_playback("main", "42")
            _ = [chunk async for chunk in response.body_iterator]
        assert error.value.__suppress_context__ is True
        assert "private" not in str(error.value)
        assert closed
        if during_body:
            assert body.closed

    asyncio.run(exercise())
    assert "private" not in caplog.text


def test_account_switch_while_resolving_is_rejected_before_cdn(monkeypatch):
    stream_setup(monkeypatch, lambda request: pytest.fail("must not contact CDN after account switch"))

    async def resolve(self, pick_code, **kwargs):
        monkeypatch.setattr(service, "get_pan115_config", lambda: {"enabled": True, "cookie": COOKIE.replace("42_fixture", "99_fixture")})
        return service.Pan115ResolvedDownload("movie.mp4", "https://cdn.test/?token=private-signed", [])

    monkeypatch.setattr(service.Pan115Client, "resolve_direct_download", resolve)
    with pytest.raises(service.Pan115Error) as error:
        asyncio.run(service.stream_playback("main", "42"))
    assert error.value.code == "pan115_account_changed"


def test_stream_cancellation_closes_transport_and_remains_cancelled(monkeypatch):
    async def exercise():
        started, closed = asyncio.Event(), asyncio.Event()

        async def respond(request):
            started.set()
            await asyncio.Event().wait()

        transport = stream_setup(monkeypatch, respond)

        async def close_transport():
            closed.set()

        monkeypatch.setattr(transport, "aclose", close_transport)
        task = asyncio.create_task(service.stream_playback("main", "42"))
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert closed.is_set()

    asyncio.run(exercise())


def test_stream_cleanup_failure_cannot_expose_signed_url_or_skip_transport_close(monkeypatch):
    class Body(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b"video"

        async def aclose(self):
            raise RuntimeError("https://cdn.test/?token=private-signed")

    transport = stream_setup(monkeypatch, lambda request: httpx.Response(200, stream=Body(), headers={"Content-Type": "video/mp4"}))
    closed = []

    async def close_transport():
        closed.append(True)
        raise RuntimeError("https://cdn.test/?token=private-signed")

    monkeypatch.setattr(transport, "aclose", close_transport)

    async def exercise():
        response = await service.stream_playback("main", "42")
        with pytest.raises(service.Pan115Error) as error:
            _ = [chunk async for chunk in response.body_iterator]
        assert "private" not in str(error.value)
        assert error.value.__suppress_context__
        assert closed

    asyncio.run(exercise())
