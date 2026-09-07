import asyncio
import threading

import httpx

from main import app
from modules.history.service import LocalMovieLibraryService
from modules.movies import local_library, router
from modules.movies.local_scrape_tasks import LocalScrapeTaskManager
from modules.movies.schemas import LocalLibraryInformationDownloadRequest


def test_information_jobs_return_before_work_finishes_and_keep_results(monkeypatch):
    manager = LocalScrapeTaskManager()
    monkeypatch.setattr(router, "local_scrape_task_manager", manager)

    async def exercise():
        release = asyncio.Event()
        checked = {"success": True, "fields": ["title"], "incomplete_count": 1,
                   "incomplete_records": [{"movie_id": "QA-001", "missing_fields": ["title"]}]}

        async def check(fields=None, refresh_files=False):
            assert list(fields) == ["title"] and refresh_files
            await release.wait()
            return checked

        async def download(request, progress_callback=None):
            assert request.movie_ids == ["QA-001"] and request.fields == ["title"]
            progress_callback({"phase": "download", "completed": 1, "total": 2, "message": "补全中"})
            await release.wait()
            return {"success": True, "updated_count": 1, "failed_count": 1, "information_check": checked}

        monkeypatch.setattr(local_library, "get_local_library_information_check", check)
        monkeypatch.setattr(local_library, "download_missing_local_library_information", download)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as client:
            for operation in ("check", "download"):
                release.clear()
                kwargs = {"params": {"fields": "title"}} if operation == "check" else {
                    "json": {"movie_ids": ["QA-001"], "fields": ["title"]}}
                response = await asyncio.wait_for(client.post(
                    f"/api/movies/local-library/information/{operation}/jobs", **kwargs), 1)
                assert response.status_code == 202
                task_id = response.json()["task_id"]
                url = f"/api/movies/local-library/information/jobs/{task_id}"
                await asyncio.sleep(0)
                task = (await client.get(url)).json()
                assert task["status"] == "running" and task["result"] is None
                if operation == "download":
                    assert task["percent"] == 50
                release.set()
                for _ in range(100):
                    task = (await client.get(url)).json()
                    if task["status"] != "running":
                        break
                    await asyncio.sleep(0.01)
                assert task["status"] == "success"
                assert task["result"] == ((await client.get(url)).json())["result"]
                if operation == "check":
                    assert task["result"] == checked
                else:
                    assert task["result"]["failed_count"] == 1
                    assert task["result"]["information_check"] == checked
            assert (await client.get("/api/movies/local-library/information/jobs/missing")).status_code == 404

    asyncio.run(exercise())


def test_information_check_job_records_failure(monkeypatch):
    manager = LocalScrapeTaskManager()

    async def fail(*args, **kwargs):
        raise OSError("检查失败")

    monkeypatch.setattr(local_library, "get_local_library_information_check", fail)

    async def exercise():
        task_id = manager.start_information_check_task(["nfo"])
        await asyncio.sleep(0)
        task = manager.get_task(task_id)
        assert task["status"] == "failed"
        assert task["message"] == "检查失败"
        assert task["finished_at"]

    asyncio.run(exercise())


def test_information_completion_reports_progress_and_probes_off_event_loop(tmp_path, monkeypatch):
    video = tmp_path / "QA-001.mp4"
    video.write_bytes(b"test")
    service = LocalMovieLibraryService(str(tmp_path / "library.json"))
    service._loaded = True
    service._cache = {"QA-001": {"movie_id": "QA-001", "scrape_status": "found",
        "metadata": {"id": "QA-001", "title": "Test"}, "files": [{"path": str(video)}]}}
    monkeypatch.setattr(local_library, "local_movie_library_service", service)
    event_loop_thread = threading.get_ident()
    probes = []

    def probe(path):
        assert threading.get_ident() != event_loop_thread
        probes.append(path)
        return {}

    monkeypatch.setattr(local_library, "_probe_video_metadata", probe)

    async def exercise():
        events = []
        result = await local_library.download_missing_local_library_information(
            LocalLibraryInformationDownloadRequest(movie_ids=["QA-001"], fields=["nfo"], download_images=False),
            progress_callback=events.append,
        )
        assert result["updated_count"] == 1 and result["failed_count"] == 0
        assert result["information_check"]["incomplete_count"] == 0
        assert probes == [video]
        assert events[-1]["completed"] == events[-1]["total"] == 1

    asyncio.run(exercise())
