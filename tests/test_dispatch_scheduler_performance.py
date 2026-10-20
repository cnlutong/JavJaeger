import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

from modules.automation.schemas import AutomationRun, AutomationTask
from modules.automation.service import AutomationService
from modules.pan115 import service as pan115
from modules.pan115.schemas import DownloadRequest


def test_pan115_deduplicates_linearly_after_replacements_and_keeps_batch_result_order(monkeypatch):
    async def check():
        links = [f"magnet:?xt=urn:btih:{i:040x}" for i in range(1000)]
        collision, old_replacement = "magnet:already-tried-collision", "magnet:already-tried-new"
        replacement = "magnet:replacement"
        request = DownloadRequest(
            magnet_links=links + [f" {links[7].upper()} ", collision, old_replacement, "", "magnet:local"],
            movie_ids=[f"QA-{i}" for i in range(1000)] + ["QA-CASE", "QA-COLLISION", "QA-REPLACEMENT", "QA-EMPTY", "QA-LOCAL"],
            magnet_sources=["javbus"] * 1005,
        )
        batches, persisted, replacement_requests, normalizations = [], [], [], []
        original_key = pan115._dedupe_key

        def counted_key(value):
            normalizations.append(1)
            return original_key(value)

        async def exists(movie_id):
            return movie_id == "QA-LOCAL"

        async def attempted(movie_id, link):
            return link in {collision, old_replacement}

        async def replace(movie_id, link, source):
            replacement_requests.append(link)
            return {"link": links[9].upper() if link == collision else replacement, "source": "cilisousuo"}

        async def record(results, tool):
            assert tool == "pan115"
            persisted.extend(results)

        class FakeClient:
            def __init__(self, cookie):
                pass

            async def add_offline_tasks(self, chunk, save_dir_id):
                assert save_dir_id == "0"
                batches.append(list(chunk))
                return [{"success": True} for _ in chunk]

        monkeypatch.setattr(pan115, "_resolve_credentials", lambda payload: ("fixture", "0", 37, 0, 0, []))
        monkeypatch.setattr(pan115, "Pan115Client", FakeClient)
        monkeypatch.setattr(pan115, "local_movie_library_service", SimpleNamespace(is_movie_present=exists))
        monkeypatch.setattr(pan115, "download_history_service", SimpleNamespace(is_magnet_downloaded=attempted, record_dispatch_results=record))
        monkeypatch.setattr(pan115, "get_same_source_replacement_magnet_payload", replace)
        monkeypatch.setattr(pan115, "_dedupe_key", counted_key)
        result = await pan115.download(request)

        assert len(normalizations) <= 3 * len(request.magnet_links), "distinct links must not rescan all preceding links"
        assert [link for batch in batches for link in batch] == links + [replacement]
        assert all(len(batch) == 37 for batch in batches[:-1])
        assert [item["magnet"] for item in persisted] == links + [replacement]
        assert replacement_requests == [collision, old_replacement]
        assert result["success_count"] == 1001 and result["skipped_count"] == 3 and result["failed_count"] == 1
        assert [item["movie_id"] for item in result["results"]] == request.movie_ids
        assert [result["results"][i].get("reason") for i in (1000, 1001, 1004)] == ["duplicate_magnet", "duplicate_magnet", "already_exists"]
        assert result["results"][1002]["magnet"] == replacement
        assert result["results"][1002]["original_magnet"] == old_replacement
        assert result["results"][1002]["source"] == "cilisousuo"
        assert result["results"][1003]["error"] == "empty_magnet"

    asyncio.run(check())


def test_idle_scheduler_reads_only_schedule_fields_and_detects_external_changes(tmp_path, monkeypatch):
    async def check():
        path = tmp_path / "automation.json"
        service = AutomationService(str(path), scheduler_enabled=False)

        def task(task_id, created_at, enabled=True, next_run_at="2000-01-01"):
            return {"id": task_id, "name": task_id, "created_at": created_at, "updated_at": created_at,
                    "enabled": enabled, "next_run_at": next_run_at,
                    "runs": [{"id": "run", "task_id": task_id, "status": "noop", "started_at": "2026-10-20",
                              "items": [{"movie_id": f"QA-{i}", "status": "skipped"} for i in range(20)]}]}

        tasks = [task("old", "2026-01-01"), task("new", "2026-10-20"),
                 task("disabled", "2026-10-22", False), task("future", "2026-10-23", next_run_at="2100-01-01"),
                 task("active", "2026-10-24"), task("invalid", "2026-10-25", next_run_at="invalid"),
                 task("unscheduled", "2026-10-26", next_run_at=None),
                 task("tie-a", "2026-10-19"), task("tie-b", "2026-10-19")]
        path.write_text(json.dumps({"tasks": tasks}))
        service._running_task_ids.add("active")
        run = AsyncMock()
        monkeypatch.setattr(service, "run_task", run)

        def no_history_copy(*args, **kwargs):
            raise AssertionError("scheduler must not deepcopy task or run history")

        monkeypatch.setattr(AutomationTask, "model_copy", no_history_copy)
        monkeypatch.setattr(AutomationRun, "model_copy", no_history_copy)
        await service._run_due_tasks()
        assert [call.args[0] for call in run.await_args_list] == ["new", "tie-a", "tie-b", "old"]
        assert all(call.kwargs == {"manual": False, "background": True} for call in run.await_args_list)

        # External atomic replacements can enable, disable and reschedule tasks.
        run.reset_mock()
        for record in tasks:
            record["enabled"] = record["id"] in {"future", "disabled", "active"}
            record["next_run_at"] = "2000-01-01"
        replacement = tmp_path / "external.json"
        replacement.write_text(json.dumps({"tasks": tasks}))
        replacement.replace(path)
        await service._run_due_tasks()
        assert [call.args[0] for call in run.await_args_list] == ["future", "disabled"]

        run.reset_mock()
        path.unlink()
        await service._run_due_tasks()
        run.assert_not_awaited()
        path.write_text(json.dumps({"tasks": [task("recreated", "2026-10-20")]}))
        await service._run_due_tasks()
        run.assert_awaited_once_with("recreated", manual=False, background=True)

    asyncio.run(check())
