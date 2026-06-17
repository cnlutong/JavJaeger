import asyncio

import main
from modules.common import runtime
from modules.webdav.clients import WebDavClient
from modules.webdav.session_state import WebDavSessionStore


def test_proxy_router_is_registered_after_concrete_api_routes():
    api_paths = [route.path for route in main.app.routes if getattr(route, "path", "").startswith("/api")]

    assert "/api/system/info" in api_paths
    assert "/api/movies" in api_paths
    assert "/api/{path:path}" == api_paths[-1]


def test_client_config_redacts_sensitive_values(monkeypatch):
    test_config = runtime.merge_config(
        runtime.DEFAULT_CONFIG,
        {
            "webdav": {
                "enabled": True,
                "url": "https://dav.example.test/",
                "username": "webdav-user",
                "password": "webdav-password",
                "auto_connect": True,
            },
            "aria2": {
                "enabled": True,
                "url": "http://127.0.0.1:6800/jsonrpc",
                "secret": "aria2-secret",
                "auto_connect": True,
            },
            "pikpak": {
                "enabled": True,
                "username": "pikpak-user",
                "password": "pikpak-password",
                "auto_login": True,
            },
        },
    )
    monkeypatch.setattr(runtime, "config", test_config)

    client_config = runtime.build_client_config()

    assert client_config["webdav"]["configured"] is True
    assert client_config["webdav"]["username"] == "webdav-user"
    assert "password" not in client_config["webdav"]
    assert client_config["aria2"]["has_secret"] is True
    assert "secret" not in client_config["aria2"]
    assert client_config["pikpak"]["username"] == "pikpak-user"
    assert "password" not in client_config["pikpak"]


def test_webdav_download_url_keeps_credentials_out_of_url():
    client = WebDavClient("https://dav.example.test/root/", username="alice", password="secret")

    try:
        download_url = client._build_download_url("/movies/sample.mp4")
        aria2_options = client.build_aria2_options()
    finally:
        client.close()

    assert download_url == "https://dav.example.test/movies/sample.mp4"
    assert "alice:secret@" not in download_url
    assert aria2_options["http-user"] == "alice"
    assert aria2_options["http-passwd"] == "secret"


def test_webdav_session_store_isolates_browser_sessions():
    class FakeRequest:
        def __init__(self):
            self.session = {}

    async def exercise_store():
        store = WebDavSessionStore()
        first_request = FakeRequest()
        second_request = FakeRequest()

        first_state = await store.get_state(first_request)
        second_state = await store.get_state(second_request)
        first_state.webdav_url = "https://first.example.test/"
        second_state.webdav_url = "https://second.example.test/"
        repeated_first_state = await store.get_state(first_request)
        first_url = repeated_first_state.webdav_url

        await store.close_all()
        return first_state, second_state, repeated_first_state, first_url, first_request, second_request

    first_state, second_state, repeated_first_state, first_url, first_request, second_request = asyncio.run(
        exercise_store()
    )

    assert first_request.session["webdav_session_id"] != second_request.session["webdav_session_id"]
    assert first_state is repeated_first_state
    assert first_state is not second_state
    assert first_url == "https://first.example.test/"
