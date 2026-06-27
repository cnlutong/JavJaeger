import asyncio
import json
import os
from pathlib import Path
from types import SimpleNamespace

import pytest
import main
from modules.automation.schemas import AutomationTaskCreate, AutomationTaskUpdate
from modules.automation.service import AutomationService
from modules.automation import service as automation_service_module
from modules.pan115 import service as pan115_service_module
from modules.pan115.schemas import DownloadRequest as Pan115DownloadRequest
from modules.history.service import local_movie_library_service
from modules.history.service import local_actor_library_service
from modules.history import service as history_service_module
from modules.common import runtime
from modules.common import paths as common_paths
from modules.movies import local_scrape
from modules.movies import local_library as movies_local_library
from modules.movies import metadata_scrapers
from modules.movies.local_scrape_tasks import LocalScrapeTaskManager
from modules.movies import service as movies_service
from modules.magnets import service as magnets_service
from modules.system import path_browser
from modules.system import settings as system_settings
from modules.ui import router as ui_router
from modules.webdav.clients import WebDavClient
from modules.webdav.session_state import WebDavSessionStore
from modules.webdav import router as webdav_router
from modules.webdav import service as webdav_service
from fastapi.testclient import TestClient
from starlette.datastructures import QueryParams
from modules.proxy import router as proxy_router


class FakeMetadataScraperService:
    def __init__(self, fetcher):
        self.fetcher = fetcher

    async def get_movie_detail(self, movie_id):
        detail = await self.fetcher(movie_id)
        if isinstance(detail, dict) and ("metadata" in detail or "source" in detail or "error" in detail):
            return detail
        return {"source": "test", "metadata": detail, "logs": []}


def test_proxy_router_is_registered_after_concrete_api_routes():
    api_paths = [route.path for route in main.app.routes if getattr(route, "path", "").startswith("/api")]

    assert "/api/system/info" in api_paths
    assert "/api/movies" in api_paths
    assert "/api/automation/tasks" in api_paths
    assert "/api/115/qrcode/start" in api_paths
    assert "/api/115/download" in api_paths
    assert "/api/115/download-jobs" in api_paths
    assert "/api/115/files" in api_paths
    assert api_paths.index("/api/115/qrcode/start") < api_paths.index("/api/{path:path}")
    assert api_paths.index("/api/115/download") < api_paths.index("/api/{path:path}")
    assert api_paths.index("/api/115/download-jobs") < api_paths.index("/api/{path:path}")
    assert api_paths.index("/api/115/files") < api_paths.index("/api/{path:path}")
    assert api_paths.index("/api/automation/tasks") < api_paths.index("/api/{path:path}")
    assert "/api/{path:path}" == api_paths[-1]


def test_resolve_user_path_wraps_filesystem_os_errors(monkeypatch):
    def fail_resolve(self):
        raise OSError(36, "File name too long")

    monkeypatch.setattr(common_paths.Path, "resolve", fail_resolve)

    with pytest.raises(common_paths.UserPathError) as exc_info:
        common_paths.resolve_user_path("/app/data/temp/" + ("x" * 300))

    assert exc_info.value.code == "invalid_path"


def test_local_library_poster_route_is_before_status_route():
    api_paths = [route.path for route in main.app.routes if getattr(route, "path", "").startswith("/api")]

    assert api_paths.index("/api/movies/local-library/actors") < api_paths.index(
        "/api/movies/local-library/{movie_id}"
    )
    assert api_paths.index("/api/movies/local-library/actors/{actor_key}/avatar") < api_paths.index(
        "/api/movies/local-library/{movie_id}"
    )
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


def test_local_library_clean_invalid_route_is_before_status_route():
    api_paths = [route.path for route in main.app.routes if getattr(route, "path", "").startswith("/api")]

    assert api_paths.index("/api/movies/local-library/clean-invalid") < api_paths.index(
        "/api/movies/local-library/{movie_id}"
    )


def test_metadata_scraper_routes_are_before_movie_detail_route():
    api_paths = [route.path for route in main.app.routes if getattr(route, "path", "").startswith("/api")]

    assert api_paths.index("/api/movies/metadata-scrapers/test") < api_paths.index("/api/movies/{movie_id}")
    assert api_paths.index("/api/movies/metadata-scrapers/apply-test-results") < api_paths.index(
        "/api/movies/{movie_id}"
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
            "pan115": {
                "enabled": True,
                "cookie": "UID=pan115-uid;CID=pan115-cid;SEID=pan115-seid;KID=pan115-kid",
                "save_dir_id": "12345",
                "login_app": "wechatmini",
                "batch_size": 20,
                "batch_interval_seconds": 25.0,
                "jitter_seconds": 5.0,
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
    assert client_config["pan115"]["configured"] is True
    assert client_config["pan115"]["save_dir_id"] == "12345"
    assert client_config["pan115"]["login_app"] == "wechatmini"
    assert client_config["pan115"]["batch_size"] == 20
    assert client_config["pan115"]["batch_interval_seconds"] == 25.0
    assert client_config["pan115"]["jitter_seconds"] == 5.0
    assert client_config["pan115"]["has_cookie"] is True
    assert "cookie" not in client_config["pan115"]


def test_client_config_includes_non_sensitive_magnet_health_settings(monkeypatch):
    test_config = runtime.merge_config(
        runtime.DEFAULT_CONFIG,
        {
            "magnet_health": {
                "enabled": True,
                "probe_with_aria2": True,
                "min_seeders": 3,
                "min_peers": 5,
                "min_availability": 1.0,
                "min_score": 3.0,
                "probe_timeout_seconds": 12.0,
                "allow_unknown": False,
            },
        },
    )
    monkeypatch.setattr(runtime, "config", test_config)

    client_config = runtime.build_client_config()

    assert client_config["magnet_health"] == {
        "enabled": True,
        "probe_with_aria2": True,
        "min_seeders": 3,
        "min_peers": 5,
        "min_availability": 1.0,
        "min_score": 3.0,
        "probe_timeout_seconds": 12.0,
        "allow_unknown": False,
    }


def test_javbus_default_request_interval_is_conservative():
    assert runtime.DEFAULT_CONFIG["javbus"]["request_interval_seconds"] == 0.5


def test_all_builtin_metadata_providers_are_connected():
    assert set(runtime.IMPLEMENTED_SCRAPER_PROVIDER_NAMES) == set(runtime.SCRAPER_PROVIDER_NAMES)
    assert "javbus" not in metadata_scrapers.PROVIDER_FETCHERS
    assert set(metadata_scrapers.PROVIDER_FETCHERS) == set(runtime.SCRAPER_PROVIDER_NAMES) - {"javbus"}
    for provider, fetcher_name in metadata_scrapers.PROVIDER_FETCHERS.items():
        assert callable(getattr(metadata_scrapers, fetcher_name)), provider


def test_live_verified_metadata_providers_are_enabled_by_default():
    scrapers = runtime.DEFAULT_CONFIG["scrapers"]
    enabled_defaults = {
        provider
        for provider in runtime.SCRAPER_PROVIDER_NAMES
        if bool(scrapers.get(provider, {}).get("enabled"))
    }

    assert enabled_defaults == {"javbus", "libredmm", "jav321", "tokyohot", "dlgetchu", "fc2"}


def test_system_settings_update_reports_config_save_failure(monkeypatch):
    monkeypatch.setattr(runtime, "config", runtime.merge_config(runtime.DEFAULT_CONFIG, {}))

    def fail_save_config(next_config):
        raise runtime.ConfigSaveError("/readonly/config.json", "permission denied")

    monkeypatch.setattr(runtime, "save_config", fail_save_config)
    client = TestClient(main.app)

    response = client.put(
        "/api/system/settings",
        json={"scrapers": {"javbus": {"enabled": True}}},
    )

    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail["error"] == "config_save_failed"
    assert detail["path"] == "/readonly/config.json"
    assert detail["reason"] == "permission denied"


def test_metadata_scraper_apply_results_reports_config_save_failure(monkeypatch):
    monkeypatch.setattr(runtime, "config", runtime.merge_config(runtime.DEFAULT_CONFIG, {}))

    def fail_save_config(next_config):
        raise runtime.ConfigSaveError("/readonly/config.json", "permission denied")

    monkeypatch.setattr(runtime, "save_config", fail_save_config)
    client = TestClient(main.app)

    response = client.post(
        "/api/movies/metadata-scrapers/apply-test-results",
        json={"results": [{"provider": "javbus", "success": True}]},
    )

    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail["error"] == "config_save_failed"
    assert detail["path"] == "/readonly/config.json"
    assert detail["reason"] == "permission denied"


def test_libredmm_metadata_adapter_maps_json_payload(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200
        headers = {"content-type": "application/json; charset=utf-8"}

        def json(self):
            return {
                "actresses": [{"name": "Actor One", "image_url": "/actors/one.jpg"}],
                "cover_image_url": "http://pics.dmm.co.jp/mono/movie/adult/118abp123/118abp123pl.jpg",
                "date": "2014-04-01T00:00:00.000+00:00",
                "description": "sample description",
                "directors": ["Director One"],
                "genres": ["Drama", "Featured Actress"],
                "labels": ["Label One"],
                "makers": ["Maker One"],
                "normalized_id": "ABP-123",
                "sample_image_urls": ["/samples/one.jpg", "https://example.test/two.jpg"],
                "thumbnail_image_url": "https://example.test/thumb.jpg",
                "title": "ABP-123 Provider Title",
                "url": "https://www.libredmm.com/movies/ABP-123",
                "volume": 7200,
            }

    class FakeAsyncClient:
        def __init__(self, **kwargs):
            captured["client_kwargs"] = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url):
            captured["url"] = url
            return FakeResponse()

    monkeypatch.setattr(metadata_scrapers.httpx, "AsyncClient", FakeAsyncClient)

    metadata = asyncio.run(
        metadata_scrapers.fetch_libredmm_movie_detail(
            "ABP-123",
            {"base_url": "https://www.libredmm.com", "request_delay": 0},
        )
    )

    assert captured["url"] == "https://www.libredmm.com/search?q=ABP-123&format=json"
    assert metadata["id"] == "ABP-123"
    assert metadata["title"] == "ABP-123 Provider Title"
    assert metadata["date"] == "2014-04-01"
    assert metadata["videoLength"] == 120
    assert metadata["producer"] == {"id": "", "name": "Maker One"}
    assert metadata["publisher"] == {"id": "", "name": "Label One"}
    assert metadata["director"] == {"id": "", "name": "Director One"}
    assert metadata["stars"] == [{"id": "", "name": "Actor One", "avatar": "https://www.libredmm.com/actors/one.jpg"}]
    assert metadata["genres"] == [{"id": "", "name": "Drama"}, {"id": "", "name": "Featured Actress"}]
    assert metadata["img"] == "https://pics.dmm.co.jp/mono/movie/adult/118abp123/118abp123pl.jpg"
    assert metadata["samples"] == [
        {
            "id": "one",
            "src": "https://www.libredmm.com/samples/one.jpg",
            "thumbnail": "https://www.libredmm.com/samples/one.jpg",
        },
        {
            "id": "two",
            "src": "https://example.test/two.jpg",
            "thumbnail": "https://example.test/two.jpg",
        },
    ]


def test_javlibrary_metadata_adapter_maps_search_and_detail_html(monkeypatch):
    captured = []

    class FakeResponse:
        status_code = 200
        headers = {"content-type": "text/html; charset=utf-8"}

        def __init__(self, text):
            self.text = text

    class FakeAsyncClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url, **kwargs):
            captured.append(url)
            if "vl_searchbyid.php" in url:
                return FakeResponse('<a href="/cn/?v=javli-abp123">ABP-123</a>')
            return FakeResponse(
                """
                <html>
                  <head><title>ABP-123 JAVLibrary Title - JAVLibrary</title></head>
                  <body>
                    <div id="video_id"><span class="text">ABP-123</span></div>
                    <img id="video_jacket_img" src="//img.example.test/cover.jpg">
                    <div id="video_date"><span class="text">2014-04-01</span></div>
                    <div id="video_length"><span class="text">120 minutes</span></div>
                    <div id="video_director"><a>Director One</a></div>
                    <div id="video_maker"><a>Maker One</a></div>
                    <div id="video_label"><a>Label One</a></div>
                    <div id="video_series"><a>Series One</a></div>
                    <span class="genre"><a>Drama</a></span>
                    <span class="star"><a>Actor One</a></span>
                    <a href="/sample/full.jpg"><img src="/sample/thumb.jpg"></a>
                  </body>
                </html>
                """
            )

    monkeypatch.setattr(metadata_scrapers.httpx, "AsyncClient", FakeAsyncClient)

    metadata = asyncio.run(
        metadata_scrapers.fetch_javlibrary_movie_detail(
            "ABP-123",
            {"base_url": "https://www.javlibrary.com", "language": "cn", "request_delay": 0},
        )
    )

    assert captured == [
        "https://www.javlibrary.com/cn/vl_searchbyid.php?keyword=ABP-123",
        "https://www.javlibrary.com/cn/?v=javli-abp123",
    ]
    assert metadata["id"] == "ABP-123"
    assert metadata["title"] == "JAVLibrary Title"
    assert metadata["date"] == "2014-04-01"
    assert metadata["videoLength"] == 120
    assert metadata["director"] == {"id": "", "name": "Director One"}
    assert metadata["producer"] == {"id": "", "name": "Maker One"}
    assert metadata["publisher"] == {"id": "", "name": "Label One"}
    assert metadata["series"] == {"id": "", "name": "Series One"}
    assert metadata["genres"] == [{"id": "", "name": "Drama"}]
    assert metadata["stars"] == [{"id": "", "name": "Actor One"}]
    assert metadata["img"] == "https://img.example.test/cover.jpg"


def test_fc2_metadata_adapter_maps_direct_article_html(monkeypatch):
    captured = []

    class FakeResponse:
        status_code = 200
        headers = {"content-type": "text/html; charset=utf-8"}
        text = """
        <html>
          <head>
            <meta property="og:title" content="FC2 PPV 1234567 - FC2 Title | FC2">
            <meta property="og:image" content="//adult.contents.fc2.com/thumb.jpg">
            <meta property="og:description" content="FC2 PPV 1234567 - Description">
          </head>
          <body>
            <div class="items_article_headerInfo"><a href="/users/1">Maker One</a></div>
            <div class="items_article_MainitemThumb">
              <img src="/cover.jpg">
              <div class="items_article_info">01:30:15</div>
            </div>
            <div class="items_article_softDevice"><p>Release: 2024/01/02</p></div>
            <div class="items_article_TagArea"><a class="tagTag">Genre A</a></div>
            <div class="items_article_SampleImagesArea"><a href="/sample1.jpg"></a></div>
          </body>
        </html>
        """

    class FakeAsyncClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url, **kwargs):
            captured.append(url)
            return FakeResponse()

    monkeypatch.setattr(metadata_scrapers.httpx, "AsyncClient", FakeAsyncClient)

    metadata = asyncio.run(
        metadata_scrapers.fetch_fc2_movie_detail(
            "FC2-PPV-1234567",
            {"base_url": "https://adult.contents.fc2.com", "request_delay": 0},
        )
    )

    assert captured == ["https://adult.contents.fc2.com/article/1234567/"]
    assert metadata["id"] == "FC2-PPV-1234567"
    assert metadata["title"] == "FC2 Title"
    assert metadata["date"] == "2024-01-02"
    assert metadata["videoLength"] == 90
    assert metadata["producer"] == {"id": "", "name": "Maker One"}
    assert metadata["genres"] == [{"id": "", "name": "Genre A"}]
    assert metadata["samples"] == [
        {
            "id": "sample1",
            "src": "https://adult.contents.fc2.com/sample1.jpg",
            "thumbnail": "https://adult.contents.fc2.com/sample1.jpg",
        }
    ]


def test_javstash_metadata_adapter_posts_graphql_and_maps_payload(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200
        headers = {"content-type": "application/json"}

        def json(self):
            return {
                "data": {
                    "searchScene": [
                        {
                            "id": "scene-1",
                            "code": "ABP-123",
                            "title": "GraphQL Title",
                            "release_date": "2024-01-02",
                            "duration": 7200,
                            "director": "Director One",
                            "details": "Description",
                            "studio": {"id": "studio-1", "name": "Studio One"},
                            "performers": [{"performer": {"id": "actor-1", "name": "Actor One"}}],
                            "tags": [{"id": "tag-1", "name": "Genre A"}],
                            "images": [{"id": "image-1", "url": "https://img.example.test/poster.jpg"}],
                            "urls": [{"url": "https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=abp00123/"}],
                        }
                    ]
                }
            }

    class FakeAsyncClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, **kwargs):
            captured["url"] = url
            captured["headers"] = kwargs.get("headers")
            captured["json"] = kwargs.get("json")
            return FakeResponse()

    monkeypatch.setattr(metadata_scrapers.httpx, "AsyncClient", FakeAsyncClient)

    metadata = asyncio.run(
        metadata_scrapers.fetch_javstash_movie_detail(
            "ABP-123",
            {"base_url": "https://javstash.org/graphql", "api_key": "secret-key", "request_delay": 0},
        )
    )

    assert captured["url"] == "https://javstash.org/graphql"
    assert captured["headers"]["ApiKey"] == "secret-key"
    assert captured["json"]["variables"] == {"term": "ABP-123", "limit": 5}
    assert metadata["id"] == "ABP-123"
    assert metadata["title"] == "GraphQL Title"
    assert metadata["date"] == "2024-01-02"
    assert metadata["videoLength"] == 120
    assert metadata["director"] == {"id": "", "name": "Director One"}
    assert metadata["producer"] == {"id": "studio-1", "name": "Studio One"}
    assert metadata["genres"] == [{"id": "tag-1", "name": "Genre A"}]
    assert metadata["stars"] == [{"id": "actor-1", "name": "Actor One"}]
    assert metadata["source_url"] == "https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=abp00123/"


def test_metadata_scraper_chain_uses_implemented_non_javbus_provider(monkeypatch):
    monkeypatch.setattr(
        metadata_scrapers.runtime,
        "get_scrapers_config",
        lambda: {
            "priority": ["r18dev", "libredmm"],
            "r18dev": {"enabled": True, "request_delay": 0},
            "libredmm": {"enabled": True, "request_delay": 0},
        },
    )

    async def fake_r18dev(movie_id, provider_config):
        raise RuntimeError("r18dev blocked")

    async def fake_libredmm(movie_id, provider_config):
        return {"id": movie_id, "title": "LibreDMM Title"}

    monkeypatch.setattr(metadata_scrapers, "fetch_r18dev_movie_detail", fake_r18dev)
    monkeypatch.setattr(metadata_scrapers, "fetch_libredmm_movie_detail", fake_libredmm)

    result = asyncio.run(metadata_scrapers.metadata_scraper_service.get_movie_detail("ABP-123"))

    assert result["source"] == "libredmm"
    assert result["metadata"]["title"] == "LibreDMM Title"
    assert any(entry["provider"] == "r18dev" and entry["level"] == "error" for entry in result["logs"])
    assert any(entry["provider"] == "libredmm" and "matched" in entry["message"] for entry in result["logs"])


def test_metadata_scraper_availability_test_reports_success_and_failure(monkeypatch):
    async def fake_javbus(movie_id):
        return {"id": movie_id, "title": "JavBus OK"}

    async def fake_libredmm(movie_id, provider_config):
        return {"id": movie_id, "title": "LibreDMM OK", "source_url": "https://example.test/libredmm"}

    async def fake_javdb(movie_id, provider_config):
        raise RuntimeError("blocked")

    monkeypatch.setattr(metadata_scrapers.javbus_api_service, "get_movie_detail", fake_javbus)
    monkeypatch.setattr(metadata_scrapers, "fetch_libredmm_movie_detail", fake_libredmm)
    monkeypatch.setattr(metadata_scrapers, "fetch_javdb_movie_detail", fake_javdb)
    monkeypatch.setattr(
        metadata_scrapers.runtime,
        "get_scrapers_config",
        lambda: {
            "javbus": {"enabled": True},
            "libredmm": {"enabled": False, "request_delay": 0},
            "javdb": {"enabled": False, "request_delay": 0},
        },
    )

    result = asyncio.run(
        metadata_scrapers.test_metadata_scraper_providers(
            {
                "providers": ["javbus", "libredmm", "javdb"],
                "movie_ids": {"javbus": "ABP-123", "libredmm": "ABP-124", "javdb": "ABP-125"},
                "concurrent": 2,
            }
        )
    )

    by_provider = {item["provider"]: item for item in result["results"]}
    assert result["summary"] == {"total": 3, "success": 2, "failed": 1, "config_required": 0}
    assert by_provider["javbus"]["success"] is True
    assert by_provider["libredmm"]["title"] == "LibreDMM OK"
    assert by_provider["javdb"]["success"] is False
    assert by_provider["javdb"]["status"] == "error"
    assert by_provider["javdb"]["error_message"] == "blocked"


def test_metadata_scraper_apply_test_results_persists_enabled_flags(tmp_path, monkeypatch):
    config_path = tmp_path / "config.json"
    test_config = runtime.merge_config(
        runtime.DEFAULT_CONFIG,
        {
            "scrapers": {
                "priority": ["javbus", "libredmm", "javdb"],
                "javbus": {"enabled": False, "language": "zh"},
                "libredmm": {"enabled": False, "language": "ja", "base_url": "https://libredmm.example.test"},
                "javdb": {"enabled": True, "language": "zh"},
            }
        },
    )
    monkeypatch.setattr(runtime, "config", test_config)
    monkeypatch.setattr(runtime, "CONFIG_PATH", str(config_path))

    result = metadata_scrapers.apply_metadata_scraper_test_results(
        [
            {"provider": "javbus", "success": True},
            {"provider": "libredmm", "success": True},
            {"provider": "javdb", "success": False},
            {"provider": "unknown", "success": True},
        ]
    )

    saved = json.loads(config_path.read_text(encoding="utf-8"))
    assert result["applied"] == [
        {"provider": "javbus", "enabled": True},
        {"provider": "libredmm", "enabled": True},
        {"provider": "javdb", "enabled": False},
    ]
    assert saved["scrapers"]["javbus"]["enabled"] is True
    assert saved["scrapers"]["libredmm"]["enabled"] is True
    assert saved["scrapers"]["libredmm"]["base_url"] == "https://libredmm.example.test"
    assert saved["scrapers"]["javdb"]["enabled"] is False
    assert saved["scrapers"]["priority"] == ["javbus", "libredmm", "javdb"]


def test_metadata_scraper_test_route_can_apply_results(monkeypatch, tmp_path):
    config_path = tmp_path / "config.json"
    test_config = runtime.merge_config(
        runtime.DEFAULT_CONFIG,
        {
            "scrapers": {
                "javbus": {"enabled": False},
                "libredmm": {"enabled": False},
            }
        },
    )
    monkeypatch.setattr(runtime, "config", test_config)
    monkeypatch.setattr(runtime, "CONFIG_PATH", str(config_path))

    async def fake_javbus(movie_id):
        return {"id": movie_id, "title": "JavBus OK"}

    async def fake_libredmm(movie_id, provider_config):
        return None

    monkeypatch.setattr(metadata_scrapers.javbus_api_service, "get_movie_detail", fake_javbus)
    monkeypatch.setattr(metadata_scrapers, "fetch_libredmm_movie_detail", fake_libredmm)

    client = TestClient(main.app)
    response = client.post(
        "/api/movies/metadata-scrapers/test",
        json={"providers": ["javbus", "libredmm"], "apply_results": True, "concurrent": 1},
    )

    assert response.status_code == 200
    payload = response.json()
    saved = json.loads(config_path.read_text(encoding="utf-8"))
    assert payload["applied"] is True
    assert payload["summary"] == {"total": 2, "success": 1, "failed": 1, "config_required": 0}
    assert saved["scrapers"]["javbus"]["enabled"] is True
    assert saved["scrapers"]["libredmm"]["enabled"] is False


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
            "scrapers": {
                "priority": ["javbus", "r18dev", "javstash"],
                "javbus": {"enabled": True, "language": "zh"},
                "r18dev": {"enabled": True, "language": "en", "request_delay": 1500},
                "javstash": {"enabled": True, "api_key": "javstash-secret", "language": "en"},
            },
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
            "pan115": {
                "enabled": True,
                "cookie": "UID=pan115-uid;CID=pan115-cid;SEID=pan115-seid;KID=pan115-kid",
                "save_dir_id": "12345",
                "login_app": "wechatmini",
                "batch_size": 20,
                "batch_interval_seconds": 25.0,
                "jitter_seconds": 5.0,
            },
            "magnet_health": {
                "enabled": True,
                "probe_with_aria2": True,
                "min_seeders": 2,
                "min_peers": 4,
                "min_availability": 1.0,
                "min_score": 2.0,
                "probe_timeout_seconds": 15.0,
                "allow_unknown": False,
            },
        },
    )
    monkeypatch.setattr(runtime, "config", test_config)

    payload = system_settings.build_settings_payload()

    assert set(["javbus", "scrapers", "webdav", "aria2", "pikpak", "pan115", "magnet_health", "security"]).issubset(payload)
    assert payload["scrapers"]["priority"] == ["javbus", "r18dev", "javstash"]
    assert payload["scrapers"]["javbus"]["enabled"] is True
    assert payload["scrapers"]["r18dev"]["enabled"] is True
    assert payload["scrapers"]["r18dev"]["implemented"] is True
    assert payload["scrapers"]["javstash"]["has_api_key"] is True
    assert "api_key" not in payload["scrapers"]["javstash"]
    assert payload["webdav"]["url"] == "https://dav.example.test/"
    assert payload["webdav"]["has_password"] is True
    assert "password" not in payload["webdav"]
    assert payload["aria2"]["has_secret"] is True
    assert "secret" not in payload["aria2"]
    assert payload["pikpak"]["username"] == "pikpak-user"
    assert payload["pikpak"]["has_password"] is True
    assert "password" not in payload["pikpak"]
    assert payload["pan115"]["enabled"] is True
    assert payload["pan115"]["save_dir_id"] == "12345"
    assert payload["pan115"]["login_app"] == "wechatmini"
    assert payload["pan115"]["batch_size"] == 20
    assert payload["pan115"]["batch_interval_seconds"] == 25.0
    assert payload["pan115"]["jitter_seconds"] == 5.0
    assert payload["pan115"]["has_cookie"] is True
    assert "cookie" not in payload["pan115"]
    assert payload["magnet_health"]["enabled"] is True
    assert payload["magnet_health"]["probe_with_aria2"] is True
    assert payload["magnet_health"]["min_seeders"] == 2
    assert payload["magnet_health"]["allow_unknown"] is False


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
            "pan115": {
                "enabled": True,
                "cookie": "UID=pan115-uid;CID=pan115-cid;SEID=pan115-seid;KID=pan115-kid",
                "save_dir_id": "67890",
                "login_app": "wechatmini",
                "batch_size": 25,
                "batch_interval_seconds": 60.0,
                "jitter_seconds": 4.0,
            },
            "scrapers": {
                "priority": ["r18dev", "javbus", "javstash"],
                "r18dev": {"enabled": True, "language": "ja", "request_delay": 2000},
                "javbus": {"enabled": True, "language": "zh", "base_url": "https://www.javbus.com"},
                "javstash": {"enabled": True, "api_key": "javstash-api-key", "language": "en"},
            },
            "magnet_health": {
                "enabled": True,
                "probe_with_aria2": False,
                "min_seeders": 2,
                "min_peers": 3,
                "min_availability": 1.0,
                "min_score": 2.0,
                "probe_timeout_seconds": 10.0,
                "allow_unknown": False,
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
    assert payload["pan115"]["has_cookie"] is True
    assert payload["pan115"]["login_app"] == "wechatmini"
    assert payload["pan115"]["batch_size"] == 25
    assert payload["pan115"]["batch_interval_seconds"] == 60.0
    assert payload["pan115"]["jitter_seconds"] == 4.0
    assert "cookie" not in payload["pan115"]
    assert payload["scrapers"]["priority"] == ["r18dev", "javbus", "javstash"]
    assert payload["scrapers"]["javstash"]["has_api_key"] is True
    assert "api_key" not in payload["scrapers"]["javstash"]
    assert payload["magnet_health"]["enabled"] is True
    assert payload["magnet_health"]["min_seeders"] == 2
    assert payload["magnet_health"]["allow_unknown"] is False

    saved = json.loads(config_path.read_text(encoding="utf-8"))
    assert saved["webdav"]["password"] == "webdav-password"
    assert saved["aria2"]["secret"] == "aria2-secret"
    assert saved["pikpak"]["password"] == "pikpak-password"
    assert saved["pan115"]["cookie"] == "UID=pan115-uid;CID=pan115-cid;SEID=pan115-seid;KID=pan115-kid"
    assert saved["pan115"]["save_dir_id"] == "67890"
    assert saved["pan115"]["login_app"] == "wechatmini"
    assert saved["pan115"]["batch_size"] == 25
    assert saved["pan115"]["batch_interval_seconds"] == 60.0
    assert saved["pan115"]["jitter_seconds"] == 4.0
    assert saved["scrapers"]["priority"] == ["r18dev", "javbus", "javstash"]
    assert saved["scrapers"]["r18dev"]["language"] == "ja"
    assert saved["scrapers"]["javstash"]["api_key"] == "javstash-api-key"
    assert saved["magnet_health"]["enabled"] is True
    assert saved["magnet_health"]["min_seeders"] == 2
    assert saved["magnet_health"]["allow_unknown"] is False


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


def test_local_scrape_image_download_uses_configured_javbus_referer(tmp_path, monkeypatch):
    captured_headers = []

    class FakeResponse:
        content = b"cover"

        def raise_for_status(self) -> None:
            return None

    class FakeAsyncClient:
        def __init__(self, **kwargs) -> None:
            self.kwargs = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url, headers=None):
            captured_headers.append(headers or {})
            return FakeResponse()

    monkeypatch.setattr(local_scrape.httpx, "AsyncClient", FakeAsyncClient)
    monkeypatch.setattr(
        local_scrape,
        "get_javbus_config",
        lambda: {
            "base_url": "https://javbus.example.test/custom",
            "image_retry_attempts": 1,
            "image_retry_backoff_seconds": 0,
        },
    )

    target = tmp_path / "ABP-123-poster.jpg"
    name = asyncio.run(local_scrape._download_image("https://javbus.example.test/pics/cover.jpg", target, True))

    assert name == "ABP-123-poster.jpg"
    assert captured_headers[0]["Referer"] == "https://javbus.example.test/custom/"
    assert target.read_bytes() == b"cover"


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


def test_path_browser_lists_local_files_for_resource_manager(tmp_path):
    (tmp_path / "Movies").mkdir()
    video = tmp_path / "ABP-123.mp4"
    text = tmp_path / "notes.txt"
    video.write_bytes(b"video")
    text.write_text("note", encoding="utf-8")

    payload = path_browser.list_file_entries_payload(str(tmp_path))

    assert payload["success"] is True
    assert payload["current_path"] == str(tmp_path.resolve())
    entries = {entry["name"]: entry for entry in payload["entries"]}
    assert entries["Movies"]["is_directory"] is True
    assert entries["ABP-123.mp4"]["is_directory"] is False
    assert entries["ABP-123.mp4"]["size"] == 5
    assert entries["ABP-123.mp4"]["path"] == str(video.resolve())
    assert "modified" in entries["notes.txt"]


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


def test_movies_payload_can_exclude_vr_movies_by_genre_and_title(monkeypatch):
    class FakeRequest:
        query_params = QueryParams({"excludeVr": "true", "magnet": "exist", "type": "normal"})

    class FakeJavBusService:
        def __init__(self):
            self.page_queries = []

        async def get_movies_by_page(self, query):
            self.page_queries.append(query)
            return {
                "movies": [
                    {"id": "KEEP-001", "title": "Regular Movie"},
                    {"id": "VR-GENRE-001", "title": "Regular Title"},
                    {"id": "VR-TITLE-001", "title": "Some 【VR】 Movie"},
                ],
                "pagination": {"total": 3},
            }

        async def get_movie_detail(self, movie_id):
            details = {
                "KEEP-001": {"title": "Regular Movie", "genres": [{"id": "drama", "name": "Drama"}]},
                "VR-GENRE-001": {"title": "Regular Title", "genres": [{"id": "vr", "name": "VR"}]},
                "VR-TITLE-001": {"title": "Some 【VR】 Movie", "genres": [{"id": "drama", "name": "Drama"}]},
            }
            return details[movie_id]

    fake_service = FakeJavBusService()
    monkeypatch.setattr(movies_service, "javbus_api_service", fake_service)

    payload = asyncio.run(movies_service.get_movies_payload(FakeRequest()))

    assert fake_service.page_queries == [{"magnet": "exist", "type": "normal"}]
    assert payload["movies"] == [{"id": "KEEP-001", "title": "Regular Movie"}]
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


def test_webdav_download_dispatches_pan115_rows_to_session_aria2_without_webdav(monkeypatch):
    class FakeAria2Client:
        def __init__(self):
            self.calls = []

        def add_download(self, url, options=None):
            self.calls.append((url, options or {}))
            return f"gid-{len(self.calls)}"

    fake_aria2_client = FakeAria2Client()

    class FakeSessionStore:
        async def get_state(self, _request):
            return SimpleNamespace(webdav_client=None, aria2_client=fake_aria2_client)

    async def fake_resolve_downloads(files, video_filter=False, min_file_size_mb=300):
        assert files[0].source_type == "pan115"
        assert files[0].pick_code == "pick-1"
        return [
            SimpleNamespace(
                name="movie.mp4",
                url="https://download.115.test/movie.mp4",
                headers=[],
            )
        ], [{"filename": "ad.txt", "success": False, "message": "filtered"}]

    monkeypatch.setattr(webdav_router, "session_store", FakeSessionStore())
    monkeypatch.setattr(webdav_service.pan115_service, "resolve_download_entries_from_config", fake_resolve_downloads)

    client = TestClient(main.app)
    response = client.post(
        "/api/webdav/download",
        json={
            "files": [
                {
                    "source_type": "pan115",
                    "name": "movie.mp4",
                    "path": "file-1",
                    "pick_code": "pick-1",
                    "is_directory": False,
                    "size": 1024,
                }
            ],
            "video_filter": False,
            "min_file_size_mb": 300,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["results"][0]["filename"] == "movie.mp4"
    assert payload["results"][0]["success"] is True
    assert payload["results"][1] == {"filename": "ad.txt", "success": False, "message": "filtered", "skipped": True}
    assert fake_aria2_client.calls == [
        (
            "https://download.115.test/movie.mp4",
            {"out": "movie.mp4", "user-agent": pan115_service_module.PAN115_DOWNLOAD_USER_AGENT},
        )
    ]
    assert "UID=secret" not in json.dumps(payload)


def test_yhg007_parser_extracts_magnet_rows():
    html = """
    <div class="ssbox">
        <div class="title"><h3><a href="/hash/abc.html">ABP-123 ch</a></h3></div>
        <div class="slist"><ul>
            <li>ABP-123-C.mp4&nbsp;<span class="lightColor">2.5 GB</span></li>
        </ul></div>
        <div class="sbar">
            <span><a href="magnet:?xt=urn:btih:ABC123" target="_blank">[磁力链接]</a></span>
            <span>添加时间:<b>2026-06-20</b></span>
            <span>大小:<b class="cpill yellow-pill">2.5 GB</b></span>
            <span>热度:<b>42</b></span>
        </div>
    </div>
    """

    results = magnets_service.parse_yhg007_search_results(html)

    assert len(results) == 1
    assert results[0]["link"] == "magnet:?xt=urn:btih:ABC123"
    assert results[0]["title"] == "ABP-123 ch"
    assert results[0]["filename"] == "ABP-123-C.mp4 2.5 GB"
    assert results[0]["size"] == "2.5 GB"
    assert results[0]["date"] == "2026-06-20"
    assert results[0]["shareDate"] == "2026-06-20"
    assert results[0]["hasSubtitle"] is True
    assert results[0]["source"] == "yhg007"
    assert results[0]["hot"] == "42"


def test_yhg007_best_resource_prefers_hottest_within_twenty_percent_of_largest_size():
    results = [
        {"title": "largest but colder", "size": "10 GB", "hot": "100", "link": "magnet:largest"},
        {"title": "too small but hot", "size": "7.9 GB", "hot": "9999", "link": "magnet:small-hot"},
        {"title": "within band and hottest", "size": "8.1 GB", "hot": "500", "link": "magnet:band-hot"},
        {"title": "within band but colder", "size": "9.5 GB", "hot": "200", "link": "magnet:band-cold"},
    ]

    best = magnets_service.select_yhg007_best_magnet(results)

    assert best["link"] == "magnet:band-hot"


def test_javbus_best_magnet_retries_after_unhealthy_candidate(monkeypatch):
    test_config = runtime.merge_config(
        runtime.DEFAULT_CONFIG,
        {
            "magnet_health": {
                "enabled": True,
                "probe_with_aria2": False,
                "min_seeders": 1,
                "min_peers": 1,
                "min_availability": 1.0,
                "min_score": 1.0,
                "allow_unknown": False,
            },
        },
    )
    monkeypatch.setattr(runtime, "config", test_config)

    async def fake_get_movie_detail(movie_id):
        return {"id": movie_id, "gid": "1", "uc": "2"}

    async def fake_fetch_javbus(movie_id, movie_data):
        return [
            {"title": "largest dead", "link": "magnet:dead", "size": "10 GB", "seeders": 0, "peers": 0},
            {"title": "smaller healthy", "link": "magnet:healthy", "size": "8 GB", "seeders": 2, "peers": 3},
        ]

    monkeypatch.setattr(magnets_service, "get_movie_detail", fake_get_movie_detail)
    monkeypatch.setattr(magnets_service, "fetch_javbus_magnet_data", fake_fetch_javbus)

    best = asyncio.run(magnets_service.get_best_magnet_payload("ABP-123", magnet_source="javbus"))

    assert best["link"] == "magnet:healthy"
    assert best["health"]["status"] == "healthy"
    assert best["health"]["seeders"] == 2


def test_javbus_best_magnet_returns_none_when_all_candidates_unhealthy(monkeypatch):
    test_config = runtime.merge_config(
        runtime.DEFAULT_CONFIG,
        {
            "magnet_health": {
                "enabled": True,
                "probe_with_aria2": False,
                "min_seeders": 1,
                "min_peers": 1,
                "allow_unknown": False,
            },
        },
    )
    monkeypatch.setattr(runtime, "config", test_config)

    async def fake_get_movie_detail(movie_id):
        return {"id": movie_id, "gid": "1", "uc": "2"}

    async def fake_fetch_javbus(movie_id, movie_data):
        return [
            {"title": "dead", "link": "magnet:dead", "size": "10 GB", "seeders": 0, "peers": 0},
            {"title": "unknown", "link": "magnet:unknown", "size": "8 GB"},
        ]

    monkeypatch.setattr(magnets_service, "get_movie_detail", fake_get_movie_detail)
    monkeypatch.setattr(magnets_service, "fetch_javbus_magnet_data", fake_fetch_javbus)

    best = asyncio.run(magnets_service.get_best_magnet_payload("ABP-123", magnet_source="javbus"))

    assert best is None


def test_get_magnets_payload_uses_yhg007_without_javbus_params(monkeypatch):
    calls = []

    async def fake_fetch_yhg007(movie_id, **kwargs):
        calls.append((movie_id, kwargs))
        return [{"link": "magnet:?xt=urn:btih:abc", "title": "ABP-123", "size": "2 GB"}]

    async def fail_get_movie_detail(movie_id):
        raise AssertionError("yhg007 should not require JavBus movie params")

    monkeypatch.setattr(magnets_service, "fetch_yhg007_magnet_data", fake_fetch_yhg007)
    monkeypatch.setattr(magnets_service, "get_movie_detail", fail_get_movie_detail)

    payload = asyncio.run(
        magnets_service.get_magnets_payload(
            "ABP-123",
            {"source": "yhg007", "hasSubtitle": "false", "exclude4k": "true", "sortBy": "size", "sortOrder": "desc"},
        )
    )

    assert payload == [{"link": "magnet:?xt=urn:btih:abc", "title": "ABP-123", "size": "2 GB"}]
    assert calls == [
        (
            "ABP-123",
            {"has_subtitle_filter": "false", "exclude_4k": True, "sort_by": "size", "sort_order": "desc"},
        )
    ]


def test_pan115_download_dispatches_magnets_and_records_successes(monkeypatch):
    class FakePan115Client:
        def __init__(self, cookie):
            self.cookie = cookie
            self.calls = []

        async def add_offline_tasks(self, urls, save_dir_id="0"):
            self.calls.append((urls, save_dir_id))
            return [
                {"url": "magnet:ok", "success": True, "info_hash": "hash-ok"},
                {"url": "magnet:fail", "success": False, "error": "pan115_add_failed", "message": "failed"},
            ]

    clients = []

    def fake_client(*args, **kwargs):
        client = FakePan115Client(*args, **kwargs)
        clients.append(client)
        return client

    saved_ids = []

    async def fake_is_movie_downloaded(movie_id):
        return movie_id == "M-SKIP"

    async def fake_is_movie_present(movie_id):
        return False

    async def fake_save_movies(movie_ids):
        saved_ids.extend(movie_ids)

    monkeypatch.setattr(pan115_service_module, "Pan115Client", fake_client)
    monkeypatch.setattr(pan115_service_module.download_history_service, "is_movie_downloaded", fake_is_movie_downloaded)
    monkeypatch.setattr(pan115_service_module.local_movie_library_service, "is_movie_present", fake_is_movie_present)
    monkeypatch.setattr(pan115_service_module.download_history_service, "save_movies", fake_save_movies)
    monkeypatch.setattr(
        pan115_service_module,
        "get_pan115_config",
        lambda: {
            "enabled": True,
            "cookie": "UID=uid;CID=cid;SEID=seid;KID=kid",
            "save_dir_id": "555",
        },
    )

    result = asyncio.run(
        pan115_service_module.download(
            Pan115DownloadRequest(
                magnet_links=["magnet:ok", "magnet:skip", "magnet:fail"],
                movie_ids=["M-OK", "M-SKIP", "M-FAIL"],
            )
        )
    )

    assert clients[0].cookie == "UID=uid;CID=cid;SEID=seid;KID=kid"
    assert clients[0].calls == [(["magnet:ok", "magnet:fail"], "555")]
    assert result["success"] is True
    assert result["success_count"] == 1
    assert result["skipped_count"] == 1
    assert result["results"][0]["movie_id"] == "M-SKIP"
    assert result["results"][0]["skipped"] is True
    assert saved_ids == ["M-OK"]


def test_pan115_download_batches_large_dispatches_with_configured_pause(monkeypatch):
    class FakePan115Client:
        def __init__(self, cookie):
            self.cookie = cookie
            self.calls = []
            clients.append(self)

        async def add_offline_tasks(self, urls, save_dir_id="0"):
            self.calls.append((list(urls), save_dir_id))
            return [{"url": url, "success": True, "info_hash": f"hash-{index}"} for index, url in enumerate(urls)]

    clients = []
    saved_ids = []
    sleeps = []

    async def fake_not_exists(_movie_id):
        return False

    async def fake_save_movies(movie_ids):
        saved_ids.extend(movie_ids)

    async def fake_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(pan115_service_module, "Pan115Client", FakePan115Client)
    monkeypatch.setattr(pan115_service_module.asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(pan115_service_module.download_history_service, "is_movie_downloaded", fake_not_exists)
    monkeypatch.setattr(pan115_service_module.local_movie_library_service, "is_movie_present", fake_not_exists)
    monkeypatch.setattr(pan115_service_module.download_history_service, "save_movies", fake_save_movies)
    monkeypatch.setattr(
        pan115_service_module,
        "get_pan115_config",
        lambda: {
            "enabled": True,
            "cookie": "UID=uid;CID=cid;SEID=seid;KID=kid",
            "save_dir_id": "555",
            "batch_size": 2,
            "batch_interval_seconds": 0.25,
            "jitter_seconds": 0,
        },
    )

    result = asyncio.run(
        pan115_service_module.download(
            Pan115DownloadRequest(
                magnet_links=["magnet:1", "magnet:2", "magnet:3", "magnet:4", "magnet:5"],
                movie_ids=["M1", "M2", "M3", "M4", "M5"],
            )
        )
    )

    assert clients[0].calls == [
        (["magnet:1", "magnet:2"], "555"),
        (["magnet:3", "magnet:4"], "555"),
        (["magnet:5"], "555"),
    ]
    assert sleeps == [0.25, 0.25]
    assert result["success_count"] == 5
    assert saved_ids == ["M1", "M2", "M3", "M4", "M5"]


def test_pan115_download_deduplicates_links_and_applies_jitter(monkeypatch):
    class FakePan115Client:
        def __init__(self, cookie):
            self.cookie = cookie
            self.calls = []
            clients.append(self)

        async def add_offline_tasks(self, urls, save_dir_id="0"):
            self.calls.append((list(urls), save_dir_id))
            return [{"url": url, "success": True, "info_hash": f"hash-{url[-1]}"} for url in urls]

    clients = []
    sleeps = []

    async def fake_not_exists(_movie_id):
        return False

    async def fake_save_movies(_movie_ids):
        return None

    async def fake_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(pan115_service_module, "Pan115Client", FakePan115Client)
    monkeypatch.setattr(pan115_service_module.asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(pan115_service_module.random, "uniform", lambda _low, _high: -3.0)
    monkeypatch.setattr(pan115_service_module.download_history_service, "is_movie_downloaded", fake_not_exists)
    monkeypatch.setattr(pan115_service_module.local_movie_library_service, "is_movie_present", fake_not_exists)
    monkeypatch.setattr(pan115_service_module.download_history_service, "save_movies", fake_save_movies)
    monkeypatch.setattr(
        pan115_service_module,
        "get_pan115_config",
        lambda: {
            "enabled": True,
            "cookie": "UID=uid;CID=cid;SEID=seid;KID=kid",
            "save_dir_id": "555",
            "batch_size": 2,
            "batch_interval_seconds": 25,
            "jitter_seconds": 5,
        },
    )

    result = asyncio.run(
        pan115_service_module.download(
            Pan115DownloadRequest(
                magnet_links=["magnet:1", "magnet:1", "magnet:2"],
                movie_ids=["M1", "M1-DUP", "M2"],
            )
        )
    )

    assert clients[0].calls == [(["magnet:1", "magnet:2"], "555")]
    assert sleeps == []
    assert result["success_count"] == 2
    assert [item.get("reason") for item in result["results"] if item.get("skipped")] == ["duplicate_magnet"]


def test_pan115_download_retries_failed_batches_with_backoff(monkeypatch):
    class FakePan115Client:
        def __init__(self, cookie):
            self.calls = 0

        async def add_offline_tasks(self, urls, save_dir_id="0"):
            self.calls += 1
            if self.calls == 1:
                raise pan115_service_module.Pan115Error("pan115_add_failed", "temporary failure")
            return [{"url": urls[0], "success": True, "info_hash": "hash-ok"}]

    sleeps = []

    async def fake_not_exists(_movie_id):
        return False

    async def fake_save_movies(_movie_ids):
        return None

    async def fake_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(pan115_service_module, "Pan115Client", FakePan115Client)
    monkeypatch.setattr(pan115_service_module.asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(pan115_service_module.download_history_service, "is_movie_downloaded", fake_not_exists)
    monkeypatch.setattr(pan115_service_module.local_movie_library_service, "is_movie_present", fake_not_exists)
    monkeypatch.setattr(pan115_service_module.download_history_service, "save_movies", fake_save_movies)
    monkeypatch.setattr(
        pan115_service_module,
        "get_pan115_config",
        lambda: {
            "enabled": True,
            "cookie": "UID=uid;CID=cid;SEID=seid;KID=kid",
            "save_dir_id": "555",
            "batch_size": 2,
            "batch_interval_seconds": 0,
            "failure_backoff_seconds": [120, 600],
        },
    )

    result = asyncio.run(
        pan115_service_module.download(Pan115DownloadRequest(magnet_links=["magnet:ok"], movie_ids=["M-OK"]))
    )

    assert sleeps == [120.0]
    assert result["success"] is True
    assert result["success_count"] == 1


def test_pan115_download_job_manager_records_progress(monkeypatch):
    async def fake_download(request, progress_callback=None):
        if progress_callback:
            await progress_callback({"completed_count": 1, "total_count": len(request.magnet_links), "current_batch": 1, "total_batches": 1})
        return {"success": True, "success_count": 1, "skipped_count": 0, "results": [{"success": True}]}

    monkeypatch.setattr(pan115_service_module, "download", fake_download)

    async def exercise():
        manager = pan115_service_module.Pan115DownloadJobManager()
        job = manager.submit(Pan115DownloadRequest(magnet_links=["magnet:ok"], movie_ids=["M-OK"]))
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        return manager.get(job["job_id"])

    snapshot = asyncio.run(exercise())

    assert snapshot["status"] == "completed"
    assert snapshot["completed_count"] == 1
    assert snapshot["result"]["success"] is True
    assert "cookie" not in json.dumps(snapshot)


def test_pan115_directory_cache_reuses_recent_listing(monkeypatch):
    calls = []

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"state": True, "cid": "0", "count": 1, "data": [{"cid": "folder-1", "n": "云下载", "fc": 0}]}

    class FakeAsyncClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, url, params=None, headers=None):
            calls.append((url, params))
            return FakeResponse()

    monkeypatch.setattr(pan115_service_module.httpx, "AsyncClient", FakeAsyncClient)
    client = pan115_service_module.Pan115Client("UID=uid;CID=cid;SEID=seid;KID=kid")

    first = asyncio.run(client.list_directory("0", cache_ttl_seconds=120))
    second = asyncio.run(client.list_directory("0", cache_ttl_seconds=120))

    assert first == second
    assert calls == [(pan115_service_module.PAN115_FILE_LIST_URL, calls[0][1])]


def test_pan115_directory_listing_exposes_pick_code(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "state": True,
                "cid": "0",
                "count": 1,
                "data": [{"fid": "file-1", "pid": "0", "n": "movie.mp4", "ico": "mp4", "s": "1024", "pc": "pick-1"}],
            }

    class FakeAsyncClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, *_args, **_kwargs):
            return FakeResponse()

    monkeypatch.setattr(pan115_service_module.httpx, "AsyncClient", FakeAsyncClient)
    client = pan115_service_module.Pan115Client("UID=uid;CID=cid;SEID=seid;KID=kid")

    payload = asyncio.run(client.list_directory("0", cache_ttl_seconds=0))

    assert payload["items"][0]["id"] == "file-1"
    assert payload["items"][0]["pick_code"] == "pick-1"


def test_pan115_direct_download_uses_android_client(monkeypatch):
    class FakeP115Client:
        def __init__(self, cookie):
            self.cookie = cookie

        async def download_url(self, pick_code, *, headers, app, async_):
            assert self.cookie == "UID=uid;CID=cid;SEID=seid;KID=kid"
            assert pick_code == "pick-1"
            assert headers["user-agent"] == pan115_service_module.PAN115_DOWNLOAD_USER_AGENT
            assert app == "android"
            assert async_ is True
            return "https://download.115.test/movie.mp4"

    monkeypatch.setattr(pan115_service_module, "P115Client", FakeP115Client)
    client = pan115_service_module.Pan115Client("UID=uid;CID=cid;SEID=seid;KID=kid")

    info = asyncio.run(client.resolve_direct_download("pick-1", fallback_name="movie.mp4", fallback_size=1024))

    assert info.url == "https://download.115.test/movie.mp4"
    assert info.name == "movie.mp4"
    assert info.size == 1024
    assert info.headers == []


def test_pan115_direct_download_uses_android_client_for_large_files(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "state": False,
                "msg": "文件大小超出限制，请使用115电脑端下载",
                "msg_code": 50028,
                "file_name": "movie.mp4",
                "file_size": "5173612098",
            }

    class FakeAsyncClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, *_args, **_kwargs):
            return FakeResponse()

    class FakeP115Client:
        def __init__(self, cookie):
            self.cookie = cookie

        async def download_url(self, pick_code, *, headers, app, async_):
            assert pick_code == "pick-large"
            assert headers["user-agent"] == pan115_service_module.PAN115_DOWNLOAD_USER_AGENT
            assert app == "android"
            assert async_ is True
            return "https://download.115.test/movie.mp4"

    monkeypatch.setattr(pan115_service_module, "P115Client", FakeP115Client)
    client = pan115_service_module.Pan115Client("UID=uid;CID=cid;SEID=seid;KID=kid")

    info = asyncio.run(client.resolve_direct_download("pick-large", fallback_name="movie.mp4", fallback_size=5173612098))

    assert info.url == "https://download.115.test/movie.mp4"
    assert info.name == "movie.mp4"
    assert info.size == 5173612098


def test_pan115_direct_download_requires_android_client(monkeypatch):
    monkeypatch.setattr(pan115_service_module, "P115Client", None)
    client = pan115_service_module.Pan115Client("UID=uid;CID=cid;SEID=seid;KID=kid")

    with pytest.raises(pan115_service_module.Pan115Error) as exc_info:
        asyncio.run(client.resolve_direct_download("pick-1", fallback_name="movie.mp4", fallback_size=1024))

    assert exc_info.value.code == "pan115_android_client_unavailable"


def test_pan115_client_add_offline_tasks_uses_web_sign_flow(monkeypatch):
    calls = []

    class FakeResponse:
        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

    class FakeAsyncClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, url, params=None, headers=None):
            calls.append(("get", url, params, headers))
            return FakeResponse({"state": True, "sign": "offline-sign", "time": 1782079287})

        async def post(self, url, params=None, data=None, headers=None):
            calls.append(("post", url, params, data, headers))
            return FakeResponse(
                {
                    "state": True,
                    "result": [
                        {
                            "state": True,
                            "errno": 0,
                            "info_hash": "cd272bf4b1c483abadc09006d4d481a022008217",
                            "url": data["url[0]"],
                        }
                    ],
                }
            )

    monkeypatch.setattr(pan115_service_module.httpx, "AsyncClient", FakeAsyncClient)

    result = asyncio.run(
        pan115_service_module.Pan115Client("UID=9770899_R1_1782078708;CID=cid;SEID=seid").add_offline_tasks(
            ["magnet:?xt=urn:btih:CD272BF4B1C483ABADC09006D4D481A022008217"],
            save_dir_id="3456592279215537221",
        )
    )

    assert calls[0][0] == "get"
    assert calls[0][2]["ct"] == "offline"
    assert calls[0][2]["ac"] == "space"
    assert calls[1][0] == "post"
    assert calls[1][2] == {"ct": "lixian", "ac": "add_task_urls"}
    assert calls[1][3]["uid"] == "9770899"
    assert calls[1][3]["sign"] == "offline-sign"
    assert calls[1][3]["time"] == "1782079287"
    assert calls[1][3]["wp_path_id"] == "3456592279215537221"
    assert calls[1][3]["url[0]"].startswith("magnet:?xt=urn:btih:")
    assert result[0]["success"] is True
    assert result[0]["info_hash"] == "cd272bf4b1c483abadc09006d4d481a022008217"


def test_pan115_client_treats_existing_offline_task_as_success(monkeypatch):
    class FakeResponse:
        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

    class FakeAsyncClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, *_args, **_kwargs):
            return FakeResponse({"state": True, "sign": "offline-sign", "time": 1782079287})

        async def post(self, _url, params=None, data=None, headers=None):
            return FakeResponse(
                {
                    "state": False,
                    "error_msg": "任务已存在，请勿输入重复的链接地址",
                    "result": [
                        {
                            "state": False,
                            "errcode": 10008,
                            "error_msg": "任务已存在，请勿输入重复的链接地址",
                            "info_hash": "cd272bf4b1c483abadc09006d4d481a022008217",
                            "url": data["url[0]"],
                        }
                    ],
                }
            )

    monkeypatch.setattr(pan115_service_module.httpx, "AsyncClient", FakeAsyncClient)

    result = asyncio.run(
        pan115_service_module.Pan115Client("UID=9770899_R1_1782078708;CID=cid;SEID=seid").add_offline_tasks(
            ["magnet:?xt=urn:btih:CD272BF4B1C483ABADC09006D4D481A022008217"]
        )
    )

    assert result[0]["success"] is True
    assert result[0]["message"] == "任务已存在，请勿输入重复的链接地址"


def test_pan115_qrcode_status_allowed_saves_cookie_without_echoing_secret(monkeypatch, tmp_path):
    class FakeQrStore:
        def get(self, session_id):
            assert session_id == "session-1"
            return SimpleNamespace(uid="qr-uid", app="wechatmini")

        def delete(self, session_id):
            assert session_id == "session-1"

    async def fake_check_qrcode_status(_session):
        return {"status": 2, "state": "allowed", "message": "allowed"}

    async def fake_login_qrcode(_session):
        return "UID=pan115-uid;CID=pan115-cid;SEID=pan115-seid;KID=pan115-kid"

    saved_updates = []
    monkeypatch.setattr(pan115_service_module, "qr_session_store", FakeQrStore())
    monkeypatch.setattr(pan115_service_module, "check_qrcode_status", fake_check_qrcode_status)
    monkeypatch.setattr(pan115_service_module, "login_qrcode", fake_login_qrcode)
    monkeypatch.setattr(pan115_service_module.runtime, "update_config_section", lambda section, updates: saved_updates.append((section, updates)) or updates)

    client = TestClient(main.app)
    response = client.get("/api/115/qrcode/session-1/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == 2
    assert payload["state"] == "allowed"
    assert payload["configured"] is True
    assert "cookie" not in payload
    assert saved_updates == [
        (
            "pan115",
            {
                "enabled": True,
                "cookie": "UID=pan115-uid;CID=pan115-cid;SEID=pan115-seid;KID=pan115-kid",
                "login_app": "wechatmini",
            },
        )
    ]


def test_pan115_qrcode_start_returns_public_session_without_secret(monkeypatch):
    class FakeQrStore:
        def create(self, session, app):
            assert app == "wechatmini"
            assert session["uid"] == "qr-uid"
            return "session-1"

    async def fake_start_qrcode():
        return {
            "uid": "qr-uid",
            "time": 1710000000,
            "sign": "qr-sign",
            "qrcode": "115://qrcode-content",
        }

    monkeypatch.setattr(pan115_service_module, "qr_session_store", FakeQrStore())
    monkeypatch.setattr(pan115_service_module, "start_qrcode", fake_start_qrcode)

    client = TestClient(main.app)
    response = client.post("/api/115/qrcode/start", json={"app": "wechatmini"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["session_id"] == "session-1"
    assert payload["qrcode"] == "115://qrcode-content"
    assert payload["qrcode_image_url"].endswith("uid=qr-uid")
    assert payload["state"] == "waiting"
    assert "sign" not in payload
    assert "cookie" not in payload


def test_automation_service_dispatches_to_pan115(tmp_path, monkeypatch):
    dispatched = []

    async def fake_pan115_download(request):
        dispatched.extend(request.magnet_links)
        return {"success": True, "success_count": len(request.magnet_links), "results": [{"success": True}]}

    monkeypatch.setattr(automation_service_module, "pan115_download", fake_pan115_download)

    async def exercise():
        service = AutomationService(str(tmp_path / "automation_tasks.json"), scheduler_enabled=False)
        return await service._dispatch_downloads(
            {"tool": "115"},
            [{"movie_id": "ABP-123", "magnet": {"link": "magnet:?xt=urn:btih:abc"}}],
        )

    results = asyncio.run(exercise())

    assert dispatched == ["magnet:?xt=urn:btih:abc"]
    assert results == [{"success": True}]


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


def test_local_scrape_target_paths_truncate_multibyte_segments_to_filesystem_limit():
    source_path = Path("/incoming/MIDA-440.mp4")
    long_title = "MIDA-440 " + ("ご主人様" * 80)
    metadata = local_scrape._build_metadata(
        {
            "id": "MIDA-440",
            "title": long_title,
        },
        "MIDA-440",
        source_path.stem,
    )

    target_dir, target_video, target_stem = local_scrape._build_target_paths(
        source_path,
        metadata,
        True,
        "/library",
        "{code} {title}",
        "{code} {title}",
    )

    folder_name = target_dir.name
    assert len(folder_name.encode("utf-8")) <= 180
    assert len(target_stem.encode("utf-8")) <= 180
    assert len(target_video.name.encode("utf-8")) <= 255


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


def test_local_scrape_nfo_writes_video_stream_details(tmp_path, monkeypatch):
    video = tmp_path / "ABP-123.mp4"
    video.write_bytes(b"video")

    def fake_probe_video_metadata(path):
        assert path == video
        return {
            "width": 1920,
            "height": 1080,
            "resolution_pixels": 1920 * 1080,
            "bitrate": 4_500_000,
            "codec": "h264",
            "container": "mp4",
            "duration_seconds": 3600,
        }

    monkeypatch.setattr(local_scrape, "_probe_video_metadata", fake_probe_video_metadata)

    nfo_path = local_scrape._write_nfo(
        video,
        {
            "id": "ABP-123",
            "title": "ABP-123 Sample Title",
            "date": "2024-01-02",
            "stars": [],
            "genres": [],
        },
        None,
        [],
    )

    text = nfo_path.read_text(encoding="utf-8-sig")
    assert "<fileinfo>" in text
    assert "<streamdetails>" in text
    assert "<video>" in text
    assert "<width>1920</width>" in text
    assert "<height>1080</height>" in text
    assert "<bitrate>4500000</bitrate>" in text
    assert "<codec>h264</codec>" in text
    assert "<container>mp4</container>" in text
    assert "<durationinseconds>3600</durationinseconds>" in text


def test_local_library_scan_records_video_media_metadata(tmp_path, monkeypatch):
    video = tmp_path / "ABP-123.mp4"
    video.write_bytes(b"video")
    service = local_movie_library_service.__class__(str(tmp_path / "library.json"))

    async def fake_get_movie_detail(movie_id):
        return {
            "id": movie_id,
            "title": "ABP-123 Remote Title",
            "date": "2024-01-02",
        }

    def fake_probe_video_metadata(path):
        assert path.resolve() == video.resolve()
        return {
            "width": 3840,
            "height": 2160,
            "resolution_pixels": 3840 * 2160,
            "bitrate": 12_000_000,
            "codec": "hevc",
            "container": "matroska",
        }

    monkeypatch.setattr(movies_local_library, "local_movie_library_service", service)
    monkeypatch.setattr(local_scrape, "metadata_scraper_service", FakeMetadataScraperService(fake_get_movie_detail))
    monkeypatch.setattr(movies_local_library, "_probe_video_metadata", fake_probe_video_metadata)

    payload = asyncio.run(
        movies_local_library.scan_local_library(
            movies_local_library.LocalLibraryScanRequest(directory=str(tmp_path), scrape=True)
        )
    )
    summary = asyncio.run(service.get_summary())

    assert payload["success"] is True
    record = summary["records"][0]
    file_record = record["files"][0]
    assert file_record["width"] == 3840
    assert file_record["height"] == 2160
    assert file_record["resolution_pixels"] == 3840 * 2160
    assert file_record["bitrate"] == 12_000_000
    assert file_record["codec"] == "hevc"
    assert file_record["container"] == "matroska"
    assert record["media_info"]["width"] == 3840
    assert record["media_info"]["height"] == 2160
    assert record["media_info"]["bitrate"] == 12_000_000
    assert record["media_info"]["codec"] == "hevc"
    assert record["media_info"]["container"] == "matroska"


def test_local_library_information_download_refreshes_video_media_metadata(tmp_path, monkeypatch):
    video = tmp_path / "ABP-123.mp4"
    video.write_bytes(b"video")
    service = local_movie_library_service.__class__(str(tmp_path / "library.json"))

    asyncio.run(
        service.update_from_scan(
            str(tmp_path),
            [
                {
                    "movie_id": "ABP-123",
                    "path": str(video),
                    "relative_path": video.name,
                    "file_name": video.name,
                    "size": video.stat().st_size,
                    "modified_at": "2024-01-01T00:00:00",
                    "extension": ".mp4",
                    "metadata": {"id": "ABP-123", "title": "ABP-123", "raw": {}},
                    "scrape_status": "skipped",
                    "scrape_error": None,
                    "scraped_at": "",
                    "full_text": "ABP-123",
                }
            ],
        )
    )

    async def fake_get_movie_detail(movie_id):
        return {
            "id": movie_id,
            "title": "ABP-123 Remote Title",
            "date": "2024-01-02",
        }

    def fake_probe_video_metadata(path):
        assert path.resolve() == video.resolve()
        return {
            "width": 1920,
            "height": 1080,
            "resolution_pixels": 1920 * 1080,
            "bitrate": 5_000_000,
            "codec": "h264",
            "container": "mp4",
        }

    monkeypatch.setattr(movies_local_library, "local_movie_library_service", service)
    monkeypatch.setattr(local_scrape, "metadata_scraper_service", FakeMetadataScraperService(fake_get_movie_detail))
    monkeypatch.setattr(movies_local_library, "_probe_video_metadata", fake_probe_video_metadata)
    monkeypatch.setattr(local_scrape, "_probe_video_metadata", fake_probe_video_metadata)

    result = asyncio.run(
        movies_local_library.download_missing_local_library_information(
            movies_local_library.LocalLibraryInformationDownloadRequest(
                movie_ids=["ABP-123"],
                fields=["title", "nfo"],
                write_nfo=True,
                download_images=False,
            )
        )
    )
    summary = asyncio.run(service.get_summary())

    assert result["updated_count"] == 1
    file_record = summary["records"][0]["files"][0]
    assert file_record["width"] == 1920
    assert file_record["height"] == 1080
    assert file_record["bitrate"] == 5_000_000
    assert file_record["codec"] == "h264"
    assert file_record["container"] == "mp4"
    assert summary["records"][0]["media_info"]["resolution_pixels"] == 1920 * 1080
    nfo_text = video.with_suffix(".nfo").read_text(encoding="utf-8-sig")
    assert "<width>1920</width>" in nfo_text
    assert "<codec>h264</codec>" in nfo_text
    assert "<container>mp4</container>" in nfo_text


def test_local_library_clean_invalid_deletes_unprobeable_files_and_updates_index(tmp_path, monkeypatch):
    valid_video = tmp_path / "ABP-123.mp4"
    broken_video = tmp_path / "ABP-123-broken.mp4"
    only_broken_video = tmp_path / "IPX-456.mp4"
    valid_video.write_bytes(b"valid")
    broken_video.write_bytes(b"broken")
    only_broken_video.write_bytes(b"broken-only")
    service = local_movie_library_service.__class__(str(tmp_path / "library.json"))

    asyncio.run(
        service.update_from_scan(
            str(tmp_path),
            [
                {
                    "movie_id": "ABP-123",
                    "path": str(valid_video),
                    "relative_path": valid_video.name,
                    "file_name": valid_video.name,
                    "size": valid_video.stat().st_size,
                    "modified_at": "2024-01-01T00:00:00",
                    "extension": ".mp4",
                },
                {
                    "movie_id": "ABP-123",
                    "path": str(broken_video),
                    "relative_path": broken_video.name,
                    "file_name": broken_video.name,
                    "size": broken_video.stat().st_size,
                    "modified_at": "2024-01-01T00:00:00",
                    "extension": ".mp4",
                },
                {
                    "movie_id": "IPX-456",
                    "path": str(only_broken_video),
                    "relative_path": only_broken_video.name,
                    "file_name": only_broken_video.name,
                    "size": only_broken_video.stat().st_size,
                    "modified_at": "2024-01-01T00:00:00",
                    "extension": ".mp4",
                },
            ],
        )
    )

    def fake_probe_video_metadata(path):
        return {
            "width": 1920,
            "height": 1080,
            "resolution_pixels": 1920 * 1080,
            "bitrate": 8_000_000,
        } if Path(path).resolve() == valid_video.resolve() else {}

    monkeypatch.setattr(movies_local_library, "local_movie_library_service", service)
    monkeypatch.setattr(movies_local_library, "_probe_video_metadata", fake_probe_video_metadata)
    monkeypatch.setattr(movies_local_library.shutil, "which", lambda name: "ffprobe")

    payload = asyncio.run(movies_local_library.clean_invalid_local_library_files())
    summary = asyncio.run(service.get_summary())

    assert payload["success"] is True
    assert payload["checked_file_count"] == 3
    assert payload["deleted_file_count"] == 2
    assert payload["removed_movie_count"] == 1
    assert valid_video.exists()
    assert not broken_video.exists()
    assert not only_broken_video.exists()
    assert [record["movie_id"] for record in summary["records"]] == ["ABP-123"]
    assert summary["records"][0]["file_count"] == 1
    assert summary["records"][0]["media_info"]["bitrate"] == 8_000_000


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


def test_local_scrape_apply_supports_auto_best_conflict_resolution(tmp_path, monkeypatch):
    source_dir = tmp_path / "source"
    target_dir = tmp_path / "target"
    source_dir.mkdir()
    target_dir.mkdir()
    metadata = {
        "id": "ABP-123",
        "title": "ABP-123 Remote Title",
        "raw": {"id": "ABP-123"},
    }

    media_by_content = {
        b"source-resolution": {"resolution_pixels": 1920 * 1080, "bitrate": 1_000_000},
        b"target-resolution": {"resolution_pixels": 1280 * 720, "bitrate": 4_000_000},
        b"source-bitrate": {"bitrate": 1_000_000},
        b"target-bitrate": {"bitrate": 2_000_000},
    }

    def fake_probe(path):
        return media_by_content.get(Path(path).read_bytes(), {})

    monkeypatch.setattr(local_scrape, "_probe_video_metadata", fake_probe)

    async def run_auto(source_bytes, target_bytes, source_mtime=100, target_mtime=200):
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
                        "conflict_resolution": "auto_best",
                    }
                ],
                target_directory=str(target_dir),
                write_nfo=False,
                download_images=False,
            )
        )
        return result, source_video, target_video

    higher_resolution, source_video, target_video = asyncio.run(
        run_auto(b"source-resolution", b"target-resolution")
    )
    assert higher_resolution["results"][0]["kept"] == "source"
    assert not source_video.exists()
    assert target_video.read_bytes() == b"source-resolution"

    higher_bitrate, source_video, target_video = asyncio.run(
        run_auto(b"source-bitrate", b"target-bitrate")
    )
    assert higher_bitrate["results"][0]["skipped"] is True
    assert higher_bitrate["results"][0]["kept"] == "target"
    assert higher_bitrate["results"][0]["deleted_source"] is True
    assert not source_video.exists()
    assert target_video.read_bytes() == b"target-bitrate"

    unresolved, source_video, target_video = asyncio.run(
        run_auto(b"same", b"same", 300, 300)
    )
    assert unresolved["success"] is True
    assert unresolved["results"][0]["skipped"] is True
    assert unresolved["results"][0]["kept"] == "target"
    assert source_video.exists()
    assert target_video.read_bytes() == b"same"


def test_local_scrape_apply_rejects_duplicate_targets_in_same_request(tmp_path):
    source_dir = tmp_path / "source"
    target_dir = tmp_path / "target"
    source_dir.mkdir()
    target_dir.mkdir()
    first_video = source_dir / "ABP-123-a.mp4"
    second_video = source_dir / "ABP-123-b.mp4"
    first_video.write_bytes(b"first")
    second_video.write_bytes(b"second")
    metadata = {
        "id": "ABP-123",
        "title": "ABP-123 Remote Title",
        "raw": {"id": "ABP-123"},
    }

    result = asyncio.run(
        local_scrape.apply_local_scrape(
            local_scrape.LocalScrapeApplyRequest(
                items=[
                    {
                        "source_path": str(first_video),
                        "code": "ABP-123",
                        "metadata": metadata,
                        "conflict_resolution": "auto_best",
                    },
                    {
                        "source_path": str(second_video),
                        "code": "ABP-123",
                        "metadata": metadata,
                        "conflict_resolution": "auto_best",
                    },
                ],
                target_directory=str(target_dir),
                write_nfo=False,
                download_images=False,
            )
        )
    )

    assert result["success"] is False
    assert result["success_count"] == 0
    assert result["failed_count"] == 2
    assert {item["error"] for item in result["results"]} == {"target_duplicate"}
    assert first_video.exists()
    assert second_video.exists()
    assert not (target_dir / "ABP-123 Remote Title" / "ABP-123 Remote Title.mp4").exists()


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


def test_local_scrape_preview_uses_configured_metadata_scraper_chain(tmp_path, monkeypatch):
    video = tmp_path / "ABP-123.mp4"
    video.write_bytes(b"video")

    class FakeMetadataScraperService:
        async def get_movie_detail(self, movie_id):
            assert movie_id == "ABP-123"
            return {
                "metadata": {
                    "id": movie_id,
                    "title": "ABP-123 Provider Title",
                    "date": "2026-06-21",
                    "raw": {"id": movie_id},
                },
                "source": "r18dev",
                "logs": [
                    {"level": "warning", "message": "javbus did not match"},
                    {"level": "info", "message": "r18dev matched"},
                ],
            }

    monkeypatch.setattr(local_scrape, "metadata_scraper_service", FakeMetadataScraperService())

    payload = asyncio.run(
        local_scrape.preview_local_scrape(
            local_scrape.LocalScrapePreviewRequest(directory=str(tmp_path), scrape=True),
        )
    )

    item = payload["items"][0]
    assert item["scrape_status"] == "found"
    assert item["scrape_source"] == "r18dev"
    assert item["metadata"]["title"] == "ABP-123 Provider Title"
    assert any("r18dev matched" in entry["message"] for entry in item["scrape_logs"])


def test_local_scrape_preview_keeps_diagnostic_reasons_for_abnormal_rows(tmp_path, monkeypatch):
    unrecognized = tmp_path / "movie-without-code.mp4"
    missing = tmp_path / "ABP-123.mp4"
    failed = tmp_path / "IPX-456.mp4"
    unrecognized.write_bytes(b"video")
    missing.write_bytes(b"video")
    failed.write_bytes(b"video")

    async def fake_get_movie_detail(movie_id):
        if movie_id == "IPX-456":
            raise RuntimeError("upstream timeout")
        return None

    monkeypatch.setattr(local_scrape.javbus_api_service, "get_movie_detail", fake_get_movie_detail)
    monkeypatch.setattr(
        metadata_scrapers.runtime,
        "get_scrapers_config",
        lambda: {
            "priority": ["javbus"],
            "javbus": {"enabled": True},
        },
    )

    payload = asyncio.run(
        local_scrape.preview_local_scrape(
            local_scrape.LocalScrapePreviewRequest(directory=str(tmp_path), scrape=True),
        )
    )

    by_name = {item["file_name"]: item for item in payload["items"]}

    assert by_name["movie-without-code.mp4"]["scrape_status"] == "unrecognized"
    assert by_name["movie-without-code.mp4"]["scrape_reason"]
    assert by_name["movie-without-code.mp4"]["scrape_logs"]

    assert by_name["ABP-123.mp4"]["scrape_status"] == "not_found"
    assert "ABP-123" in by_name["ABP-123.mp4"]["scrape_reason"]
    assert by_name["ABP-123.mp4"]["scrape_logs"]

    assert by_name["IPX-456.mp4"]["scrape_status"] == "failed"
    assert by_name["IPX-456.mp4"]["error"] == "metadata_fetch_failed"
    assert "upstream timeout" in by_name["IPX-456.mp4"]["scrape_reason"]
    assert any("upstream timeout" in entry["message"] for entry in by_name["IPX-456.mp4"]["scrape_logs"])


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


def test_actor_library_indexes_movies_and_downloads_missing_avatar_once(tmp_path, monkeypatch):
    downloaded = []
    fetched_star_ids = []

    async def fake_download(url, target, overwrite):
        downloaded.append((url, target.relative_to(tmp_path), overwrite))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"avatar")
        return target.name

    async def fake_star_info(star_id):
        fetched_star_ids.append(star_id)
        return {
            "id": star_id,
            "avatar": f"https://www.javbus.com/pics/actress/{star_id}.jpg",
        }

    monkeypatch.setattr(history_service_module, "download_image", fake_download)
    monkeypatch.setattr(history_service_module.javbus_api_service, "get_star_info", fake_star_info)

    async def exercise():
        service = local_actor_library_service.__class__(
            str(tmp_path / "actors.json"),
            str(tmp_path / "actor_images"),
        )
        await service.sync_from_movie_records(
            [
                {
                    "movie_id": "ABP-123",
                    "title": "ABP-123 Sample",
                    "date": "2024-01-02",
                    "metadata": {
                        "actor_refs": [{"id": "star-a", "name": "Actor One"}],
                        "stars": ["Actor One"],
                    },
                }
            ],
            download_missing_avatars=True,
        )
        first = await service.get_summary()
        await service.sync_from_movie_records(
            [
                {
                    "movie_id": "ABP-123",
                    "title": "ABP-123 Sample",
                    "date": "2024-01-02",
                    "metadata": {
                        "actor_refs": [{"id": "star-a", "name": "Actor One"}],
                        "stars": ["Actor One"],
                    },
                },
                {
                    "movie_id": "ABP-124",
                    "title": "ABP-124 Sample",
                    "date": "2024-02-02",
                    "metadata": {
                        "actor_refs": [{"id": "star-a", "name": "Actor One"}],
                        "stars": ["Actor One"],
                    },
                },
            ],
            download_missing_avatars=True,
        )
        second = await service.get_summary()
        avatar_path = await service.get_avatar_path("star-a")
        return first, second, avatar_path

    first, second, avatar_path = asyncio.run(exercise())

    assert first["total_actors"] == 1
    assert first["actors"][0]["key"] == "star-a"
    assert first["actors"][0]["movie_ids"] == ["ABP-123"]
    assert first["actors"][0]["avatar_url"] == "/api/movies/local-library/actors/star-a/avatar"
    assert second["actors"][0]["movie_ids"] == ["ABP-123", "ABP-124"]
    assert second["actors"][0]["movie_count"] == 2
    assert avatar_path == (tmp_path / "actor_images" / "star-a.jpg").resolve()
    assert downloaded == [
        ("https://www.javbus.com/pics/actress/star-a.jpg", Path("actor_images") / "star-a.jpg", False)
    ]
    assert fetched_star_ids == ["star-a"]


def test_local_movie_library_syncs_actor_library_when_metadata_changes(tmp_path):
    video = tmp_path / "ABP-123.mp4"
    video.write_bytes(b"video")

    async def exercise():
        actor_service = local_actor_library_service.__class__(
            str(tmp_path / "actors.json"),
            str(tmp_path / "actor_images"),
        )
        movie_service = local_movie_library_service.__class__(
            str(tmp_path / "library.json"),
            actor_library_service=actor_service,
        )
        await movie_service.update_from_scan(
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
                        "actor_refs": [{"id": "star-a", "name": "Actor One", "avatar": "data:image/jpeg;base64,YXZhdGFy"}],
                        "stars": ["Actor One"],
                    },
                    "scrape_status": "found",
                    "full_text": "ABP-123 Actor One",
                }
            ],
        )
        return await actor_service.get_summary()

    summary = asyncio.run(exercise())

    assert summary["total_actors"] == 1
    assert summary["actors"][0]["name"] == "Actor One"
    assert summary["actors"][0]["movie_ids"] == ["ABP-123"]


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


def test_local_library_information_check_respects_selected_fields(tmp_path):
    video = tmp_path / "ABP-123.mp4"
    video.write_bytes(b"video")

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
            ],
        )
        default_check = await service.get_information_check()
        metadata_only_check = await service.get_information_check(["title", "date", "stars", "genres", "cover_url"])
        return default_check, metadata_only_check

    default_check, metadata_only_check = asyncio.run(exercise())

    assert default_check["fields"] == ["title", "date", "stars", "genres", "cover_url", "nfo", "poster_file"]
    assert default_check["incomplete_count"] == 1
    assert default_check["incomplete_records"][0]["missing_fields"] == ["nfo", "poster_file"]
    assert metadata_only_check["fields"] == ["title", "date", "stars", "genres", "cover_url"]
    assert metadata_only_check["incomplete_count"] == 0


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
            "source": "r18dev",
            "metadata": {
                "id": movie_id,
                "title": f"{movie_id} Remote Title",
                "date": "2024-03-04",
                "img": "https://www.javbus.com/pics/remote.jpg",
                "stars": [{"name": "Actor One"}],
                "genres": [{"name": "Genre A"}],
            },
            "logs": [{"provider": "r18dev", "level": "info", "message": "matched"}],
        }

    monkeypatch.setattr(local_scrape, "metadata_scraper_service", FakeMetadataScraperService(fake_get_movie_detail))

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

    monkeypatch.setattr(local_scrape, "metadata_scraper_service", FakeMetadataScraperService(fake_get_movie_detail))
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

    monkeypatch.setattr(local_scrape, "metadata_scraper_service", FakeMetadataScraperService(fake_get_movie_detail))
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


def test_local_library_information_download_reports_failed_poster_asset(tmp_path, monkeypatch):
    video = tmp_path / "ABP-126.mp4"
    video.write_bytes(b"video")

    async def fake_get_movie_detail(movie_id):
        return {
            "id": movie_id,
            "title": f"{movie_id} Remote Title",
            "date": "2024-03-04",
            "img": "https://www.javbus.com/pics/blocked.jpg",
            "stars": [{"name": "Actor One"}],
            "genres": [{"name": "Genre A"}],
        }

    async def fake_write_images(video_path, metadata, overwrite, include_samples=False):
        return None, []

    def fake_write_nfo(video_path, metadata, poster_name, sample_names):
        nfo = video_path.with_suffix(".nfo")
        nfo.write_text("nfo", encoding="utf-8")
        return nfo

    monkeypatch.setattr(local_scrape, "metadata_scraper_service", FakeMetadataScraperService(fake_get_movie_detail))
    monkeypatch.setattr(movies_local_library, "_write_images", fake_write_images)
    monkeypatch.setattr(movies_local_library, "_write_nfo", fake_write_nfo)

    async def exercise():
        service = local_movie_library_service.__class__(str(tmp_path / "library.json"))
        monkeypatch.setattr(movies_local_library, "local_movie_library_service", service)
        await service.update_from_scan(
            str(tmp_path),
            [
                {
                    "movie_id": "ABP-126",
                    "path": str(video),
                    "relative_path": video.name,
                    "file_name": video.name,
                    "size": 456,
                    "metadata": {"id": "ABP-126", "title": "ABP-126", "raw": {}},
                    "scrape_status": "skipped",
                    "full_text": "ABP-126",
                },
            ],
        )
        return await movies_local_library.download_missing_local_library_information(
            movies_local_library.LocalLibraryInformationDownloadRequest(
                only_missing=True,
                concurrent=1,
                write_nfo=True,
                download_images=True,
            )
        )

    result = asyncio.run(exercise())

    assert result["updated_count"] == 0
    assert result["failed_count"] == 1
    assert result["results"][0]["success"] is False
    assert result["results"][0]["image_error"] == "image_download_failed"
    assert result["information_check"]["incomplete_count"] == 1
    assert result["information_check"]["incomplete_records"][0]["missing_fields"] == ["poster_file"]


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
