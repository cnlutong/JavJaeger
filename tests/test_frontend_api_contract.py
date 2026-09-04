from pathlib import Path

from main import app


FRONTEND_ROOT = Path(__file__).resolve().parents[1] / "frontend" / "src"


def test_every_frontend_api_family_has_a_registered_concrete_route():
    source = "\n".join(
        path.read_text(encoding="utf-8-sig")
        for path in FRONTEND_ROOT.rglob("*.*")
        if path.suffix in {".js", ".jsx", ".mjs", ".html"}
    )
    routes = {
        (method, route.path)
        for route in app.routes
        for method in (getattr(route, "methods", None) or ())
        if getattr(route, "path", "").startswith("/api/") and route.path != "/api/{path:path}"
    }
    contracts = [
        ("GET", "/api/system/info", "/api/system/info"),
        ("GET", "/api/client-config", "/api/client-config"),
        ("GET", "/api/system/directories", "/api/system/directories"),
        ("GET", "/api/system/files", "/api/system/files"),
        ("GET", "/api/system/settings", "/api/system/settings"),
        ("PUT", "/api/system/settings", "/api/system/settings"),
        ("PUT", "/api/system/settings/javbus", "/api/system/settings/javbus"),
        ("GET", "/api/history", "/api/history"),
        ("DELETE", "/api/history", "/api/history"),
        ("POST", "/api/history/check-local-library", "/api/history/check-local-library"),
        ("GET", "/api/movies?", "/api/movies"),
        ("GET", "/api/movies/all?", "/api/movies/all"),
        ("GET", "/api/movies/${", "/api/movies/{movie_id}"),
        ("POST", "/api/movies/recognize", "/api/movies/recognize"),
        ("POST", "/api/movies/download-by-codes", "/api/movies/download-by-codes"),
        ("GET", "/api/magnets/${", "/api/magnets/{movie_id}"),
        ("POST", "/api/pikpak/login", "/api/pikpak/login"),
        ("POST", "/api/pikpak/login-config", "/api/pikpak/login-config"),
        ("POST", "/api/pikpak/download", "/api/pikpak/download"),
        ("POST", "/api/115/qrcode/start", "/api/115/qrcode/start"),
        ("GET", "/api/115/qrcode/${", "/api/115/qrcode/{session_id}/status"),
        ("POST", "/api/115/download", "/api/115/download"),
        ("POST", "/api/115/download-jobs", "/api/115/download-jobs"),
        ("GET", "/api/115/download-jobs/${", "/api/115/download-jobs/{job_id}"),
        ("GET", "/api/115/files?", "/api/115/files"),
        ("POST", "/api/webdav/connect", "/api/webdav/connect"),
        ("POST", "/api/webdav/connect-config", "/api/webdav/connect-config"),
        ("GET", "/api/webdav/status", "/api/webdav/status"),
        ("GET", "/api/webdav/files?", "/api/webdav/files"),
        ("POST", "/api/webdav/download", "/api/webdav/download"),
        ("POST", "/api/aria2/connect", "/api/aria2/connect"),
        ("POST", "/api/aria2/connect-config", "/api/aria2/connect-config"),
        ("GET", "/api/aria2/downloads", "/api/aria2/downloads"),
        ("POST", "/api/aria2/download-magnets", "/api/aria2/download-magnets"),
        ("POST", "/api/aria2/${action}", "/api/aria2/pause/{gid}"),
        ("POST", "/api/aria2/${action}", "/api/aria2/resume/{gid}"),
        ("DELETE", "/api/aria2/${action}", "/api/aria2/remove/{gid}"),
        ("GET", "/api/automation/tasks", "/api/automation/tasks"),
        ("POST", "/api/automation/tasks", "/api/automation/tasks"),
        ("GET", "/api/automation/tasks/${", "/api/automation/tasks/{task_id}"),
        ("PUT", "/api/automation/tasks/${", "/api/automation/tasks/{task_id}"),
        ("DELETE", "/api/automation/tasks/${", "/api/automation/tasks/{task_id}"),
        ("POST", "/run`,", "/api/automation/tasks/{task_id}/run"),
        ("GET", "/api/image-proxy?", "/api/image-proxy"),
        ("GET", "/api/movies/local-library", "/api/movies/local-library"),
        ("DELETE", "/api/movies/local-library", "/api/movies/local-library"),
        ("GET", "/api/movies/local-library/settings", "/api/movies/local-library/settings"),
        ("PUT", "/api/movies/local-library/settings", "/api/movies/local-library/settings"),
        ("POST", "/api/movies/local-library/scan/jobs", "/api/movies/local-library/scan/jobs"),
        ("GET", "/scan/jobs/${", "/api/movies/local-library/scan/jobs/{task_id}"),
        ("GET", "/information/check?", "/api/movies/local-library/information/check"),
        ("POST", "/information/download", "/api/movies/local-library/information/download"),
        ("POST", "/clean-invalid", "/api/movies/local-library/clean-invalid"),
        ("GET", "/api/movies/local-library/actors", "/api/movies/local-library/actors"),
        ("GET", "/actors/${", "/api/movies/local-library/actors/{actor_key}/avatar"),
        ("GET", "/actor-avatar/${", "/api/movies/local-library/actor-avatar/{movie_id}/{actor_name}"),
        ("GET", "/play?file_index=", "/api/movies/local-library/{movie_id}/play"),
        ("DELETE", "/files`, { method: \"DELETE\"", "/api/movies/local-library/{movie_id}/files"),
        ("DELETE", "/api/movies/local-library/${", "/api/movies/local-library/{movie_id}"),
        ("GET", "/api/movies/transcoding/presets", "/api/movies/transcoding/presets"),
        ("GET", "/api/movies/transcoding/tasks", "/api/movies/transcoding/tasks"),
        ("POST", "/api/movies/transcoding/tasks", "/api/movies/transcoding/tasks"),
        ("POST", "action === \"cancel\"", "/api/movies/transcoding/tasks/{task_id}/cancel"),
        ("POST", "action === \"retry\"", "/api/movies/transcoding/tasks/{task_id}/retry"),
        ("DELETE", "runAction(task, \"\", \"DELETE\")", "/api/movies/transcoding/tasks/{task_id}"),
        ("POST", "/api/movies/local-scrape/preview/jobs", "/api/movies/local-scrape/preview/jobs"),
        ("POST", "/api/movies/local-scrape/apply/jobs", "/api/movies/local-scrape/apply/jobs"),
        ("GET", "/api/movies/local-scrape/jobs/${", "/api/movies/local-scrape/jobs/{task_id}"),
        ("POST", "/api/movies/local-scrape/delete", "/api/movies/local-scrape/delete"),
        ("POST", "/api/movies/metadata-scrapers/test", "/api/movies/metadata-scrapers/test"),
        ("POST", "/api/movies/metadata-scrapers/apply-test-results", "/api/movies/metadata-scrapers/apply-test-results"),
    ]

    for method, frontend_needle, route_path in contracts:
        assert frontend_needle in source, f"frontend request missing: {frontend_needle}"
        assert (method, route_path) in routes, f"route missing: {method} {route_path}"
