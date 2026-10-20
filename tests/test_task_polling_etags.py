import asyncio
import json
import threading
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI

from modules.automation import router as automation_router
from modules.automation import service as automation_module
from modules.automation.schemas import AutomationTask, AutomationTaskCreate, AutomationTaskUpdate
from modules.automation.service import AutomationService
from modules.movies import router as movies_router
from modules.movies import transcoding
from modules.movies.transcoding import TranscodingService, resolve_transcoding_options
from modules.movies.transcoding_schemas import TranscodingTask, TranscodingTaskCreate


TRANSCODES = "/api/movies/transcoding/tasks"
AUTOMATIONS = "/api/automation/tasks"


def transcode_task(tmp_path, task_id="fixture"):
    return TranscodingTask(
        id=task_id, movie_id="QA-001", file_index=0,
        source_path=str(tmp_path / f"{task_id}.mkv"), file_name=f"{task_id}.mkv",
        preset_id="quality_h265", preset_name="QA", options=resolve_transcoding_options("quality_h265"),
        created_at="2026-10-20", status="queued", input_size=10,
    )


def automation_payload(name="QA"):
    return AutomationTaskCreate(name=name, nodes=[
        {"id": kind, "type": kind} for kind in ("trigger", "search", "magnet", "download")
    ])


def client_for(monkeypatch, service):
    app = FastAPI()
    if isinstance(service, TranscodingService):
        monkeypatch.setattr(movies_router, "transcoding_service", service)
        app.include_router(movies_router.router)
    else:
        monkeypatch.setattr(automation_router, "automation_service", service)
        app.include_router(automation_router.router)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


def seeded_transcodes(tmp_path):
    service = TranscodingService(storage_path=tmp_path / "transcodes.json", require_binaries=False)
    service._loaded = service._started = True
    return service


@pytest.mark.parametrize("kind", ["transcoding", "automation"])
def test_unchanged_task_poll_has_empty_304_and_never_walks_or_copies_models(tmp_path, monkeypatch, kind):
    async def check():
        if kind == "transcoding":
            service = seeded_transcodes(tmp_path)
            service._tasks = {str(i): transcode_task(tmp_path, str(i)) for i in range(1000)}
            path = TRANSCODES
        else:
            path = AUTOMATIONS
            service = AutomationService(str(tmp_path / "automation.json"), scheduler_enabled=False)
            tasks = [AutomationTask(id=str(i), name="QA", created_at="2026-10-20", updated_at="2026-10-20") for i in range(1000)]
            service.storage_path.write_text(json.dumps({"tasks": [task.model_dump() for task in tasks]}))
        async with client_for(monkeypatch, service) as client:
            first = await client.get(path)
            assert first.status_code == 200
            tag = first.headers.get("etag")
            assert tag, "task collections must return an ETag for conditional polling"
            assert first.headers["cache-control"] == "no-cache"

            def no_model_work(*args, **kwargs):
                raise AssertionError("unchanged conditional polling traversed task models")

            class NoIteration(list):
                __iter__ = no_model_work

            class NoValues(dict):
                values = no_model_work

            with monkeypatch.context() as guarded:
                guarded.setattr(TranscodingTask, "model_dump", no_model_work)
                guarded.setattr(AutomationTask, "model_copy", no_model_work)
                guarded.setattr(AutomationTask, "model_dump", no_model_work)
                if kind == "transcoding":
                    guarded.setattr(service, "_tasks", NoValues(service._tasks))
                else:
                    guarded.setattr(service, "_cached_tasks", NoIteration(service._cached_tasks))
                    stats = []
                    loop_thread = threading.get_ident()
                    stat = Path.stat

                    def checked_stat(target, *args, **kwargs):
                        if target == service.storage_path:
                            assert threading.get_ident() != loop_thread
                            stats.append(target)
                        return stat(target, *args, **kwargs)

                    guarded.setattr(Path, "stat", checked_stat)
                for match in (tag, f"W/{tag}", f'"other", W/{tag}', "*"):
                    response = await client.get(path, headers={"If-None-Match": match})
                    assert response.status_code == 304
                    assert response.content == b""
                    assert response.headers["etag"] == tag
                    assert response.headers["cache-control"] == "no-cache"
                if kind == "automation":
                    assert len(stats) == 4, "each matching poll performs only one off-loop stat"
            unconditional = await client.get(path)
            assert unconditional.status_code == 200
            assert unconditional.json() == first.json(), "unconditional GET keeps its original body"
            assert (await client.get(path, headers={"If-None-Match": '"old"'})).status_code == 200

    asyncio.run(check())


def test_transcoding_create_cancel_delete_and_new_instance_invalidate_old_tags(tmp_path, monkeypatch):
    async def check():
        source = tmp_path / "video.mkv"
        source.write_bytes(b"0123456789")
        service = seeded_transcodes(tmp_path)
        service.library_service = SimpleNamespace(get_status=AsyncMock(return_value={"record": {"files": [{"path": str(source)}]}}))
        async with client_for(monkeypatch, service) as client:
            first = await client.get(TRANSCODES)
            tag = first.headers["etag"]
            task = await service.create_task(TranscodingTaskCreate(movie_id="QA-001"))
            created = await client.get(TRANSCODES, headers={"If-None-Match": tag})
            assert created.status_code == 200 and created.json()["tasks"][0]["id"] == task.id
            tag = created.headers["etag"]
            await service.cancel_task(task.id)
            cancelled = await client.get(TRANSCODES, headers={"If-None-Match": tag})
            assert cancelled.status_code == 200 and cancelled.json()["tasks"][0]["status"] == "cancelled"
            tag = cancelled.headers["etag"]
            await service.delete_task(task.id)
            deleted = await client.get(TRANSCODES, headers={"If-None-Match": tag})
            assert deleted.status_code == 200 and deleted.json()["tasks"] == []
        fresh = seeded_transcodes(tmp_path)
        async with client_for(monkeypatch, fresh) as client:
            restarted = await client.get(TRANSCODES, headers={"If-None-Match": deleted.headers["etag"]})
            assert restarted.status_code == 200
            assert restarted.headers["etag"] != deleted.headers["etag"]

    asyncio.run(check())


def test_transcoding_progress_invalidates_before_next_disk_checkpoint(tmp_path, monkeypatch):
    async def check():
        now = [100.0]
        monkeypatch.setattr(transcoding, "time", SimpleNamespace(monotonic=lambda: now[0]))
        first_progress, next_progress = asyncio.Event(), asyncio.Event()
        continue_progress, finish = asyncio.Event(), asyncio.Event()

        async def execute(task, source, temporary, progress, cancelled):
            await progress({"progress": 10})
            first_progress.set()
            await continue_progress.wait()
            now[0] += 1
            await progress({"progress": 20, "speed": "2x", "fps": 45})
            next_progress.set()
            await finish.wait()
            raise RuntimeError("QA stopped")

        service = seeded_transcodes(tmp_path)
        service.executor = execute
        service._probe_media = AsyncMock(return_value={"codec": "h264", "width": 1920, "height": 1080, "duration_seconds": 10})
        task = transcode_task(tmp_path)
        Path(task.source_path).write_bytes(b"0123456789")
        service._tasks[task.id] = task
        running = asyncio.create_task(service._run_task(task.id))
        try:
            await asyncio.wait_for(first_progress.wait(), 2)
            async with client_for(monkeypatch, service) as client:
                first = await client.get(TRANSCODES)
                tag = first.headers["etag"]
                continue_progress.set()
                await asyncio.wait_for(next_progress.wait(), 2)
                second = await client.get(TRANSCODES, headers={"If-None-Match": tag})
                assert second.status_code == 200
                assert second.json()["tasks"][0]["progress"] == 20
                assert second.headers["etag"] != tag
                persisted = json.loads(service.storage_path.read_text())
                assert persisted["tasks"][0]["progress"] == 10, "the second progress update is deliberately not checkpointed"
                finish.set()
                await running
                failed = await client.get(TRANSCODES, headers={"If-None-Match": second.headers["etag"]})
                assert failed.status_code == 200 and failed.json()["tasks"][0]["status"] == "failed"
        finally:
            continue_progress.set()
            finish.set()
            await running

    asyncio.run(check())


def test_automation_live_counts_messages_items_and_completion_invalidate_without_disk_saves(tmp_path, monkeypatch):
    async def check():
        service = AutomationService(str(tmp_path / "automation.json"), scheduler_enabled=False)
        task = await service.create_task(automation_payload())
        entered = [asyncio.Event() for _ in range(4)]
        release = [asyncio.Event() for _ in range(4)]

        async def search(config):
            entered[0].set()
            await release[0].wait()
            return [{"id": f"QA-00{i}"} for i in range(1, 4)]

        async def exists(movie_id):
            if movie_id == "QA-001":
                entered[1].set()
                await release[1].wait()
                return True
            return False

        async def magnet(movie_id, **kwargs):
            if movie_id == "QA-002":
                entered[2].set()
                await release[2].wait()
                return None
            return {"link": "magnet:QA"}

        async def dispatch(config, prepared):
            entered[3].set()
            await release[3].wait()
            return [{"success": True}]

        monkeypatch.setattr(service, "_search_movies", search)
        monkeypatch.setattr(service, "_movie_exists", exists)
        monkeypatch.setattr(automation_module, "get_best_magnet_payload", magnet)
        monkeypatch.setattr(service, "_dispatch_downloads", dispatch)
        await service.run_task(task.id, background=True)
        try:
            async with client_for(monkeypatch, service) as client:
                await asyncio.wait_for(entered[0].wait(), 2)
                initial = await client.get(AUTOMATIONS)
                tag = initial.headers["etag"]
                disk_before = service.storage_path.read_bytes()
                for step in range(1, 4):
                    release[step - 1].set()
                    await asyncio.wait_for(entered[step].wait(), 2)
                    response = await client.get(AUTOMATIONS, headers={"If-None-Match": tag})
                    assert response.status_code == 200
                    assert response.headers["etag"] != tag
                    run = response.json()["tasks"][0]["runs"][0]
                    assert run["found_count"] == 3
                    assert run["skipped_count"] == step - 1
                    assert len(run["items"]) == step - 1
                    if step == 3:
                        assert run["magnet_count"] == 1 and "提交" in run["message"]
                    else:
                        assert f"{step}/3" in run["message"]
                    assert service.storage_path.read_bytes() == disk_before
                    assert (await client.get(AUTOMATIONS, headers={"If-None-Match": response.headers["etag"]})).status_code == 304
                    tag = response.headers["etag"]
                release[3].set()
                await asyncio.gather(*service._executions)
                completed = await client.get(AUTOMATIONS, headers={"If-None-Match": tag})
                assert completed.status_code == 200
                run = completed.json()["tasks"][0]["runs"][0]
                assert run["status"] == "partial" and run["dispatched_count"] == 1 and len(run["items"]) == 3
        finally:
            for event in release:
                event.set()
            await service.shutdown()

    asyncio.run(check())


def test_automation_crud_external_replace_delete_recreate_and_restart_change_tags(tmp_path, monkeypatch):
    async def check():
        service = AutomationService(str(tmp_path / "automation.json"), scheduler_enabled=False)
        async with client_for(monkeypatch, service) as client:
            initial = await client.get(AUTOMATIONS)
            tag = initial.headers["etag"]
            task = await service.create_task(automation_payload())
            created = await client.get(AUTOMATIONS, headers={"If-None-Match": tag})
            assert created.status_code == 200 and len(created.json()["tasks"]) == 1
            tag = created.headers["etag"]
            await service.update_task(task.id, AutomationTaskUpdate(name="changed"))
            updated = await client.get(AUTOMATIONS, headers={"If-None-Match": tag})
            assert updated.status_code == 200 and updated.json()["tasks"][0]["name"] == "changed"
            tag = updated.headers["etag"]
            await service.delete_task(task.id)
            deleted = await client.get(AUTOMATIONS, headers={"If-None-Match": tag})
            assert deleted.status_code == 200 and deleted.json()["tasks"] == []
            tag = deleted.headers["etag"]
            replacement = tmp_path / "external.json"
            replacement.write_text(json.dumps({"tasks": [task.model_dump()]}))
            replacement.replace(service.storage_path)
            external = await client.get(AUTOMATIONS, headers={"If-None-Match": tag})
            assert external.status_code == 200 and external.json()["tasks"][0]["id"] == task.id
            tag = external.headers["etag"]
            service.storage_path.unlink()
            missing = await client.get(AUTOMATIONS, headers={"If-None-Match": tag})
            assert missing.status_code == 200 and missing.json()["tasks"] == []
            tag = missing.headers["etag"]
            assert (await client.get(AUTOMATIONS, headers={"If-None-Match": tag})).status_code == 304
            service.storage_path.write_text('{"tasks": []}')
            recreated = await client.get(AUTOMATIONS, headers={"If-None-Match": tag})
            assert recreated.status_code == 200
            tag = recreated.headers["etag"]
            service.storage_path.write_text('{broken')
            invalid = await client.get(AUTOMATIONS, headers={"If-None-Match": tag})
            assert invalid.status_code == 200 and invalid.json()["tasks"] == []
            assert (await client.get(AUTOMATIONS, headers={"If-None-Match": invalid.headers["etag"]})).status_code == 200
            service.storage_path.write_text('{"tasks": []}')
            last = await client.get(AUTOMATIONS)
        fresh = AutomationService(str(service.storage_path), scheduler_enabled=False)
        async with client_for(monkeypatch, fresh) as client:
            restarted = await client.get(AUTOMATIONS, headers={"If-None-Match": last.headers["etag"]})
            assert restarted.status_code == 200 and restarted.headers["etag"] != last.headers["etag"]

    asyncio.run(check())


@pytest.mark.parametrize("outcome", ["exception", "cancelled"])
def test_automation_failed_or_cancelled_run_invalidates_live_etag(tmp_path, monkeypatch, outcome):
    async def check():
        service = AutomationService(str(tmp_path / "automation.json"), scheduler_enabled=False)
        task = await service.create_task(automation_payload())
        entered, release = asyncio.Event(), asyncio.Event()

        async def search(config):
            entered.set()
            await release.wait()
            raise RuntimeError("private fixture exception")

        monkeypatch.setattr(service, "_search_movies", search)
        await service.run_task(task.id, background=True)
        try:
            await asyncio.wait_for(entered.wait(), 2)
            async with client_for(monkeypatch, service) as client:
                initial = await client.get(AUTOMATIONS)
                if outcome == "cancelled":
                    for execution in service._executions:
                        execution.cancel()
                release.set()
                await asyncio.gather(*service._executions)
                failed = await client.get(AUTOMATIONS, headers={"If-None-Match": initial.headers["etag"]})
                assert failed.status_code == 200
                run = failed.json()["tasks"][0]["runs"][0]
                assert run["status"] == "failed" and run["finished_at"] and run["error"]
                assert "private fixture" not in run["error"]
                assert (await client.get(AUTOMATIONS, headers={"If-None-Match": failed.headers["etag"]})).status_code == 304
        finally:
            release.set()
            await service.shutdown()

    asyncio.run(check())


def test_automation_snapshot_and_etag_remain_consistent_with_a_concurrent_create(tmp_path, monkeypatch):
    async def check():
        service = AutomationService(str(tmp_path / "automation.json"), scheduler_enabled=False)
        entered, release = threading.Event(), threading.Event()
        read = service._read_task_cache

        def blocked_read():
            entered.set()
            assert release.wait(3)
            return read()

        async with client_for(monkeypatch, service) as client:
            initial = await client.get(AUTOMATIONS)
            with monkeypatch.context() as guarded:
                guarded.setattr(service, "_read_task_cache", blocked_read)
                polling = asyncio.create_task(client.get(AUTOMATIONS))
                creating = None
                try:
                    assert await asyncio.to_thread(entered.wait, 2)
                    creating = asyncio.create_task(service.create_task(automation_payload()))
                    await asyncio.sleep(0)
                    assert not creating.done(), "the snapshot owns the service lock through its stat refresh"
                    release.set()
                    snapshot = await polling
                    await creating
                finally:
                    release.set()
                    await polling
                    if creating:
                        await creating
            assert snapshot.json()["tasks"] == []
            assert snapshot.headers["etag"] == initial.headers["etag"]
            changed = await client.get(AUTOMATIONS, headers={"If-None-Match": snapshot.headers["etag"]})
            assert changed.status_code == 200 and len(changed.json()["tasks"]) == 1

    asyncio.run(check())


def test_automation_full_snapshots_copy_history_off_loop_and_tag_latest_active_run(tmp_path, monkeypatch):
    async def check():
        service = AutomationService(str(tmp_path / "automation.json"), scheduler_enabled=False)
        task = await service.create_task(automation_payload())
        searching, found = asyncio.Event(), asyncio.Event()
        search_release, finish = asyncio.Event(), asyncio.Event()
        copy_entered, copy_release = threading.Event(), threading.Event()
        loop_thread = threading.get_ident()
        copy = AutomationTask.model_copy

        async def search(config):
            searching.set()
            await search_release.wait()
            return [{"id": "QA-001"}]

        async def exists(movie_id):
            found.set()
            await finish.wait()
            return True

        monkeypatch.setattr(service, "_search_movies", search)
        monkeypatch.setattr(service, "_movie_exists", exists)
        await service.run_task(task.id, background=True)
        await asyncio.wait_for(searching.wait(), 2)
        try:
            async with client_for(monkeypatch, service) as client:
                initial = await client.get(AUTOMATIONS)

                def blocked_copy(model, *args, **kwargs):
                    copy_entered.set()
                    assert threading.get_ident() != loop_thread, "full history deepcopy must remain off the API loop"
                    assert copy_release.wait(3)
                    return copy(model, *args, **kwargs)

                with monkeypatch.context() as guarded:
                    guarded.setattr(AutomationTask, "model_copy", blocked_copy)
                    polling = asyncio.create_task(client.get(AUTOMATIONS))
                    try:
                        assert await asyncio.to_thread(copy_entered.wait, 2)
                        search_release.set()
                        await asyncio.wait_for(found.wait(), 2)
                        copy_release.set()
                        response = await polling
                        assert response.json()["tasks"][0]["runs"][0]["found_count"] == 1
                        assert response.headers["etag"] != initial.headers["etag"]
                        assert (await client.get(AUTOMATIONS, headers={"If-None-Match": response.headers["etag"]})).status_code == 304
                        assert (await service.list_tasks())[0].id == task.id
                    finally:
                        copy_release.set()
                        await asyncio.gather(polling, return_exceptions=True)
        finally:
            finish.set()
            search_release.set()
            await service.shutdown()

    asyncio.run(check())
