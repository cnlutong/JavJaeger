"""A disconnected local player must release its original-file response."""
import asyncio
import os

import anyio
import pytest
from fastapi import FastAPI

from modules.movies.router import local_movie_library_service, router


def local_playback_scope():
    return {
        "type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1", "method": "GET", "scheme": "http",
        "path": "/api/movies/local-library/TV-001/play",
        "raw_path": b"/api/movies/local-library/TV-001/play",
        "query_string": b"file_index=0", "root_path": "",
        "headers": [(b"host", b"test"), (b"range", b"bytes=0-")],
        "client": ("127.0.0.1", 12345), "server": ("test", 80),
    }


@pytest.mark.parametrize(
    ("with_middleware", "client_signal"),
    [(False, "disconnect"), (True, "disconnect"), (False, "send-error")],
    ids=["router", "call-next-middleware", "send-os-error"],
)
def test_open_ended_local_playback_stops_reading_and_closes_file_after_disconnect(
    tmp_path, monkeypatch, with_middleware, client_signal
):
    video = tmp_path / "fixture.mp4"
    file_bytes, chunk_bytes = 1024 * 1024, 64 * 1024
    with video.open("wb") as fixture:
        fixture.truncate(file_bytes)

    async def indexed_file(movie_id, file_index):
        return video if movie_id == "TV-001" and file_index == 0 else None

    monkeypatch.setattr(local_movie_library_service, "get_video_file_path", indexed_file)
    original_open_file = anyio.open_file
    handles, read_sizes = [], []

    class CountedFile:
        def __init__(self, handle):
            self.handle = handle

        async def __aenter__(self):
            await self.handle.__aenter__()
            return self

        async def __aexit__(self, *exc):
            return await self.handle.__aexit__(*exc)

        async def read(self, size=-1):
            # Let the disconnect listener run between otherwise fast cached reads.
            await asyncio.sleep(.002)
            chunk = await self.handle.read(size)
            read_sizes.append(len(chunk))
            return chunk

        async def seek(self, *args):
            return await self.handle.seek(*args)

        async def aclose(self):
            await self.handle.aclose()

    async def counted_open_file(path, *args, **kwargs):
        handle = await original_open_file(path, *args, **kwargs)
        if path != video:
            return handle
        handles.append(handle)
        return CountedFile(handle)

    monkeypatch.setattr(anyio, "open_file", counted_open_file)
    app = FastAPI()
    if with_middleware:
        @app.middleware("http")
        async def request_middleware(request, call_next):
            # The same streaming call_next boundary used by main.py's log middleware.
            return await call_next(request)
    app.include_router(router)

    async def exercise():
        disconnected = asyncio.Event()
        request_sent = False
        bytes_at_disconnect = None
        response_start = None

        async def receive():
            nonlocal request_sent
            if not request_sent:
                request_sent = True
                return {"type": "http.request", "body": b"", "more_body": False}
            await disconnected.wait()
            return {"type": "http.disconnect"}

        async def send(message):
            nonlocal bytes_at_disconnect, response_start
            if message["type"] == "http.response.start":
                response_start = message
            elif message["type"] == "http.response.body" and message.get("body"):
                if bytes_at_disconnect is None:
                    bytes_at_disconnect = sum(read_sizes)
                    if client_signal == "send-error":
                        raise BrokenPipeError("Synthetic client closed its socket")
                    disconnected.set()
                # Uvicorn's send returns without an error once the socket is gone.

        await asyncio.wait_for(app(local_playback_scope(), receive, send), timeout=2)
        assert response_start["status"] == 206
        assert dict(response_start["headers"])[b"content-range"] == f"bytes 0-{file_bytes - 1}/{file_bytes}".encode()
        assert bytes_at_disconnect == chunk_bytes
        assert sum(read_sizes) <= bytes_at_disconnect + chunk_bytes, (
            f"Disconnected response kept reading: {sum(read_sizes)} bytes for a {chunk_bytes}-byte client"
        )
        assert sum(read_sizes) < file_bytes, "Disconnected playback must not read to EOF"
        assert handles and all(handle.wrapped.closed for handle in handles), "Disconnected playback leaked its file"

    asyncio.run(exercise())


def test_disconnect_before_headers_keeps_call_next_response_and_never_opens_video(tmp_path, monkeypatch):
    video = tmp_path / "fixture.mp4"
    video.write_bytes(b"video")

    async def indexed_file(movie_id, file_index):
        return video

    async def unexpected_open_file(*args, **kwargs):
        pytest.fail("Already disconnected playback must not open or read the video")

    original_run_sync = anyio.to_thread.run_sync

    async def slow_stat(operation, *args, **kwargs):
        result = await original_run_sync(operation, *args, **kwargs)
        if operation is os.stat and args[0] == video:
            # The client has gone while the response waits for disk metadata.
            await asyncio.sleep(.02)
        return result

    monkeypatch.setattr(local_movie_library_service, "get_video_file_path", indexed_file)
    monkeypatch.setattr(anyio, "open_file", unexpected_open_file)
    monkeypatch.setattr(anyio.to_thread, "run_sync", slow_stat)
    app = FastAPI()

    @app.middleware("http")
    async def request_middleware(request, call_next):
        return await call_next(request)

    app.include_router(router)

    async def exercise():
        starts, bodies = [], []

        async def receive():
            return {"type": "http.disconnect"}

        async def send(message):
            if message["type"] == "http.response.start":
                starts.append(message["status"])
            elif message["type"] == "http.response.body":
                bodies.append(message.get("body", b""))

        await asyncio.wait_for(app(local_playback_scope(), receive, send), timeout=2)
        assert starts == [206], "call_next must receive response headers even after the client disconnects"
        assert not any(bodies)

    asyncio.run(exercise())
