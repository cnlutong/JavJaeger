import asyncio
import json
import os
from pathlib import Path
from types import SimpleNamespace

import main
from modules.automation.schemas import AutomationTaskCreate, AutomationTaskUpdate
from modules.automation.service import AutomationService
from modules.automation import service as automation_service_module
from modules.history.service import local_movie_library_service
from modules.common import runtime
from modules.movies import local_scrape
from modules.movies import local_library as movies_local_library
from modules.movies.local_scrape_tasks import LocalScrapeTaskManager
from modules.movies import service as movies_service
from modules.system import path_browser
from modules.system import settings as system_settings
from modules.ui import router as ui_router
from modules.webdav.clients import WebDavClient
from modules.webdav.session_state import WebDavSessionStore
from modules.webdav import router as webdav_router
from fastapi.testclient import TestClient
from starlette.datastructures import QueryParams
from modules.proxy import router as proxy_router


def test_proxy_router_is_registered_after_concrete_api_routes():
    api_paths = [route.path for route in main.app.routes if getattr(route, "path", "").startswith("/api")]

    assert "/api/system/info" in api_paths
    assert "/api/movies" in api_paths
    assert "/api/automation/tasks" in api_paths
    assert api_paths.index("/api/automation/tasks") < api_paths.index("/api/{path:path}")
    assert "/api/{path:path}" == api_paths[-1]


def test_local_library_poster_route_is_before_status_route():
    api_paths = [route.path for route in main.app.routes if getattr(route, "path", "").startswith("/api")]

    assert api_paths.index("/api/movies/local-library/poster/{movie_id}") < api_paths.index(
        "/api/movies/local-library/{movie_id}"
    )
    assert api_paths.index("/api/movies/local-library/thumbnail/{movie_id}") < api_paths.index(
        "/api/movies/local-library/{movie_id}"
    )
    assert api_paths.index("/api/movies/local-library/actor-avatar/{movie_id}/{actor_name}") < api_paths.index(
        "/api/movies/local-library/{movie_id}"
    )


def test_local_library_play_route_is_before_status_route():
    api_paths = [route.path for route in main.app.routes if getattr(route, "path", "").startswith("/api")]

    assert api_paths.index("/api/movies/local-library/{movie_id}/play") < api_paths.index(
        "/api/movies/local-library/{movie_id}"
    )


def test_local_library_information_routes_are_before_status_route():
    api_paths = [route.path for route in main.app.routes if getattr(route, "path", "").startswith("/api")]

    assert api_paths.index("/api/movies/local-library/information/check") < api_paths.index(
        "/api/movies/local-library/{movie_id}"
    )
    assert api_paths.index("/api/movies/local-library/information/download") < api_paths.index(
        "/api/movies/local-library/{movie_id}"
    )


def test_local_library_delete_movie_route_is_registered():
    movie_routes = [
        route for route in main.app.routes
        if getattr(route, "path", "") == "/api/movies/local-library/{movie_id}"
    ]

    assert any("GET" in getattr(route, "methods", set()) for route in movie_routes)
    assert any("DELETE" in getattr(route, "methods", set()) for route in movie_routes)


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


def test_javbus_default_request_interval_is_conservative():
    assert runtime.DEFAULT_CONFIG["javbus"]["request_interval_seconds"] == 0.5


def test_system_settings_update_persists_and_reconfigures_javbus(tmp_path, monkeypatch):
    config_path = tmp_path / "config.json"
    test_config = runtime.merge_config(
        runtime.DEFAULT_CONFIG,
        {
            "javbus": {
                "base_url": "https://old.example.test",
                "timeout_seconds": 8,
                "proxy": "",
                "request_interval_seconds": 0.5,
            }
        },
    )
    monkeypatch.setattr(runtime, "config", test_config)
    monkeypatch.setattr(runtime, "CONFIG_PATH", str(config_path))

    class FakeJavBusService:
        def __init__(self):
            self.configs = []

        async def reconfigure(self, cfg):
            self.configs.append(cfg)

    fake_service = FakeJavBusService()
    monkeypatch.setattr(system_settings, "javbus_api_service", fake_service)

    client = TestClient(main.app)
    response = client.put(
        "/api/system/settings/javbus",
        json={
            "javbus": {
                "base_url": "https://new.example.test/",
                "timeout_seconds": 12,
                "proxy": "http://127.0.0.1:7890",
                "request_interval_seconds": 0.75,
                "cache_expire_seconds": 7200,
                "cache_max_size": 2000,
                "image_retry_attempts": 5,
                "image_retry_backoff_seconds": 0.4,
            }
        },
    )

    assert response.status_code == 200
    assert response.json()["javbus"]["base_url"] == "https://new.example.test"
    assert response.json()["javbus"]["image_retry_attempts"] == 5
    assert response.json()["javbus"]["image_retry_backoff_seconds"] == 0.4
    assert fake_service.configs[-1]["request_interval_seconds"] == 0.75
    saved = json.loads(config_path.read_text(encoding="utf-8"))
    assert saved["javbus"]["base_url"] == "https://new.example.test"
    assert saved["javbus"]["cache_max_size"] == 2000
    assert saved["javbus"]["image_retry_attempts"] == 5
    assert saved["javbus"]["image_retry_backoff_seconds"] == 0.4


def test_system_settings_payload_groups_user_config_and_redacts_secrets(monkeypatch):
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

    payload = system_settings.build_settings_payload()

    assert set(["javbus", "webdav", "aria2", "pikpak", "security"]).issubset(payload)
    assert payload["webdav"]["url"] == "https://dav.example.test/"
    assert payload["webdav"]["has_password"] is True
    assert "password" not in payload["webdav"]
    assert payload["aria2"]["has_secret"] is True
    assert "secret" not in payload["aria2"]
    assert payload["pikpak"]["username"] == "pikpak-user"
    assert payload["pikpak"]["has_password"] is True
    assert "password" not in payload["pikpak"]


def test_system_settings_update_persists_connector_sections_without_echoing_secrets(tmp_path, monkeypatch):
    config_path = tmp_path / "config.json"
    test_config = runtime.merge_config(runtime.DEFAULT_CONFIG, {})
    monkeypatch.setattr(runtime, "config", test_config)
    monkeypatch.setattr(runtime, "CONFIG_PATH", str(config_path))

    client = TestClient(main.app)
    response = client.put(
        "/api/system/settings",
        json={
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

    assert response.status_code == 200
    payload = response.json()
    assert payload["webdav"]["has_password"] is True
    assert "password" not in payload["webdav"]
    assert payload["aria2"]["has_secret"] is True
    assert "secret" not in payload["aria2"]
    assert payload["pikpak"]["has_password"] is True
    assert "password" not in payload["pikpak"]

    saved = json.loads(config_path.read_text(encoding="utf-8"))
    assert saved["webdav"]["password"] == "webdav-password"
    assert saved["aria2"]["secret"] == "aria2-secret"
    assert saved["pikpak"]["password"] == "pikpak-password"


def test_system_settings_rejects_invalid_javbus_values():
    client = TestClient(main.app)

    response = client.put(
        "/api/system/settings/javbus",
        json={"javbus": {"base_url": "ftp://example.test", "request_interval_seconds": -1}},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "base_url_must_be_http_url"


def test_local_scrape_image_download_uses_configured_retry_policy(tmp_path, monkeypatch):
    attempts = []
    sleeps = []

    class FakeResponse:
        def __init__(self, status_code: int) -> None:
            self.status_code = status_code
            self.content = b"avatar"

        def raise_for_status(self) -> None:
            if self.status_code >= 400:
                raise local_scrape.httpx.HTTPStatusError("failed", request=None, response=self)

    class FakeAsyncClient:
        def __init__(self, **kwargs) -> None:
            self.kwargs = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url, headers=None):
            attempts.append(url)
            return FakeResponse(503 if len(attempts) < 4 else 200)

    async def fake_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(local_scrape.httpx, "AsyncClient", FakeAsyncClient)
    monkeypatch.setattr(local_scrape.asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(
        local_scrape,
        "get_javbus_config",
        lambda: {
            "image_retry_attempts": 4,
            "image_retry_backoff_seconds": 0.1,
        },
    )

    target = tmp_path / "actors" / "Actor One.jpg"
    name = asyncio.run(local_scrape._download_image("https://www.javbus.com/pics/actress/a.jpg", target, True))

    assert name == "Actor One.jpg"
    assert len(attempts) == 4
    assert sleeps == [0.1, 0.2, 0.30000000000000004]
    assert target.read_bytes() == b"avatar"


def test_path_browser_lists_only_child_directories(tmp_path):
    (tmp_path / "Movies").mkdir()
    (tmp_path / "Downloads").mkdir()
    (tmp_path / "sample.mp4").write_text("not a directory", encoding="utf-8")

    payload = path_browser.list_directory_payload(str(tmp_path))

    assert payload["success"] is True
    assert payload["current_path"] == str(tmp_path.resolve())
    assert payload["parent_path"] == str(tmp_path.resolve().parent)
    assert [entry["name"] for entry in payload["entries"]] == ["Downloads", "Movies"]
    assert all(entry["is_directory"] for entry in payload["entries"])


def test_path_browser_reports_invalid_directory(tmp_path):
    payload = path_browser.list_directory_payload(str(tmp_path / "missing"))

    assert payload["success"] is False
    assert payload["error"] == "directory_not_found"


def test_image_proxy_rejects_untrusted_host():
    assert proxy_router._is_allowed_image_host("https://www.javbus.com/pics/thumb/1.jpg")
    assert proxy_router._is_allowed_image_host("https://pics.dmm.co.jp/digital/video/1.jpg")
    assert not proxy_router._is_allowed_image_host("https://example.com/abc.jpg")


def test_html_shell_uses_frontend_asset_version_for_app_bundle():
    client = TestClient(main.app)

    response = client.get("/")

    assert response.status_code == 200
    assert f"/static/app.js?v={main.VERSION_INFO['asset_version']}" in response.text


def test_frontend_cache_headers_not_set_when_disabled_mode_is_false(monkeypatch):
    monkeypatch.setattr(main, "is_frontend_cache_disabled", lambda: False)
    monkeypatch.setattr(ui_router, "is_frontend_cache_disabled", lambda: False)

    client = TestClient(main.app)

    response = client.get("/")

    assert response.status_code == 200
    assert "cache-control" not in {k.lower(): v for k, v in response.headers.items()}


def test_main_middleware_keeps_frontend_cache_headers_disabled_when_not_configured(monkeypatch):
    monkeypatch.setattr(main, "is_frontend_cache_disabled", lambda: False)

    client = TestClient(main.app)
    response = client.get("/static/app.js?v=abc")

    assert response.status_code == 200
    assert response.headers.get("Cache-Control") is None


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


def test_movies_payload_refines_results_with_multiple_filter_tags(monkeypatch):
    class FakeRequest:
        query_params = QueryParams(
            {
                "filters": json.dumps(
                    [
                        {"type": "genre", "value": "4y", "label": "Genre A"},
                        {"type": "genre", "value": "5g", "label": "Genre B"},
                        {"type": "star", "value": "abc", "label": "Actor A"},
                    ]
                ),
                "magnet": "exist",
                "type": "normal",
            }
        )

    class FakeJavBusService:
        def __init__(self):
            self.page_queries = []

        async def get_movies_by_page(self, query):
            self.page_queries.append(query)
            return {
                "movies": [{"id": "MATCH-001"}, {"id": "MISS-001"}],
                "pagination": {"total": 2},
            }

        async def get_movie_detail(self, movie_id):
            details = {
                "MATCH-001": {
                    "genres": [{"id": "4y", "name": "Genre A"}, {"id": "5g", "name": "Genre B"}],
                    "stars": [{"id": "abc", "name": "Actor A"}],
                },
                "MISS-001": {
                    "genres": [{"id": "4y", "name": "Genre A"}],
                    "stars": [{"id": "abc", "name": "Actor A"}],
                },
            }
            return details[movie_id]

    fake_service = FakeJavBusService()
    monkeypatch.setattr(movies_service, "javbus_api_service", fake_service)

    payload = asyncio.run(movies_service.get_movies_payload(FakeRequest()))

    assert fake_service.page_queries == [{"magnet": "exist", "type": "normal", "filterType": "genre", "filterValue": "4y"}]
    assert payload["movies"] == [{"id": "MATCH-001"}]
    assert payload["pagination"]["total"] == 1


def test_download_magnets_to_aria2_routes_success_and_failures(monkeypatch):
    class FakeAria2Client:
        def __init__(self):
            self.calls = []

        def add_download(self, magnet_link):
            self.calls.append(magnet_link)
            if magnet_link == "magnet:fail":
                raise RuntimeError("add-failed")
            return f"gid-{len(self.calls)}"

    fake_aria2_client = FakeAria2Client()

    class FakeSessionStore:
        async def get_state(self, _request):
            return SimpleNamespace(aria2_client=fake_aria2_client)

    monkeypatch.setattr(webdav_router, "session_store", FakeSessionStore())

    client = TestClient(main.app)
    response = client.post(
        "/api/aria2/download-magnets",
        json={
            "magnet_links": ["magnet:ok1", "", "magnet:fail", "magnet:ok2"],
            "movie_ids": ["M1", "M2", "M3", "M4"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["success_count"] == 2
    assert payload["results"][0]["success"] is True
    assert payload["results"][1]["success"] is False
    assert payload["results"][1]["message"] == "磁力链接为空"
    assert payload["results"][2]["success"] is False
    assert payload["results"][2]["error"] == "aria2_add_failed"


def test_download_magnets_to_aria2_requires_connection(monkeypatch):
    class FakeSessionStore:
        async def get_state(self, _request):
            return SimpleNamespace(aria2_client=None)

    monkeypatch.setattr(webdav_router, "session_store", FakeSessionStore())

    client = TestClient(main.app)

    response = client.post(
        "/api/aria2/download-magnets",
        json={
            "magnet_links": ["magnet:ok"],
            "movie_ids": ["M1"],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "请先连接 Aria2"


def test_local_scrape_target_paths_support_custom_folder_templates():
    source_path = Path(r"D:\incoming\ABP-123.mp4")
    metadata = local_scrape._build_metadata(
        {
            "id": "ABP-123",
            "title": "ABP-123 Sample: Title",
            "date": "2024-05-17",
            "producer": {"name": "Studio X"},
            "series": {"name": "Series A"},
            "stars": [{"name": "Actor One"}, {"name": "Actor Two"}],
        },
        "ABP-123",
        source_path.stem,
    )

    target_dir, target_video, target_stem = local_scrape._build_target_paths(
        source_path,
        metadata,
        True,
        r"D:\library",
        "{code}",
        "{actor}/{year}/{title}",
    )

    assert target_dir == Path(r"D:\library") / "Actor One" / "2024" / "ABP-123 Sample_ Title"
    assert target_stem == "ABP-123"
    assert target_video == target_dir / "ABP-123.mp4"


def test_local_scrape_empty_folder_template_uses_target_root():
    source_path = Path(r"D:\incoming\ABP-123.mp4")
    metadata = local_scrape._build_metadata(
        {
            "id": "ABP-123",
            "title": "ABP-123 Sample Title",
        },
        "ABP-123",
        source_path.stem,
    )

    target_dir, target_video, target_stem = local_scrape._build_target_paths(
        source_path,
        metadata,
        True,
        r"D:\library",
        "{code} {title}",
        "",
    )

    assert target_dir == Path(r"D:\library")
    assert target_stem == "ABP-123 Sample Title"
    assert target_video == Path(r"D:\library") / "ABP-123 Sample Title.mp4"


def test_local_scrape_preview_reports_conflict_file_details(tmp_path, monkeypatch):
    source_dir = tmp_path / "source"
    target_dir = tmp_path / "target"
    source_dir.mkdir()
    target_dir.mkdir()
    source_video = source_dir / "ABP-123.mp4"
    source_video.write_bytes(b"source-video")
    target_video = target_dir / "ABP-123 Remote Title" / "ABP-123 Remote Title.mp4"
    target_video.parent.mkdir()
    target_video.write_bytes(b"target-video-longer")

    async def fake_get_movie_detail(movie_id):
        return {
            "id": movie_id,
            "title": "ABP-123 Remote Title",
            "date": "2024-01-02",
        }

    def fake_probe_video_metadata(path):
        if path.resolve() == source_video.resolve():
            return {
                "width": 1920,
                "height": 1080,
                "resolution_pixels": 1920 * 1080,
                "bitrate": 2_000_000,
            }
        return {
            "width": 1280,
            "height": 720,
            "resolution_pixels": 1280 * 720,
            "bitrate": 4_000_000,
        }

    monkeypatch.setattr(local_scrape.javbus_api_service, "get_movie_detail", fake_get_movie_detail)
    monkeypatch.setattr(local_scrape, "_probe_video_metadata", fake_probe_video_metadata)

    payload = asyncio.run(
        local_scrape.preview_local_scrape(
            local_scrape.LocalScrapePreviewRequest(
                directory=str(source_dir),
                target_directory=str(target_dir),
                scrape=True,
            )
        )
    )

    item = payload["items"][0]
    assert item["target_exists"] is True
    assert item["source_file"]["path"] == str(source_video.resolve())
    assert item["source_file"]["size"] == len(b"source-video")
    assert item["source_file"]["width"] == 1920
    assert item["source_file"]["height"] == 1080
    assert item["source_file"]["resolution_pixels"] == 1920 * 1080
    assert item["source_file"]["bitrate"] == 2_000_000
    assert item["target_file"]["path"] == str(target_video.resolve())
    assert item["target_file"]["size"] == len(b"target-video-longer")
    assert item["target_file"]["width"] == 1280
    assert item["target_file"]["height"] == 720
    assert item["target_file"]["resolution_pixels"] == 1280 * 720
    assert item["target_file"]["bitrate"] == 4_000_000


def test_docker_image_installs_ffmpeg_for_local_scrape_media_comparison():
    dockerfile = Path(__file__).resolve().parents[1] / "Dockerfile"
    dockerfile_text = dockerfile.read_text(encoding="utf-8")

    assert "apt-get install" in dockerfile_text
    assert "ffmpeg" in dockerfile_text


def test_local_scrape_apply_respects_per_item_conflict_resolution(tmp_path):
    source_dir = tmp_path / "source"
    target_dir = tmp_path / "target"
    source_dir.mkdir()
    target_dir.mkdir()
    source_video = source_dir / "ABP-123.mp4"
    source_video.write_bytes(b"source-video")
    target_video = target_dir / "ABP-123 Remote Title" / "ABP-123 Remote Title.mp4"
    target_video.parent.mkdir()
    target_video.write_bytes(b"target-video")
    metadata = {
        "id": "ABP-123",
        "title": "ABP-123 Remote Title",
        "raw": {"id": "ABP-123"},
    }

    keep_target = asyncio.run(
        local_scrape.apply_local_scrape(
            local_scrape.LocalScrapeApplyRequest(
                items=[
                    {
                        "source_path": str(source_video),
                        "code": "ABP-123",
                        "metadata": metadata,
                        "conflict_resolution": "keep_target",
                    }
                ],
                target_directory=str(target_dir),
                write_nfo=False,
                download_images=False,
            )
        )
    )

    assert keep_target["success"] is True
    assert keep_target["success_count"] == 1
    assert keep_target["results"][0]["skipped"] is True
    assert keep_target["results"][0]["kept"] == "target"
    assert source_video.exists()
    assert target_video.read_bytes() == b"target-video"

    keep_source = asyncio.run(
        local_scrape.apply_local_scrape(
            local_scrape.LocalScrapeApplyRequest(
                items=[
                    {
                        "source_path": str(source_video),
                        "code": "ABP-123",
                        "metadata": metadata,
                        "conflict_resolution": "keep_source",
                    }
                ],
                target_directory=str(target_dir),
                write_nfo=False,
                download_images=False,
            )
        )
    )

    assert keep_source["success"] is True
    assert keep_source["results"][0]["kept"] == "source"
    assert not source_video.exists()
    assert target_video.read_bytes() == b"source-video"


def test_local_scrape_apply_supports_conflict_keep_skip_newer_older_and_larger(tmp_path):
    source_dir = tmp_path / "source"
    target_dir = tmp_path / "target"
    source_dir.mkdir()
    target_dir.mkdir()
    metadata = {
        "id": "ABP-123",
        "title": "ABP-123 Remote Title",
        "raw": {"id": "ABP-123"},
    }

    async def run_strategy(name, source_bytes, target_bytes, source_mtime, target_mtime):
        source_video = source_dir / "ABP-123.mp4"
        target_video = target_dir / "ABP-123 Remote Title" / "ABP-123 Remote Title.mp4"
        target_video.parent.mkdir(parents=True, exist_ok=True)
        source_video.write_bytes(source_bytes)
        target_video.write_bytes(target_bytes)
        os.utime(source_video, (source_mtime, source_mtime))
        os.utime(target_video, (target_mtime, target_mtime))
        result = await local_scrape.apply_local_scrape(
            local_scrape.LocalScrapeApplyRequest(
                items=[
                    {
                        "source_path": str(source_video),
                        "code": "ABP-123",
                        "metadata": metadata,
                        "conflict_resolution": name,
                    }
                ],
                target_directory=str(target_dir),
                write_nfo=False,
                download_images=False,
            )
        )
        return result, source_video, target_video

    skip, source_video, target_video = asyncio.run(run_strategy("skip", b"source", b"target", 100, 200))
    assert skip["success"] is True
    assert skip["results"][0]["skipped"] is True
    assert skip["results"][0]["message"] == "skipped_conflict"
    assert source_video.exists()
    assert target_video.read_bytes() == b"target"

    newer_source, source_video, target_video = asyncio.run(
        run_strategy("keep_newer", b"new-source", b"old-target", 300, 200)
    )
    assert newer_source["results"][0]["kept"] == "source"
    assert not source_video.exists()
    assert target_video.read_bytes() == b"new-source"

    older_target, source_video, target_video = asyncio.run(
        run_strategy("keep_older", b"new-source", b"old-target", 300, 200)
    )
    assert older_target["results"][0]["skipped"] is True
    assert older_target["results"][0]["kept"] == "target"
    assert source_video.exists()
    assert target_video.read_bytes() == b"old-target"

    larger_source, source_video, target_video = asyncio.run(
        run_strategy("keep_larger", b"source-is-larger", b"target", 100, 200)
    )
    assert larger_source["results"][0]["kept"] == "source"
    assert not source_video.exists()
    assert target_video.read_bytes() == b"source-is-larger"


def test_local_scrape_apply_supports_conflict_resolution_and_bitrate_strategies(tmp_path, monkeypatch):
    source_dir = tmp_path / "source"
    target_dir = tmp_path / "target"
    source_dir.mkdir()
    target_dir.mkdir()
    metadata = {
        "id": "ABP-123",
        "title": "ABP-123 Remote Title",
        "raw": {"id": "ABP-123"},
    }

    def fake_probe(path):
        path_text = str(path)
        if "source" in path_text:
            return {
                "width": 1920,
                "height": 1080,
                "resolution_pixels": 1920 * 1080,
                "bitrate": 1_500_000,
            }
        return {
            "width": 1280,
            "height": 720,
            "resolution_pixels": 1280 * 720,
            "bitrate": 3_000_000,
        }

    monkeypatch.setattr(local_scrape, "_probe_video_metadata", fake_probe)

    async def run_strategy(name, source_bytes, target_bytes):
        source_video = source_dir / "ABP-123.mp4"
        target_video = target_dir / "ABP-123 Remote Title" / "ABP-123 Remote Title.mp4"
        target_video.parent.mkdir(parents=True, exist_ok=True)
        source_video.write_bytes(source_bytes)
        target_video.write_bytes(target_bytes)
        result = await local_scrape.apply_local_scrape(
            local_scrape.LocalScrapeApplyRequest(
                items=[
                    {
                        "source_path": str(source_video),
                        "code": "ABP-123",
                        "metadata": metadata,
                        "conflict_resolution": name,
                    }
                ],
                target_directory=str(target_dir),
                write_nfo=False,
                download_images=False,
            )
        )
        return result, source_video, target_video

    higher_resolution, source_video, target_video = asyncio.run(
        run_strategy("keep_higher_resolution", b"source-resolution", b"target-resolution")
    )
    assert higher_resolution["results"][0]["kept"] == "source"
    assert not source_video.exists()
    assert target_video.read_bytes() == b"source-resolution"

    higher_bitrate, source_video, target_video = asyncio.run(
        run_strategy("keep_higher_bitrate", b"source-bitrate", b"target-bitrate")
    )
    assert higher_bitrate["results"][0]["skipped"] is True
    assert higher_bitrate["results"][0]["kept"] == "target"
    assert source_video.exists()
    assert target_video.read_bytes() == b"target-bitrate"


def test_local_scrape_downloads_images_with_browser_headers_and_keeps_going(tmp_path, monkeypatch):
    requests = []
    attempts = {}

    class FakeResponse:
        def __init__(self, url: str, status_code: int, content: bytes) -> None:
            self.url = url
            self.status_code = status_code
            self.content = content

        def raise_for_status(self) -> None:
            if self.status_code >= 400:
                raise local_scrape.httpx.HTTPStatusError("failed", request=None, response=self)

    class FakeAsyncClient:
        def __init__(self, **kwargs) -> None:
            self.kwargs = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url, headers=None):
            requests.append((url, headers or {}))
            attempts[url] = attempts.get(url, 0) + 1
            if "retry" in url and attempts[url] == 1:
                return FakeResponse(url, 503, b"retry later")
            if "broken" in url:
                return FakeResponse(url, 403, b"forbidden")
            return FakeResponse(url, 200, f"image:{url}".encode("utf-8"))

    monkeypatch.setattr(local_scrape.httpx, "AsyncClient", FakeAsyncClient)

    video = tmp_path / "ABP-123 Sample.mp4"
    metadata = {
        "cover_url": "https://www.javbus.com/pics/cover/abp_b.jpg",
        "samples": [
            {"src": "https://image.mgstage.com/sample/full1.jpg"},
            {"src": "https://image.mgstage.com/sample/broken.jpg"},
            {"thumbnail": "https://image.mgstage.com/sample/thumb3.jpg"},
            {"src": "https://image.mgstage.com/sample/retry.jpg"},
        ],
    }

    poster_name, sample_names = asyncio.run(local_scrape._write_images(video, metadata, overwrite=True))

    assert poster_name == "ABP-123 Sample-poster.jpg"
    assert sample_names == []
    assert (tmp_path / "ABP-123 Sample-poster.jpg").read_bytes().startswith(b"image:")
    assert not (tmp_path / "extrafanart").exists()

    poster_name, sample_names = asyncio.run(
        local_scrape._write_images(video, metadata, overwrite=True, include_samples=True)
    )

    assert poster_name == "ABP-123 Sample-poster.jpg"
    assert sample_names == [
        str(Path("extrafanart") / "fanart1.jpg"),
        str(Path("extrafanart") / "fanart3.jpg"),
        str(Path("extrafanart") / "fanart4.jpg"),
    ]
    assert (tmp_path / "ABP-123 Sample-poster.jpg").read_bytes().startswith(b"image:")
    assert (tmp_path / "extrafanart" / "fanart1.jpg").exists()
    assert not (tmp_path / "extrafanart" / "fanart2.jpg").exists()
    assert (tmp_path / "extrafanart" / "fanart3.jpg").exists()
    assert (tmp_path / "extrafanart" / "fanart4.jpg").exists()
    assert attempts["https://image.mgstage.com/sample/retry.jpg"] == 2
    assert requests
    for _, headers in requests:
        assert "Mozilla/5.0" in headers.get("User-Agent", "")
        assert headers.get("Referer") == "https://www.javbus.com/"
        assert "image/" in headers.get("Accept", "")


def test_local_scrape_downloads_actor_avatars_and_list_thumbnail_options(tmp_path, monkeypatch):
    downloaded = []

    async def fake_download(url, target, overwrite):
        downloaded.append((url, target.relative_to(tmp_path), overwrite))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(f"image:{url}".encode("utf-8"))
        return target.name

    async def fake_star_info(star_id):
        return {
            "id": star_id,
            "avatar": f"https://www.javbus.com/pics/actress/{star_id}.jpg",
        }

    monkeypatch.setattr(local_scrape, "_download_image", fake_download)
    monkeypatch.setattr(local_scrape.javbus_api_service, "get_star_info", fake_star_info)

    video = tmp_path / "ABP-123 Sample.mp4"
    metadata = local_scrape._build_metadata(
        {
            "id": "ABP-123",
            "title": "ABP-123 Sample",
            "img": "https://www.javbus.com/pics/cover/abp_b.jpg",
            "stars": [
                {"id": "star-a", "name": "Actor One"},
                {"id": "star-b", "name": "Actor/Two"},
            ],
        },
        "ABP-123",
        video.stem,
    )

    actor_names = asyncio.run(local_scrape._write_actor_images(video, metadata, overwrite=True))
    thumbnail_name = asyncio.run(local_scrape._write_list_thumbnail(video, metadata, overwrite=True))

    assert actor_names == [
        str(Path("actors") / "Actor One.jpg"),
        str(Path("actors") / "Actor_Two.jpg"),
    ]
    assert thumbnail_name == "ABP-123 Sample-thumb.jpg"
    assert (tmp_path / "actors" / "Actor One.jpg").exists()
    assert (tmp_path / "actors" / "Actor_Two.jpg").exists()
    assert (tmp_path / "ABP-123 Sample-thumb.jpg").exists()
    assert (
        "https://www.javbus.com/pics/thumb/abp.jpg",
        Path("ABP-123 Sample-thumb.jpg"),
        True,
    ) in downloaded


def test_local_scrape_rebuilt_preview_metadata_keeps_actor_refs_for_avatar_download(tmp_path, monkeypatch):
    downloaded = []
    fetched_star_ids = []

    async def fake_download(url, target, overwrite):
        downloaded.append((url, target.relative_to(tmp_path), overwrite))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(f"image:{url}".encode("utf-8"))
        return target.name

    async def fake_star_info(star_id):
        fetched_star_ids.append(star_id)
        return {
            "id": star_id,
            "avatar": f"https://www.javbus.com/pics/actress/{star_id}.jpg",
        }

    monkeypatch.setattr(local_scrape, "_download_image", fake_download)
    monkeypatch.setattr(local_scrape.javbus_api_service, "get_star_info", fake_star_info)

    video = tmp_path / "ABP-123 Sample.mp4"
    preview_metadata = local_scrape._build_metadata(
        {
            "id": "ABP-123",
            "title": "ABP-123 Sample",
            "stars": [{"id": "star-a", "name": "Actor One"}],
        },
        "ABP-123",
        video.stem,
    )

    apply_metadata = local_scrape._build_metadata(preview_metadata, "ABP-123", video.stem)
    actor_names = asyncio.run(local_scrape._write_actor_images(video, apply_metadata, overwrite=True))

    assert apply_metadata["actor_refs"] == [{"id": "star-a", "name": "Actor One"}]
    assert fetched_star_ids == ["star-a"]
    assert actor_names == [str(Path("actors") / "Actor One.jpg")]
    assert (
        "https://www.javbus.com/pics/actress/star-a.jpg",
        Path("actors") / "Actor One.jpg",
        True,
    ) in downloaded


def test_local_scrape_delete_removes_only_video_files_inside_preview_directory(tmp_path):
    keep_dir = tmp_path / "outside"
    scan_dir = tmp_path / "scan"
    keep_dir.mkdir()
    scan_dir.mkdir()
    deletable = scan_dir / "BAD-001.mp4"
    nested = scan_dir / "nested"
    nested.mkdir()
    nested_deletable = nested / "BAD-002.mkv"
    text_file = scan_dir / "notes.txt"
    outside = keep_dir / "OUT-001.mp4"
    for path in (deletable, nested_deletable, text_file, outside):
        path.write_text("content", encoding="utf-8")

    payload = asyncio.run(
        local_scrape.delete_local_scrape_files(
            local_scrape.LocalScrapeDeleteRequest(
                directory=str(scan_dir),
                source_paths=[str(deletable), str(nested_deletable), str(text_file), str(outside)],
            )
        )
    )

    assert payload["deleted_count"] == 2
    assert payload["failed_count"] == 2
    assert not deletable.exists()
    assert not nested_deletable.exists()
    assert text_file.exists()
    assert outside.exists()
    assert [result["error"] for result in payload["results"] if not result["success"]] == [
        "not_video_file",
        "path_outside_directory",
    ]


def test_local_scrape_preview_reports_progress(tmp_path):
    first = tmp_path / "ABP-123.mp4"
    second = tmp_path / "BAD.mp4"
    first.write_bytes(b"video")
    second.write_bytes(b"video")
    events = []

    payload = asyncio.run(
        local_scrape.preview_local_scrape(
            local_scrape.LocalScrapePreviewRequest(directory=str(tmp_path), scrape=False),
            progress_callback=events.append,
        )
    )

    assert payload["success"] is True
    assert events[0]["phase"] == "scan"
    assert events[1]["total"] == 2
    assert events[-1]["phase"] == "complete"
    assert events[-1]["completed"] == 2
    assert any("ABP-123.mp4" in event.get("message", "") for event in events)


def test_local_scrape_background_task_manager_tracks_status_and_logs(tmp_path):
    video = tmp_path / "ABP-123.mp4"
    video.write_bytes(b"video")

    async def exercise():
        manager = LocalScrapeTaskManager()
        task_id = manager.start_preview_task(local_scrape.LocalScrapePreviewRequest(directory=str(tmp_path), scrape=False))
        initial = manager.get_task(task_id)
        assert initial["status"] == "running"
        while True:
            snapshot = manager.get_task(task_id)
            if snapshot["status"] != "running":
                return initial, snapshot
            await asyncio.sleep(0.01)

    initial, finished = asyncio.run(exercise())

    assert initial["task_id"]
    assert finished["status"] == "success"
    assert finished["percent"] == 100
    assert finished["result"]["total_files"] == 1
    assert finished["logs"]


def test_local_library_summary_exposes_cover_and_local_poster(tmp_path):
    video = tmp_path / "ABP-123.mp4"
    poster = tmp_path / "ABP-123-poster.jpg"
    thumbnail = tmp_path / "ABP-123-thumb.jpg"
    video.write_text("video", encoding="utf-8")
    poster.write_bytes(b"poster")
    thumbnail.write_bytes(b"thumb")

    async def exercise():
        service = local_movie_library_service.__class__(str(tmp_path / "library.json"))
        await service.update_from_scan(
            str(tmp_path),
            [
                {
                    "movie_id": "ABP-123",
                    "path": str(video),
                    "relative_path": video.name,
                    "file_name": video.name,
                    "size": 123,
                    "metadata": {
                        "id": "ABP-123",
                        "title": "ABP-123 Sample",
                        "cover_url": "https://www.javbus.com/pics/cover.jpg",
                        "list_thumbnail_url": "https://www.javbus.com/pics/thumb.jpg",
                    },
                    "scrape_status": "found",
                    "full_text": "ABP-123 Sample",
                }
            ],
        )
        summary = await service.get_summary()
        poster_path = await service.get_poster_path("ABP-123")
        poster.unlink()
        thumbnail.unlink()
        refreshed_summary = await service.get_summary()
        return summary, poster_path, refreshed_summary

    summary, poster_path, refreshed_summary = asyncio.run(exercise())

    record = summary["records"][0]
    assert record["cover_url"] == "https://www.javbus.com/pics/cover.jpg"
    assert record["poster_url"] == "/api/movies/local-library/poster/ABP-123"
    assert record["thumbnail_url"] == "/api/movies/local-library/thumbnail/ABP-123"
    assert poster_path == poster.resolve()
    refreshed_record = refreshed_summary["records"][0]
    assert "poster_url" not in refreshed_record
    assert refreshed_record["thumbnail_url"] == "https://www.javbus.com/pics/thumb.jpg"


def test_local_library_play_file_path_comes_from_indexed_record(tmp_path):
    first_video = tmp_path / "ABP-123.mp4"
    second_video = tmp_path / "ABP-123-cd2.mkv"
    first_video.write_bytes(b"video-a")
    second_video.write_bytes(b"video-b")

    async def exercise():
        service = local_movie_library_service.__class__(str(tmp_path / "library.json"))
        await service.update_from_scan(
            str(tmp_path),
            [
                {
                    "movie_id": "ABP-123",
                    "path": str(first_video),
                    "relative_path": first_video.name,
                    "file_name": first_video.name,
                    "size": first_video.stat().st_size,
                },
                {
                    "movie_id": "ABP-123",
                    "path": str(second_video),
                    "relative_path": second_video.name,
                    "file_name": second_video.name,
                    "size": second_video.stat().st_size,
                },
            ],
        )
        return (
            await service.get_video_file_path("abp-123"),
            await service.get_video_file_path("ABP-123", 1),
            await service.get_video_file_path("ABP-123", 2),
            await service.get_video_file_path("../ABP-123", 0),
        )

    first_path, second_path, missing_index_path, invalid_id_path = asyncio.run(exercise())

    assert first_path == first_video.resolve()
    assert second_path == second_video.resolve()
    assert missing_index_path is None
    assert invalid_id_path is None


def test_local_library_delete_movie_removes_only_requested_record(tmp_path):
    first_video = tmp_path / "ABP-123.mp4"
    second_video = tmp_path / "ABP-124.mp4"
    first_video.write_bytes(b"video-a")
    second_video.write_bytes(b"video-b")

    async def exercise():
        service = local_movie_library_service.__class__(str(tmp_path / "library.json"))
        await service.update_from_scan(
            str(tmp_path),
            [
                {
                    "movie_id": "ABP-123",
                    "path": str(first_video),
                    "relative_path": first_video.name,
                    "file_name": first_video.name,
                    "size": first_video.stat().st_size,
                },
                {
                    "movie_id": "ABP-124",
                    "path": str(second_video),
                    "relative_path": second_video.name,
                    "file_name": second_video.name,
                    "size": second_video.stat().st_size,
                },
            ],
        )
        deleted = await service.delete_movie("abp-123")
        missing = await service.delete_movie("abp-999")
        summary = await service.get_summary()
        with open(tmp_path / "library.json", "r", encoding="utf-8") as file:
            saved = json.load(file)
        return deleted, missing, summary, saved

    deleted, missing, summary, saved = asyncio.run(exercise())

    assert deleted["success"] is True
    assert deleted["deleted"] is True
    assert deleted["movie_id"] == "ABP-123"
    assert missing["success"] is False
    assert missing["error"] == "movie_not_found"
    assert [record["movie_id"] for record in summary["records"]] == ["ABP-124"]
    assert set(saved["movies"].keys()) == {"ABP-124"}
    assert first_video.exists()
    assert second_video.exists()


def test_local_library_actor_avatar_path_comes_from_movie_actor_directory(tmp_path):
    video = tmp_path / "ABP-123 Sample.mp4"
    actor_dir = tmp_path / "actors"
    actor_avatar = actor_dir / "Actor_Two.jpg"
    video.write_bytes(b"video")
    actor_dir.mkdir()
    actor_avatar.write_bytes(b"avatar")

    async def exercise():
        service = local_movie_library_service.__class__(str(tmp_path / "library.json"))
        await service.update_from_scan(
            str(tmp_path),
            [
                {
                    "movie_id": "ABP-123",
                    "path": str(video),
                    "relative_path": video.name,
                    "file_name": video.name,
                    "size": 123,
                    "metadata": {
                        "id": "ABP-123",
                        "title": "ABP-123 Sample",
                        "stars": ["Actor/Two"],
                    },
                    "scrape_status": "found",
                    "full_text": "ABP-123 Actor/Two",
                }
            ],
        )
        return await service.get_actor_avatar_path("ABP-123", "Actor/Two")

    assert asyncio.run(exercise()) == actor_avatar.resolve()


def test_local_library_information_check_reports_missing_metadata(tmp_path):
    first_video = tmp_path / "ABP-123.mp4"
    second_video = tmp_path / "ABP-124.mp4"
    first_video.write_bytes(b"video-a")
    second_video.write_bytes(b"video-b")
    first_video.with_suffix(".nfo").write_text("nfo", encoding="utf-8")
    first_video.with_name("ABP-123-poster.jpg").write_bytes(b"poster")

    async def exercise():
        service = local_movie_library_service.__class__(str(tmp_path / "library.json"))
        await service.update_from_scan(
            str(tmp_path),
            [
                {
                    "movie_id": "ABP-123",
                    "path": str(first_video),
                    "relative_path": first_video.name,
                    "file_name": first_video.name,
                    "size": 123,
                    "metadata": {
                        "id": "ABP-123",
                        "title": "ABP-123 Complete",
                        "date": "2024-01-02",
                        "stars": ["Actor One"],
                        "genres": ["Genre A"],
                        "cover_url": "https://www.javbus.com/pics/cover.jpg",
                        "raw": {"id": "ABP-123"},
                    },
                    "scrape_status": "found",
                    "full_text": "ABP-123 Complete Actor One",
                },
                {
                    "movie_id": "ABP-124",
                    "path": str(second_video),
                    "relative_path": second_video.name,
                    "file_name": second_video.name,
                    "size": 456,
                    "metadata": {"id": "ABP-124", "title": "ABP-124", "raw": {}},
                    "scrape_status": "skipped",
                    "full_text": "ABP-124",
                },
            ],
        )
        return await service.get_information_check()

    payload = asyncio.run(exercise())

    assert payload["total_movies"] == 2
    assert payload["complete_count"] == 1
    assert payload["incomplete_count"] == 1
    assert payload["incomplete_records"][0]["movie_id"] == "ABP-124"
    assert payload["incomplete_records"][0]["missing_fields"] == ["title", "date", "stars", "genres", "cover_url"]


def test_local_library_information_download_refreshes_only_missing_records(tmp_path, monkeypatch):
    first_video = tmp_path / "ABP-123.mp4"
    second_video = tmp_path / "ABP-124.mp4"
    first_video.write_bytes(b"video-a")
    second_video.write_bytes(b"video-b")
    first_video.with_suffix(".nfo").write_text("nfo", encoding="utf-8")
    first_video.with_name("ABP-123-poster.jpg").write_bytes(b"poster")
    fetched_ids = []

    async def fake_get_movie_detail(movie_id):
        fetched_ids.append(movie_id)
        return {
            "id": movie_id,
            "title": f"{movie_id} Remote Title",
            "date": "2024-03-04",
            "img": "https://www.javbus.com/pics/remote.jpg",
            "stars": [{"name": "Actor One"}],
            "genres": [{"name": "Genre A"}],
        }

    monkeypatch.setattr(movies_local_library.javbus_api_service, "get_movie_detail", fake_get_movie_detail)

    async def exercise():
        service = local_movie_library_service.__class__(str(tmp_path / "library.json"))
        monkeypatch.setattr(movies_local_library, "local_movie_library_service", service)
        await service.update_from_scan(
            str(tmp_path),
            [
                {
                    "movie_id": "ABP-123",
                    "path": str(first_video),
                    "relative_path": first_video.name,
                    "file_name": first_video.name,
                    "size": 123,
                    "metadata": {
                        "id": "ABP-123",
                        "title": "ABP-123 Complete",
                        "date": "2024-01-02",
                        "stars": ["Actor One"],
                        "genres": ["Genre A"],
                        "cover_url": "https://www.javbus.com/pics/cover.jpg",
                        "raw": {"id": "ABP-123"},
                    },
                    "scrape_status": "found",
                    "full_text": "ABP-123 Complete Actor One",
                },
                {
                    "movie_id": "ABP-124",
                    "path": str(second_video),
                    "relative_path": second_video.name,
                    "file_name": second_video.name,
                    "size": 456,
                    "metadata": {"id": "ABP-124", "title": "ABP-124", "raw": {}},
                    "scrape_status": "skipped",
                    "full_text": "ABP-124",
                },
            ],
        )
        result = await movies_local_library.download_missing_local_library_information(
            movies_local_library.LocalLibraryInformationDownloadRequest(
                only_missing=True,
                concurrent=1,
                write_nfo=False,
                download_images=False,
            )
        )
        summary = await service.get_summary()
        return result, summary

    result, summary = asyncio.run(exercise())

    assert fetched_ids == ["ABP-124"]
    assert result["updated_count"] == 1
    assert result["information_check"]["incomplete_count"] == 1
    assert result["information_check"]["incomplete_records"][0]["missing_fields"] == ["nfo", "poster_file"]
    refreshed = {record["movie_id"]: record for record in summary["records"]}["ABP-124"]
    assert refreshed["title"] == "ABP-124 Remote Title"
    assert refreshed["cover_url"] == "https://www.javbus.com/pics/remote.jpg"


def test_local_library_information_download_supports_scrape_asset_options(tmp_path, monkeypatch):
    video = tmp_path / "ABP-124.mp4"
    video.write_bytes(b"video")
    asset_calls = []

    async def fake_get_movie_detail(movie_id):
        return {
            "id": movie_id,
            "title": f"{movie_id} Remote Title",
            "date": "2024-03-04",
            "img": "https://www.javbus.com/pics/remote.jpg",
            "stars": [{"id": "actor-a", "name": "Actor One"}],
            "genres": [{"name": "Genre A"}],
            "samples": [{"src": "https://www.javbus.com/sample.jpg"}],
        }

    async def fake_write_images(video_path, metadata, overwrite, include_samples=False):
        asset_calls.append(("images", video_path, overwrite, include_samples))
        video_path.with_name("ABP-124-poster.jpg").write_bytes(b"poster")
        return "ABP-124-poster.jpg", ["extrafanart/fanart1.jpg"] if include_samples else []

    async def fake_write_actor_images(video_path, metadata, overwrite):
        asset_calls.append(("actors", video_path, overwrite, None))
        return ["actors/Actor One.jpg"]

    async def fake_write_list_thumbnail(video_path, metadata, overwrite):
        asset_calls.append(("thumbnail", video_path, overwrite, None))
        return "ABP-124-thumb.jpg"

    def fake_write_nfo(video_path, metadata, poster_name, sample_names):
        asset_calls.append(("nfo", video_path, poster_name, tuple(sample_names)))
        nfo = video_path.with_suffix(".nfo")
        nfo.write_text("nfo", encoding="utf-8")
        return nfo

    monkeypatch.setattr(movies_local_library.javbus_api_service, "get_movie_detail", fake_get_movie_detail)
    monkeypatch.setattr(movies_local_library, "_write_images", fake_write_images)
    monkeypatch.setattr(movies_local_library, "_write_actor_images", fake_write_actor_images)
    monkeypatch.setattr(movies_local_library, "_write_list_thumbnail", fake_write_list_thumbnail)
    monkeypatch.setattr(movies_local_library, "_write_nfo", fake_write_nfo)

    async def exercise():
        service = local_movie_library_service.__class__(str(tmp_path / "library.json"))
        monkeypatch.setattr(movies_local_library, "local_movie_library_service", service)
        await service.update_from_scan(
            str(tmp_path),
            [
                {
                    "movie_id": "ABP-124",
                    "path": str(video),
                    "relative_path": video.name,
                    "file_name": video.name,
                    "size": 456,
                    "metadata": {"id": "ABP-124", "title": "ABP-124", "raw": {}},
                    "scrape_status": "skipped",
                    "full_text": "ABP-124",
                },
            ],
        )
        return await movies_local_library.download_missing_local_library_information(
            movies_local_library.LocalLibraryInformationDownloadRequest(
                only_missing=True,
                concurrent=1,
                write_nfo=True,
                download_images=True,
                download_sample_images=True,
                download_actor_images=True,
                download_list_thumbnail=True,
                overwrite_existing=True,
            )
        )

    result = asyncio.run(exercise())

    assert result["updated_count"] == 1
    assert result["information_check"]["incomplete_count"] == 0
    assert result["results"][0]["poster"] == "ABP-124-poster.jpg"
    assert result["results"][0]["samples"] == ["extrafanart/fanart1.jpg"]
    assert result["results"][0]["actor_images"] == ["actors/Actor One.jpg"]
    assert result["results"][0]["list_thumbnail"] == "ABP-124-thumb.jpg"
    assert result["results"][0]["nfo_path"] == str(video.with_suffix(".nfo"))
    assert [call[0] for call in asset_calls] == ["images", "actors", "thumbnail", "nfo"]
    assert asset_calls[0][2:] == (True, True)


def test_local_library_information_download_uses_existing_metadata_for_asset_only_missing(tmp_path, monkeypatch):
    video = tmp_path / "ABP-125.mp4"
    video.write_bytes(b"video")
    asset_calls = []
    fetch_calls = []

    async def fake_get_movie_detail(movie_id):
        fetch_calls.append(movie_id)
        raise AssertionError("asset-only downloads should not refetch remote metadata")

    async def fake_write_images(video_path, metadata, overwrite, include_samples=False):
        asset_calls.append(("images", video_path, metadata["title"], overwrite, include_samples))
        video_path.with_name("ABP-125-poster.jpg").write_bytes(b"poster")
        return "ABP-125-poster.jpg", []

    def fake_write_nfo(video_path, metadata, poster_name, sample_names):
        asset_calls.append(("nfo", video_path, metadata["title"], poster_name, tuple(sample_names)))
        nfo = video_path.with_suffix(".nfo")
        nfo.write_text("nfo", encoding="utf-8")
        return nfo

    monkeypatch.setattr(movies_local_library.javbus_api_service, "get_movie_detail", fake_get_movie_detail)
    monkeypatch.setattr(movies_local_library, "_write_images", fake_write_images)
    monkeypatch.setattr(movies_local_library, "_write_nfo", fake_write_nfo)

    async def exercise():
        service = local_movie_library_service.__class__(str(tmp_path / "library.json"))
        monkeypatch.setattr(movies_local_library, "local_movie_library_service", service)
        await service.update_from_scan(
            str(tmp_path),
            [
                {
                    "movie_id": "ABP-125",
                    "path": str(video),
                    "relative_path": video.name,
                    "file_name": video.name,
                    "size": 456,
                    "metadata": {
                        "id": "ABP-125",
                        "title": "ABP-125 Existing Title",
                        "date": "2024-01-02",
                        "stars": ["Actor One"],
                        "genres": ["Genre A"],
                        "cover_url": "https://www.javbus.com/pics/existing.jpg",
                        "raw": {"id": "ABP-125"},
                    },
                    "scrape_status": "found",
                    "full_text": "ABP-125 Existing Title Actor One",
                },
            ],
        )
        before = await service.get_information_check()
        result = await movies_local_library.download_missing_local_library_information(
            movies_local_library.LocalLibraryInformationDownloadRequest(
                only_missing=True,
                concurrent=1,
                write_nfo=True,
                download_images=True,
            )
        )
        after = await service.get_information_check()
        summary = await service.get_summary()
        return before, result, after, summary

    before, result, after, summary = asyncio.run(exercise())

    assert before["incomplete_records"][0]["missing_fields"] == ["nfo", "poster_file"]
    assert fetch_calls == []
    assert result["updated_count"] == 1
    assert result["results"][0]["poster"] == "ABP-125-poster.jpg"
    assert result["results"][0]["nfo_path"] == str(video.with_suffix(".nfo"))
    assert after["incomplete_count"] == 0
    assert summary["records"][0]["title"] == "ABP-125 Existing Title"
    assert [call[0] for call in asset_calls] == ["images", "nfo"]


def test_automation_task_crud_persists(tmp_path):
    async def exercise():
        service = AutomationService(str(tmp_path / "automation_tasks.json"), scheduler_enabled=False)
        created = await service.create_task(
            AutomationTaskCreate(
                name="每日有码检索",
                enabled=True,
                trigger={"type": "interval", "interval_minutes": 90},
                nodes=[
                    {"id": "trigger", "type": "trigger", "position": {"x": 40, "y": 80}, "config": {}},
                    {
                        "id": "search",
                        "type": "search",
                        "position": {"x": 300, "y": 80},
                        "config": {"mode": "keyword", "keyword": "ABP", "max_results": 3},
                    },
                    {
                        "id": "magnet",
                        "type": "magnet",
                        "position": {"x": 560, "y": 80},
                        "config": {"source": "javbus", "exclude_4k": True},
                    },
                    {
                        "id": "download",
                        "type": "download",
                        "position": {"x": 820, "y": 80},
                        "config": {"tool": "pikpak"},
                    },
                ],
                edges=[
                    {"id": "e1", "source": "trigger", "target": "search"},
                    {"id": "e2", "source": "search", "target": "magnet"},
                    {"id": "e3", "source": "magnet", "target": "download"},
                ],
            )
        )
        await service.update_task(created.id, AutomationTaskUpdate(name="工作日检索", enabled=False))
        reloaded = AutomationService(str(tmp_path / "automation_tasks.json"), scheduler_enabled=False)
        tasks = await reloaded.list_tasks()
        return created, tasks

    created, tasks = asyncio.run(exercise())

    assert created.id
    assert len(tasks) == 1
    assert tasks[0].name == "工作日检索"
    assert tasks[0].enabled is False
    assert tasks[0].trigger.interval_minutes == 90
    assert tasks[0].nodes[1].config["keyword"] == "ABP"


def test_automation_service_dispatches_best_magnets(tmp_path, monkeypatch):
    dispatched = []

    async def fake_get_movies_by_keyword_and_page(keyword, page="1", magnet=None, movie_type=None):
        return {
            "movies": [
                {"id": "ABP-123", "title": "ABP-123 Title"},
                {"id": "ABP-124", "title": "ABP-124 Title"},
            ],
            "pagination": {"total": 2},
        }

    async def fake_get_best_magnet_payload(movie_id, **kwargs):
        if movie_id == "ABP-124":
            return None
        return {"link": "magnet:?xt=urn:btih:abc", "title": "ABP-123 best", "size": "2 GB"}

    async def fake_is_movie_downloaded(movie_id):
        return False

    async def fake_is_movie_present(movie_id):
        return False

    async def fake_pikpak_download(request):
        dispatched.extend(request.magnet_links)
        return {"success": True, "success_count": len(request.magnet_links), "results": [{"success": True}]}

    monkeypatch.setattr(
        automation_service_module.javbus_api_service,
        "get_movies_by_keyword_and_page",
        fake_get_movies_by_keyword_and_page,
    )
    monkeypatch.setattr(automation_service_module, "get_best_magnet_payload", fake_get_best_magnet_payload)
    monkeypatch.setattr(
        automation_service_module.download_history_service,
        "is_movie_downloaded",
        fake_is_movie_downloaded,
    )
    monkeypatch.setattr(
        automation_service_module.local_movie_library_service,
        "is_movie_present",
        fake_is_movie_present,
    )
    monkeypatch.setattr(automation_service_module, "pikpak_download", fake_pikpak_download)

    async def exercise():
        service = AutomationService(str(tmp_path / "automation_tasks.json"), scheduler_enabled=False)
        task = await service.create_task(
            AutomationTaskCreate(
                name="自动检索",
                enabled=True,
                trigger={"type": "auto"},
                nodes=[
                    {"id": "trigger", "type": "trigger", "position": {"x": 40, "y": 80}, "config": {}},
                    {
                        "id": "search",
                        "type": "search",
                        "position": {"x": 300, "y": 80},
                        "config": {"mode": "keyword", "keyword": "ABP", "max_results": 2},
                    },
                    {
                        "id": "magnet",
                        "type": "magnet",
                        "position": {"x": 560, "y": 80},
                        "config": {"source": "javbus"},
                    },
                    {
                        "id": "download",
                        "type": "download",
                        "position": {"x": 820, "y": 80},
                        "config": {"tool": "pikpak"},
                    },
                ],
                edges=[
                    {"id": "e1", "source": "trigger", "target": "search"},
                    {"id": "e2", "source": "search", "target": "magnet"},
                    {"id": "e3", "source": "magnet", "target": "download"},
                ],
            )
        )
        return await service.run_task(task.id, manual=True)

    run = asyncio.run(exercise())

    assert dispatched == ["magnet:?xt=urn:btih:abc"]
    assert run.status == "success"
    assert run.found_count == 2
    assert run.magnet_count == 1
    assert run.dispatched_count == 1
    assert run.skipped_count == 1


def test_automation_filter_search_supports_multiple_conditions_and_all_results(tmp_path, monkeypatch):
    page_queries = []

    async def fake_get_movies_by_page(query):
        page_queries.append(query)
        if str(query.get("page")) == "2":
            return {
                "movies": [{"id": "MATCH-002"}, {"id": "MISS-002"}],
                "pagination": {"currentPage": 2, "hasNextPage": False, "nextPage": None, "pages": [1, 2]},
            }
        return {
            "movies": [{"id": "MATCH-001"}, {"id": "MISS-001"}],
            "pagination": {"currentPage": 1, "hasNextPage": True, "nextPage": 2, "pages": [1, 2]},
        }

    async def fake_get_movie_detail(movie_id):
        details = {
            "MATCH-001": {"genres": [{"id": "4y", "name": "Genre A"}], "stars": [{"id": "abc", "name": "Actor A"}]},
            "MATCH-002": {"genres": [{"id": "4y", "name": "Genre A"}], "stars": [{"id": "abc", "name": "Actor A"}]},
            "MISS-001": {"genres": [{"id": "4y", "name": "Genre A"}], "stars": [{"id": "def", "name": "Actor B"}]},
            "MISS-002": {"genres": [{"id": "5g", "name": "Genre B"}], "stars": [{"id": "abc", "name": "Actor A"}]},
        }
        return details[movie_id]

    monkeypatch.setattr(automation_service_module.javbus_api_service, "get_movies_by_page", fake_get_movies_by_page)
    monkeypatch.setattr(movies_service, "javbus_api_service", SimpleNamespace(get_movie_detail=fake_get_movie_detail))

    async def exercise():
        service = AutomationService(str(tmp_path / "automation_tasks.json"), scheduler_enabled=False)
        return await service._search_movies(
            {
                "mode": "filter",
                "max_results": "all",
                "filters": [
                    {"type": "genre", "value": "4y", "label": "Genre A"},
                    {"type": "star", "value": "abc", "label": "Actor A"},
                ],
                "magnet": "exist",
                "type": "normal",
            }
        )

    movies = asyncio.run(exercise())

    assert [movie["id"] for movie in movies] == ["MATCH-001", "MATCH-002"]
    assert page_queries == [
        {"filterType": "genre", "filterValue": "4y", "magnet": "exist", "type": "normal", "page": "1"},
        {"filterType": "genre", "filterValue": "4y", "magnet": "exist", "type": "normal", "page": "2"},
    ]
