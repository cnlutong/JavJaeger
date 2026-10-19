import asyncio
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from modules.common.http_client import http_client_scope
from modules.movies import metadata_scrapers


@pytest.fixture
def local_http_server(monkeypatch):
    class Server(ThreadingHTTPServer):
        daemon_threads = True

        def get_request(self):
            connection, address = super().get_request()
            connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            self.connections.append(address)
            return connection, address

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def do_GET(self):
            self.server.requests.append(self.path)
            body = f"fixture {self.path}".encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    monkeypatch.setenv("NO_PROXY", "127.0.0.1")
    monkeypatch.setenv("no_proxy", "127.0.0.1")
    server = Server(("127.0.0.1", 0), Handler)
    server.connections, server.requests = [], []
    server.url = f"http://127.0.0.1:{server.server_port}"
    thread = threading.Thread(target=lambda: server.serve_forever(poll_interval=0.02), daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


async def fetch_fixture(server, path):
    url = server.url + path
    text, final_url = await metadata_scrapers._fetch_text("local fixture", url, {"request_delay": 0, "timeout": 2})
    assert text == f"fixture {path}"
    assert final_url == url


def test_sequential_scraper_requests_reuse_one_tcp_connection(local_http_server):
    server = local_http_server

    async def check():
        async with http_client_scope():
            for index in range(12):
                await fetch_fixture(server, f"/sequential/{index}")

    start = time.perf_counter()
    asyncio.run(check())
    print({"workload": "12 sequential", "requests": len(server.requests),
           "tcp_connections": len(server.connections), "seconds": round(time.perf_counter() - start, 3)})
    assert len(server.requests) == 12
    assert len(server.connections) == 1, "count actual accepted sockets, not just AsyncClient instances"


def test_concurrent_scraper_waves_reuse_existing_tcp_connections(local_http_server):
    server = local_http_server

    async def check():
        async with http_client_scope():
            await asyncio.gather(*(fetch_fixture(server, f"/first/{index}") for index in range(4)))
            first_wave_connections = len(server.connections)
            assert 1 <= first_wave_connections <= 4
            await asyncio.gather(*(fetch_fixture(server, f"/second/{index}") for index in range(4)))
            assert len(server.connections) == first_wave_connections, "the second wave must reuse keep-alive sockets"

    start = time.perf_counter()
    asyncio.run(check())
    print({"workload": "2 x 4 concurrent", "requests": len(server.requests),
           "tcp_connections": len(server.connections), "seconds": round(time.perf_counter() - start, 3)})
    assert len(server.requests) == 8


def test_nested_scopes_share_sockets_and_later_batches_start_fresh(local_http_server):
    server = local_http_server

    async def check():
        async with http_client_scope():
            await fetch_fixture(server, "/outer/first")
            async with http_client_scope():
                await fetch_fixture(server, "/nested")
            await fetch_fixture(server, "/outer/last")
            assert len(server.connections) == 1, "exiting a nested scope must preserve its outer connection pool"
        async with http_client_scope():
            await fetch_fixture(server, "/new-batch")
            assert len(server.connections) == 2, "a new batch must not reuse the closed previous pool"

    asyncio.run(check())
    assert len(server.requests) == 4
