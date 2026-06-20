import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import main
from modules.automation.schemas import AutomationTaskCreate, AutomationTaskUpdate
from modules.automation.service import AutomationService
from modules.automation import service as automation_service_module
from modules.history.service import local_movie_library_service
from modules.common import runtime
from modules.movies import local_scrape
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
            }
        },
    )

    assert response.status_code == 200
    assert response.json()["javbus"]["base_url"] == "https://new.example.test"
    assert fake_service.configs[-1]["request_interval_seconds"] == 0.75
    saved = json.loads(config_path.read_text(encoding="utf-8"))
    assert saved["javbus"]["base_url"] == "https://new.example.test"
    assert saved["javbus"]["cache_max_size"] == 2000


def test_system_settings_rejects_invalid_javbus_values():
    client = TestClient(main.app)

    response = client.put(
        "/api/system/settings/javbus",
        json={"javbus": {"base_url": "ftp://example.test", "request_interval_seconds": -1}},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "base_url_must_be_http_url"


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


def test_local_library_summary_exposes_cover_and_local_poster(tmp_path):
    video = tmp_path / "ABP-123.mp4"
    poster = tmp_path / "ABP-123-poster.jpg"
    video.write_text("video", encoding="utf-8")
    poster.write_bytes(b"poster")

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
                    },
                    "scrape_status": "found",
                    "full_text": "ABP-123 Sample",
                }
            ],
        )
        return await service.get_summary(), await service.get_poster_path("ABP-123")

    summary, poster_path = asyncio.run(exercise())

    record = summary["records"][0]
    assert record["cover_url"] == "https://www.javbus.com/pics/cover.jpg"
    assert record["poster_url"] == "/api/movies/local-library/poster/ABP-123"
    assert poster_path == poster.resolve()


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
