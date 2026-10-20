"""Regressions across the actual user workflows from the September audit."""
import asyncio
import errno
import json
import subprocess
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from modules.movies import local_library, local_scrape
from modules.movies.schemas import LocalScrapeApplyRequest, LocalScrapePreviewRequest
from modules.common import runtime
from modules.movies import metadata_scrapers
from modules.javbus_api.parser import parse_movie_detail
from modules.magnets import service as magnets
from modules.automation.service import AutomationError, AutomationService
from modules.automation.schemas import AutomationTask, AutomationRun, AutomationTaskCreate
from modules.system import settings
from cilisousuo_cli import SearchResult
from modules.pikpak import service as pikpak
from modules.pikpak.schemas import DownloadRequest as PikRequest
from modules.pan115 import service as pan115
from modules.pan115.schemas import DownloadRequest as PanRequest
from modules.history.service import DownloadHistoryService
from modules.webdav.clients import WebDavClient, Aria2Client, WebDavFile
from modules.webdav.service import download_folder_recursive
from modules.movies.transcoding import TranscodingService, resolve_transcoding_options, TranscodingOptionsOverride
from modules.movies.transcoding_schemas import TranscodingTaskCreate
from modules.movies import workflows
from modules.movies.schemas import BatchMoviesRequest
from modules.javbus_api.parser import convert_magnets_html


def test_running_automation_cannot_be_deleted_and_lose_its_result(tmp_path):
    async def exercise():
        service = AutomationService(str(tmp_path / "tasks.json"), scheduler_enabled=False)
        task = await service.create_task(AutomationTaskCreate(name="QA", nodes=[
            {"id": kind, "type": kind} for kind in ("trigger", "search", "magnet", "download")]))
        service._running_task_ids.add(task.id)
        with pytest.raises(AutomationError, match="正在运行"):
            await service.delete_task(task.id)
        assert (await service.get_task(task.id)).id == task.id
        service._running_task_ids.clear()
        await service.delete_task(task.id)
        assert await service.list_tasks() == []
    asyncio.run(exercise())


def test_automation_errors_include_an_actionable_message():
    from fastapi import HTTPException
    from modules.automation.router import _raise_http_error

    with pytest.raises(HTTPException) as raised:
        _raise_http_error(AutomationError("task_already_running", "任务正在运行，请等待结束后删除"))
    assert raised.value.status_code == 400
    assert raised.value.detail == {"error": "task_already_running", "message": "任务正在运行，请等待结束后删除"}


def test_webdav_folder_dispatch_preserves_successes_and_continues_after_one_failure():
    files = [WebDavFile(name=f"{i}.mp4", path=f"/folder/{i}.mp4", is_directory=False, size=1) for i in range(3)]
    dav = SimpleNamespace(list_directory=lambda path: files, _build_download_url=lambda path: "https://example.test" + path,
                          build_aria2_options=lambda options: options)
    aria = SimpleNamespace(add_download=Mock(side_effect=["first", OSError("offline"), "last"]))
    result = download_folder_recursive(dav, aria, "/folder", "folder", False, 0)
    assert [item["success"] for item in result] == [True, False, True]
    assert result[1]["filename"] == "1.mp4"
    assert aria.add_download.call_count == 3


def test_remote_aria2_removal_never_attempts_local_control_file_deletion():
    client = Aria2Client("http://localhost:6800/jsonrpc")
    download = Mock()
    client.aria2 = SimpleNamespace(get_download=lambda gid: download, remove=Mock(return_value=[True]))
    assert client.remove_download("qa")
    client.aria2.remove.assert_called_once_with([download], clean=False)


@pytest.mark.parametrize("probe", [subprocess.TimeoutExpired("ffprobe", 5), OSError("offline volume"), SimpleNamespace(returncode=1, stdout=""), SimpleNamespace(returncode=0, stdout="not json")])
def test_cleanup_preserves_files_when_probe_is_inconclusive(tmp_path, monkeypatch, probe):
    video = tmp_path / "QA-001.mp4"
    video.write_bytes(b"original")
    library = SimpleNamespace(get_all=AsyncMock(return_value=[{"movie_id": "QA-001", "files": [{"path": str(video), "scan_root": str(tmp_path)}]}]), clean_file_records=AsyncMock(return_value={}))
    monkeypatch.setattr(local_library, "local_movie_library_service", library)
    monkeypatch.setattr(local_library.shutil, "which", lambda _: "ffprobe")
    monkeypatch.setattr(local_scrape.subprocess, "run", Mock(side_effect=probe) if isinstance(probe, Exception) else Mock(return_value=probe))
    result = asyncio.run(local_library.clean_invalid_local_library_files())
    assert video.read_bytes() == b"original"
    assert result["deleted_file_count"] == 0
    assert result["probe_failed_count"] == 1
    assert library.clean_file_records.call_args.args[0] == {}


def test_scrape_failed_cross_volume_copy_preserves_both_files(tmp_path, monkeypatch):
    source, target = tmp_path / "source.mp4", tmp_path / "target.mp4"
    source.write_bytes(b"new")
    target.write_bytes(b"old")
    monkeypatch.setattr(Path, "replace", Mock(side_effect=OSError(errno.EXDEV, "different volumes")))
    monkeypatch.setattr(local_scrape.shutil, "copy2", Mock(side_effect=OSError("disk full")))
    with pytest.raises(OSError):
        local_scrape._move_file(source, target, True)
    assert source.read_bytes() == b"new"
    assert target.read_bytes() == b"old"
    assert sorted(path.name for path in tmp_path.iterdir()) == ["source.mp4", "target.mp4"]


@pytest.mark.parametrize("strategy", ["keep_target", "skip", None])
def test_asset_overwrite_never_overrides_video_conflict_choice(tmp_path, monkeypatch, strategy):
    source, target = tmp_path / "QA-001.mp4", tmp_path / "out" / "QA-001.mp4"
    source.write_bytes(b"new")
    target.parent.mkdir()
    target.write_bytes(b"old")
    monkeypatch.setattr(local_scrape, "_build_library_record_for_applied_video", lambda *args: None)
    request = LocalScrapeApplyRequest(items=[{"source_path": str(source), "code": "QA-001", "conflict_resolution": strategy}], target_directory=str(target.parent), folder_template="", naming_template="{code}", overwrite_existing=True, write_nfo=False, download_images=False)
    result = asyncio.run(local_scrape.apply_local_scrape(request))
    assert target.read_bytes() == b"old"
    assert source.read_bytes() == b"new"
    assert result["results"][0].get("error") == ("conflict_resolution_required" if strategy is None else None)


def test_apply_subset_preserves_preview_destination_and_rejects_outside_path(tmp_path, monkeypatch):
    incoming = tmp_path / "incoming"
    incoming.mkdir()
    for name, content in [("ABP-123-a.mp4", b"small"), ("ABP-123-b.mp4", b"larger")]:
        (incoming / name).write_bytes(content)
    monkeypatch.setattr(local_scrape, "_probe_video_metadata", lambda _: {})
    monkeypatch.setattr(local_scrape, "_build_library_record_for_applied_video", lambda *args: None)
    options = dict(target_directory=str(tmp_path / "out"), naming_template="{code}", folder_template="{code}", write_nfo=False, download_images=False)
    preview = asyncio.run(local_scrape.preview_local_scrape(LocalScrapePreviewRequest(directory=str(incoming), scrape=False, **options)))
    chosen = preview["items"][1]
    assert Path(chosen["target_video_path"]).name == "ABP-123-2.mp4"
    item = {key: chosen[key] for key in ["source_path", "code", "metadata", "target_video_path"]}
    request = LocalScrapeApplyRequest(items=[item], **options)
    result = asyncio.run(local_scrape.apply_local_scrape(request))
    assert result["results"][0]["target_video_path"] == chosen["target_video_path"]
    assert Path(chosen["target_video_path"]).read_bytes() == b"larger"
    item = {**preview["items"][0], "target_video_path": str(tmp_path / "outside.mp4")}
    result = asyncio.run(local_scrape.apply_local_scrape(LocalScrapeApplyRequest(items=[item], **options)))
    assert not result["success"]
    assert Path(item["source_path"]).exists()
    assert not (tmp_path / "outside.mp4").exists()


def test_nfo_overwrite_option_protects_existing_user_metadata(tmp_path, monkeypatch):
    source = tmp_path / "QA-001.mp4"
    source.write_bytes(b"video")
    nfo = source.with_suffix(".nfo")
    nfo.write_bytes(b"user metadata")
    monkeypatch.setattr(local_scrape, "_probe_video_metadata", lambda _: {})
    monkeypatch.setattr(local_scrape, "_build_library_record_for_applied_video", lambda *args: None)
    request = LocalScrapeApplyRequest(items=[{"source_path": str(source), "code": "QA-001"}], organize=False, overwrite_existing=False, write_nfo=True, download_images=False)
    assert asyncio.run(local_scrape.apply_local_scrape(request))["success"]
    assert nfo.read_bytes() == b"user metadata"
    request.overwrite_existing = True
    assert asyncio.run(local_scrape.apply_local_scrape(request))["success"]
    assert b"<movie>" in nfo.read_bytes()


def test_scraper_apply_response_uses_the_public_config_contract(monkeypatch):
    secret = "fixture-api-key"
    monkeypatch.setattr(runtime, "config", runtime.merge_config(runtime.DEFAULT_CONFIG, {"scrapers": {"javstash": {"api_key": secret}}}))
    monkeypatch.setattr(runtime, "update_config_section", Mock())
    result = metadata_scrapers.apply_metadata_scraper_test_results([{"provider": "javstash", "success": True}])
    assert secret not in json.dumps(result)
    assert result["scrapers"]["javstash"]["has_api_key"] is True


def test_scraper_falls_back_from_incomplete_detail_and_test_rejects_it(monkeypatch):
    monkeypatch.setattr(runtime, "get_scrapers_config", lambda: {"priority": ["javbus", "r18dev"], "javbus": {"enabled": True}, "r18dev": {"enabled": True}})
    monkeypatch.setattr(metadata_scrapers.javbus_api_service, "get_movie_detail", AsyncMock(return_value={"id": "QA-001", "title": ""}))
    fallback = AsyncMock(return_value={"id": "QA-001", "title": "Real fixture"})
    monkeypatch.setattr(metadata_scrapers, "fetch_r18dev_movie_detail", fallback)
    result = asyncio.run(metadata_scrapers.metadata_scraper_service.get_movie_detail("QA-001"))
    assert result["source"] == "r18dev"
    assert not asyncio.run(metadata_scrapers.test_metadata_scraper_provider("javbus", "QA-001", {}))["success"]
    with pytest.raises(ValueError):
        parse_movie_detail("<html>Please verify</html>", "https://example.test", "QA-001")


def test_javbus_scraper_settings_have_one_effective_source(monkeypatch):
    monkeypatch.setattr(runtime, "config", runtime.merge_config(runtime.DEFAULT_CONFIG, {"javbus": {"base_url": "https://example.test"}, "scrapers": {"javbus": {"base_url": "https://stale.test", "language": "en"}}}))
    public = settings.build_settings_payload()
    assert public["scrapers"]["javbus"].get("uses_shared_config") is True
    assert "base_url" not in public["scrapers"]["javbus"]
    assert "language" not in public["scrapers"]["javbus"]
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        settings.validate_scrapers_settings({"javbus": {"base_url": "https://ignored.test"}})


@pytest.mark.parametrize("found_magnet", [True, False])
def test_automation_javbus_completes_detail_before_selection(monkeypatch, found_magnet):
    service = AutomationService(scheduler_enabled=False)
    task = AutomationTask(id="fixture", name="fixture", created_at="2026-09-07", updated_at="2026-09-07", nodes=[{"id": kind, "type": kind, "config": config} for kind, config in [("search", {"mode": "codes", "codes": "QA-001"}), ("magnet", {"source": "javbus"}), ("download", {"tool": "aria2"})]])
    monkeypatch.setattr(service, "_movie_exists", AsyncMock(return_value=False))
    monkeypatch.setattr(magnets, "_history_excluded_magnet_links", AsyncMock(return_value=[]))
    detail = AsyncMock(return_value={"id": "QA-001", "gid": "1", "uc": "0"})
    monkeypatch.setattr(magnets, "get_movie_detail", detail)
    monkeypatch.setattr(magnets.javbus_api_service, "get_movie_magnets", AsyncMock(return_value=[{"title": "QA-001", "link": "magnet:fixture", "size": "1 GB"}] if found_magnet else []))
    monkeypatch.setattr(runtime, "get_magnet_health_config", lambda: {"enabled": False})
    dispatch = AsyncMock(return_value=[{"success": True}])
    monkeypatch.setattr(service, "_dispatch_downloads", dispatch)
    run = asyncio.run(service._execute_task(task, AutomationRun(id="r", task_id=task.id, started_at="2026-09-07", status="running")))
    assert detail.await_count == 1
    assert run.status == ("success" if found_magnet else "noop")
    assert dispatch.await_count == int(found_magnet)


def test_cilisousuo_excluding_all_4k_results_never_falls_back(monkeypatch):
    candidate = SearchResult(title="QA-001 4K", filename="QA-001-2160p.mp4", size="10 GB", detail_url="", detail_path="", magnet="magnet:fixture")
    monkeypatch.setattr(magnets, "search_cilisousuo", AsyncMock(return_value=[candidate]))
    monkeypatch.setattr(runtime, "get_magnet_health_config", lambda: {"enabled": False})
    assert asyncio.run(magnets.get_cilisousuo_best_magnet_payload("QA-001", exclude_4k=True)) is None


def test_failed_dispatch_survives_reload_and_can_retry_the_same_resource(tmp_path, monkeypatch):
    history = DownloadHistoryService(str(tmp_path / "history.json"))
    monkeypatch.setattr(pikpak, "download_history_service", history)
    monkeypatch.setattr(pikpak, "resolve_credentials", lambda *args: SimpleNamespace(username="fixture", password="fixture"))
    offline = AsyncMock(side_effect=RuntimeError("fixture"))
    monkeypatch.setattr(pikpak, "PikPakApi", lambda **kwargs: SimpleNamespace(login=AsyncMock(), offline_download=offline))
    monkeypatch.setattr(pikpak.local_movie_library_service, "is_movie_present", AsyncMock(return_value=False))
    monkeypatch.setattr(metadata_scrapers.javbus_api_service, "get_movie_detail", AsyncMock(return_value={"id": "QA-001", "title": "Fixture"}))
    request = PikRequest(magnet_links=["magnet:fixture"], movie_ids=["QA-001"], magnet_sources=["javbus"])
    async def exercise():
        result = await pikpak.download(request)
        assert result["results"][0]["movie_id"] == "QA-001"
        reloaded = DownloadHistoryService(history.file_path)
        record = (await reloaded.get_history())[0]
        assert record["status"] == "failed"
        assert record["failed_resources"][0]["link"] == "magnet:fixture"
        assert not await reloaded.is_magnet_downloaded("QA-001", "magnet:fixture")
        offline.side_effect = None
        offline.return_value = {"task": {"id": "remote-task"}}
        assert (await pikpak.download(request))["results"][0]["success"]
        assert not (await history.get_history())[0]["failed_resources"]
        assert await history.is_magnet_downloaded("QA-001", "magnet:fixture")
    asyncio.run(exercise())


def test_115_partial_batches_keep_success_history_and_report_every_input(monkeypatch):
    monkeypatch.setattr(pan115, "_resolve_credentials", lambda _: ("fixture", "0", 1, 0, 0, []))
    monkeypatch.setattr(pan115, "Pan115Client", lambda _: object())
    monkeypatch.setattr(pan115.local_movie_library_service, "is_movie_present", AsyncMock(return_value=False))
    monkeypatch.setattr(pan115.download_history_service, "is_magnet_downloaded", AsyncMock(return_value=False))
    save = AsyncMock()
    monkeypatch.setattr(pan115.download_history_service, "record_dispatch_results", save)
    chunks = AsyncMock(side_effect=[[{"success": True}], pan115.Pan115Error("fixture_failure", "fixture failure")])
    monkeypatch.setattr(pan115, "_dispatch_chunk_with_retries", chunks)
    result = asyncio.run(pan115.download(PanRequest(magnet_links=["magnet:a", "magnet:b"], movie_ids=["QA-001", "QA-002"])))
    assert result["success_count"] == 1
    assert result["failed_count"] == 1
    assert [item["movie_id"] for item in result["results"]] == ["QA-001", "QA-002"]
    assert [item["magnet"] for item in result["results"]] == ["magnet:a", "magnet:b"]
    recorded = [item for call in save.await_args_list for item in call.args[0]]
    assert all(call.args[1] == "pan115" for call in save.await_args_list)
    assert [item["movie_id"] for item in recorded if item.get("success")] == ["QA-001"]
    assert [item["movie_id"] for item in recorded if not item.get("success")] == ["QA-002"]


def test_webdav_keeps_service_root_and_resolves_absolute_and_relative_hrefs(monkeypatch):
    client = WebDavClient("https://example.test/dav/root", "user", "password")
    request = Mock(return_value=SimpleNamespace(raise_for_status=lambda: None))
    monkeypatch.setattr(client.session, "request", request)
    for href, expected in [("/", "/dav/root/"), ("/dav/root/folder/", "/dav/root/folder/"), ("folder/", "/dav/root/folder/")]:
        client._make_request("PROPFIND", href)
        assert request.call_args.args[1] == "https://example.test" + expected
    assert client._build_download_url("movie.mp4") == "https://example.test/dav/root/movie.mp4"
    assert "password" not in client._build_download_url("movie.mp4")
    client.close()


@pytest.mark.parametrize("url", ["https://example.test/aria2/jsonrpc", "https://example.test", "http://localhost:6800/jsonrpc"])
def test_aria2_preserves_rpc_endpoint(url):
    client = Aria2Client(url)
    assert client.aria2.client.server == (url + "/jsonrpc" if url == "https://example.test" else url)


def test_recursive_size_filter_does_not_depend_on_video_only(monkeypatch):
    entry = WebDavFile(name="small.mp4", path="/small.mp4", is_directory=False, size=1024)
    dav = SimpleNamespace(list_directory=lambda _: [entry], _build_download_url=lambda path: path, build_aria2_options=lambda options: options)
    aria = SimpleNamespace(add_download=Mock())
    result = download_folder_recursive(dav, aria, "/", "folder", False, 500)
    assert result[0]["skipped"] and aria.add_download.call_count == 0
    client = SimpleNamespace(resolve_direct_download=AsyncMock())
    downloads, skipped = asyncio.run(pan115._resolve_download_entries(client, [{"name": "small.mp4", "size": 1024, "pick_code": "fixture"}], False, 500))
    assert not downloads and len(skipped) == 1
    assert client.resolve_direct_download.await_count == 0


@pytest.mark.parametrize('provider', ['webdav', 'pan115'])
def test_selected_folders_recurse_and_filter_each_file_with_a_fractional_minimum(provider):
    from modules.webdav.schemas import AddDownloadsRequest
    request = AddDownloadsRequest(files=[{'name': 'root', 'path': '/root', 'is_directory': True}], video_filter=True, min_file_size_mb=1.25)
    boundary = int(1.25 * 1024 ** 2)
    def entry(name, path, size=0, folder=False):
        return {'name': name, 'path': path, 'size': size, 'is_directory': folder, 'pick_code': name}
    tree = {
        '/root': [entry('child', '/root/child', folder=True), entry('small.mp4', '/small', boundary - 1), entry('large.txt', '/text', boundary + 1)],
        '/root/child': [entry('deep', '/root/child/deep', folder=True)],
        '/root/child/deep': [entry('exact.mp4', '/exact', boundary), entry('larger.MKV', '/larger', boundary + 1)],
    }
    if provider == 'webdav':
        dav = SimpleNamespace(list_directory=Mock(side_effect=lambda path: [WebDavFile(**{key: value for key, value in item.items() if key != 'pick_code'}) for item in tree[path]]),
            _build_download_url=lambda path: 'https://dav.test' + path, build_aria2_options=lambda options: options)
        aria = SimpleNamespace(add_download=Mock(return_value='gid'))
        results = download_folder_recursive(dav, aria, '/root', 'root', request.video_filter, request.min_file_size_mb)
        assert {row['filename'] for row in results if row.get('success')} == {'exact.mp4', 'larger.MKV'}
        assert aria.add_download.call_count == 2
        assert dav.list_directory.call_count == 3
    else:
        client = SimpleNamespace(list_directory_all=AsyncMock(side_effect=lambda path: {'items': [{**item, 'id': item['path'], 'kind': 'folder' if item['is_directory'] else 'file'} for item in tree[path]]}),
            resolve_direct_download=AsyncMock(side_effect=lambda code, **values: SimpleNamespace(name=values['fallback_name'])))
        downloads, skipped = asyncio.run(pan115._resolve_download_entries(client, request.files, request.video_filter, request.min_file_size_mb))
        assert {item.name for item in downloads} == {'exact.mp4', 'larger.MKV'}
        assert len(skipped) == 2 and client.resolve_direct_download.await_count == 2
        assert client.list_directory_all.await_count == 3


@pytest.mark.parametrize('empty_size', ['', None, 0])
def test_pan115_folder_listing_can_be_submitted_to_the_download_api(empty_size):
    from modules.webdav.schemas import AddDownloadsRequest
    folder = pan115._normalize_directory_payload({'data': [{'cid': 'folder', 'fc': '0', 'n': 'folder', 's': empty_size}]})['items'][0]
    assert folder['size'] == 0
    payload = AddDownloadsRequest(files=[{**folder, 'path': folder['id'], 'is_directory': True, 'source_type': 'pan115'}], min_file_size_mb=1536)
    assert payload.files[0].size == 0 and payload.files[0].is_directory


@pytest.mark.parametrize('minimum', [-1, float('nan'), float('inf')])
def test_file_download_minimum_rejects_negative_or_nonfinite_values(minimum):
    from modules.webdav.schemas import AddDownloadsRequest
    with pytest.raises(ValueError):
        AddDownloadsRequest(min_file_size_mb=minimum)


def test_explicit_empty_transcode_height_clears_the_preset_limit():
    assert resolve_transcoding_options("compatible_1080p").max_height == 1080
    assert resolve_transcoding_options("compatible_1080p", TranscodingOptionsOverride(max_height=None)).max_height is None


@pytest.mark.parametrize("output_media", [{}, {"codec": "hevc", "width": 1920, "height": 1080, "duration_seconds": 10}, {"codec": "hevc", "width": 1920, "height": 1080, "duration_seconds": 100}])
def test_transcode_validates_temporary_media_before_replacing_source(tmp_path, output_media):
    source = tmp_path / "QA-001.mp4"
    source.write_bytes(b"original media content")
    library = SimpleNamespace(get_status=AsyncMock(return_value={"exists": True, "record": {"files": [{"path": str(source)}]}}), update_file_after_transcode=AsyncMock())
    async def executor(task, original, temporary, progress, cancel):
        temporary.write_bytes(b"encoded")
    async def exercise():
        service = TranscodingService(storage_path=tmp_path / "tasks.json", library_service=library, executor=executor, require_binaries=False)
        async def probe(path):
            return {"codec": "h264", "width": 1920, "height": 1080, "duration_seconds": 100} if path == source else output_media
        service._probe_media = probe
        await service.startup()
        try:
            task = await service.create_task(TranscodingTaskCreate(movie_id="QA-001"))
            async def terminal():
                while True:
                    result = await service.get_task(task.id)
                    if result.status in {"completed", "failed"}:
                        return result
                    await asyncio.sleep(0.01)
            return await asyncio.wait_for(terminal(), 2)
        finally:
            await service.shutdown()
    result = asyncio.run(exercise())
    valid = output_media.get("duration_seconds") == 100
    assert result.status == ("completed" if valid else "failed")
    assert source.read_bytes() == (b"encoded" if valid else b"original media content")
    assert library.update_file_after_transcode.await_count == int(valid)


def test_frontend_dispatch_fixture_matches_real_backend_contract(monkeypatch):
    expected = json.loads((Path(__file__).parent / "fixtures" / "dispatch-contract.json").read_text(encoding="utf-8"))
    rows = convert_magnets_html('<table><tr><td><a href="magnet:?xt=urn:btih:ABC123">QA-001 fixture</a></td><td><a>1 GB</a></td><td><a>2026-01-01</a></td></tr></table>')
    monkeypatch.setattr(magnets, "get_movie_detail", AsyncMock(return_value={"id": "QA-001", "title": "Fixture movie", "gid": "1", "uc": "0"}))
    monkeypatch.setattr(magnets.javbus_api_service, "get_movie_magnets", AsyncMock(return_value=rows))
    monkeypatch.setattr(magnets.local_movie_library_service, "is_movie_present", AsyncMock(return_value=False))
    monkeypatch.setattr(runtime, "get_magnet_health_config", lambda: {"enabled": False})
    batch = asyncio.run(workflows.get_batch_movies_payload(BatchMoviesRequest(movie_ids=["QA-001"])))
    assert {"magnets": rows, "batch": batch} == expected


def test_dismissing_one_failure_preserves_other_history(tmp_path):
    history = DownloadHistoryService(str(tmp_path / "history.json"))
    async def exercise():
        await history.record_dispatch_results([{"movie_id": "QA-001", "magnet": "magnet:a", "success": False}, {"movie_id": "QA-001", "magnet": "magnet:b", "success": False}], "pikpak")
        await history.dismiss_failure("QA-001", "magnet:a")
        record = (await DownloadHistoryService(history.file_path).get_history())[0]
        assert [item["link"] for item in record["failed_resources"]] == ["magnet:b"]
        await history.dismiss_failure("QA-001", "magnet:b")
        assert not await history.is_movie_downloaded("QA-001")
    asyncio.run(exercise())


def test_background_automation_exposes_progress_and_has_one_final_record(tmp_path, monkeypatch):
    async def exercise():
        service = AutomationService(storage_path=str(tmp_path / "tasks.json"), scheduler_enabled=False)
        task = await service.create_task(AutomationTaskCreate(name="fixture", nodes=[{"id": kind, "type": kind} for kind in ["trigger", "search", "magnet", "download"]]))
        release = asyncio.Event()
        async def execute(_task, run, manual=False):
            run.found_count = 1
            run.message = "fixture progress"
            await release.wait()
            run.status = "noop"
            run.finished_at = service._now()
            return run
        monkeypatch.setattr(service, "_execute_task", execute)
        run = await service.run_task(task.id, manual=True, background=True)
        assert run.status == "running"
        await asyncio.sleep(0)
        current = (await service.list_tasks())[0].runs[0]
        assert current.found_count == 1 and current.message == "fixture progress"
        with pytest.raises(Exception, match="正在运行"):
            await service.run_task(task.id, background=True)
        release.set()
        async def finished():
            while (await service.list_runs(task.id))[0].status == "running":
                await asyncio.sleep(0.01)
        await asyncio.wait_for(finished(), 2)
        assert len(await service.list_runs(task.id)) == 1
        await service.shutdown()
    asyncio.run(exercise())


def test_restart_marks_interrupted_automation_for_user_review(tmp_path):
    task = AutomationTask(id="fixture", name="fixture", created_at="2026-09-07", updated_at="2026-09-07", runs=[AutomationRun(id="run", task_id="fixture", status="running", started_at="2026-09-07")])
    path = tmp_path / "tasks.json"
    path.write_text(json.dumps({"tasks": [task.model_dump()]}), encoding="utf-8")
    async def exercise():
        service = AutomationService(storage_path=str(path), scheduler_enabled=False)
        await service.startup()
        try:
            run = (await service.list_runs(task.id))[0]
            assert run.status == "failed"
            assert "历史" in run.error
        finally:
            await service.shutdown()
    asyncio.run(exercise())

def test_pan115_failed_job_returns_retryable_items_without_raw_exception(monkeypatch):
    async def exercise():
        manager = pan115.Pan115DownloadJobManager()
        monkeypatch.setattr(pan115, 'download', AsyncMock(side_effect=RuntimeError('secret=fixture-private')))
        job = manager.submit(PanRequest(magnet_links=['magnet:pending'], movie_ids=['QA-001'], magnet_sources=['javbus']))
        await asyncio.sleep(0)
        result = manager.get(job['job_id'])
        assert 'fixture-private' not in json.dumps(result)
        assert result['result']['results'][0]['magnet'] == 'magnet:pending'
        assert result['result']['results'][0]['movie_id'] == 'QA-001'
        assert (await pan115.download_history_service.get_history())[0]['failed_resources'][0]['link'] == 'magnet:pending'
    asyncio.run(exercise())

@pytest.mark.parametrize('during_probe', ['replace', 'unavailable'])
def test_cleanup_preserves_changed_or_inaccessible_file_and_still_syncs_index(tmp_path, monkeypatch, during_probe):
    video = tmp_path / 'QA-001.mp4'
    video.write_bytes(b'original')
    library = SimpleNamespace(get_all=AsyncMock(return_value=[{'movie_id': 'QA-001', 'files': [{'path': str(video), 'scan_root': str(tmp_path)}]}]), clean_file_records=AsyncMock(return_value={}))
    monkeypatch.setattr(local_library, 'local_movie_library_service', library)
    monkeypatch.setattr(local_library.shutil, 'which', lambda _: 'ffprobe')
    stat = Path.stat
    def probe(path):
        if during_probe == 'replace':
            path.write_bytes(b'new valid movie after probe')
            return {'probe_status': 'no_video'}
        def unavailable(self, *args, **kwargs):
            if self == video:
                raise OSError('offline volume')
            return stat(self, *args, **kwargs)
        monkeypatch.setattr(Path, 'stat', unavailable)
        return {}
    monkeypatch.setattr(local_library, '_probe_video_metadata', probe)
    result = asyncio.run(local_library.clean_invalid_local_library_files())
    assert result['deleted_file_count'] == 0
    assert library.clean_file_records.call_args.args[0] == {}
    assert video.read_bytes()


def test_automation_reports_all_dispatch_skips_as_no_new_download(tmp_path, monkeypatch):
    async def exercise():
        service = AutomationService(storage_path=str(tmp_path / 'auto.json'), scheduler_enabled=False)
        task = await service.create_task(AutomationTaskCreate(name='fixture', nodes=[{'id': kind, 'type': kind} for kind in ['trigger', 'search', 'magnet', 'download']]))
        monkeypatch.setattr(service, '_search_movies', AsyncMock(return_value=[{'id': 'QA-001'}]))
        monkeypatch.setattr(service, '_movie_exists', AsyncMock(return_value=False))
        monkeypatch.setattr('modules.automation.service.get_best_magnet_payload', AsyncMock(return_value={'link': 'magnet:fixture'}))
        monkeypatch.setattr(service, '_dispatch_downloads', AsyncMock(return_value=[{'success': False, 'skipped': True, 'reason': 'magnet_already_tried'}]))
        run = await service.run_task(task.id)
        assert run.status == 'noop' and run.dispatched_count == 0 and run.skipped_count == 1
        assert run.items[0].status == 'skipped'
    asyncio.run(exercise())

def test_dismissing_a_nonexistent_failure_does_not_reclassify_legacy_history(tmp_path):
    history = DownloadHistoryService(str(tmp_path / 'history.json'))
    history._loaded = True
    history._cache = {'QA-001': {'movie_id': 'QA-001', 'download_time': '2026-09-07'}}
    async def exercise():
        await history.dismiss_failure('QA-001', 'magnet:not-failed')
        assert await history.is_movie_downloaded('QA-001')
    asyncio.run(exercise())
