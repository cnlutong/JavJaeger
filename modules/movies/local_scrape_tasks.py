import asyncio
import datetime
import uuid
from collections import deque
from typing import Any, Awaitable, Callable

from .local_scrape import apply_local_scrape, preview_local_scrape
from .schemas import LocalScrapeApplyRequest, LocalScrapePreviewRequest


TaskRunner = Callable[[Callable[[dict[str, Any]], None]], Awaitable[dict[str, Any]]]


class LocalScrapeTaskManager:
    def __init__(self, max_tasks: int = 20, max_logs: int = 300) -> None:
        self.max_tasks = max_tasks
        self.max_logs = max_logs
        self._tasks: dict[str, dict[str, Any]] = {}
        self._order: deque[str] = deque()

    def start_preview_task(self, request: LocalScrapePreviewRequest) -> str:
        return self._start_task("preview", lambda progress: preview_local_scrape(request, progress_callback=progress))

    def start_apply_task(self, request: LocalScrapeApplyRequest) -> str:
        return self._start_task("apply", lambda progress: apply_local_scrape(request, progress_callback=progress))

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        task = self._tasks.get(task_id)
        if task is None:
            return None
        return self._snapshot(task)

    def _start_task(self, task_type: str, runner: TaskRunner) -> str:
        task_id = uuid.uuid4().hex
        now = datetime.datetime.now().isoformat()
        task = {
            "task_id": task_id,
            "type": task_type,
            "status": "running",
            "phase": "queued",
            "percent": 0,
            "completed": 0,
            "total": 0,
            "current": "",
            "message": "任务已创建",
            "logs": [],
            "result": None,
            "error": None,
            "created_at": now,
            "updated_at": now,
            "finished_at": None,
        }
        self._tasks[task_id] = task
        self._order.append(task_id)
        self._trim_finished_tasks()
        asyncio.create_task(self._run_task(task, runner))
        return task_id

    async def _run_task(self, task: dict[str, Any], runner: TaskRunner) -> None:
        def progress(event: dict[str, Any]) -> None:
            self._apply_progress(task, event)

        try:
            result = await runner(progress)
            task["result"] = result
            task["status"] = "success" if result.get("success") else "failed"
            task["percent"] = 100
            task["message"] = result.get("message") or task.get("message") or "任务完成"
        except Exception as exc:
            task["status"] = "failed"
            task["error"] = "task_failed"
            task["message"] = str(exc)
            self._append_log(task, f"任务失败：{exc}")
        finally:
            task["finished_at"] = datetime.datetime.now().isoformat()
            task["updated_at"] = task["finished_at"]

    def _apply_progress(self, task: dict[str, Any], event: dict[str, Any]) -> None:
        now = datetime.datetime.now().isoformat()
        completed = int(event.get("completed") or 0)
        total = int(event.get("total") or 0)
        task["phase"] = event.get("phase") or task["phase"]
        task["completed"] = completed
        task["total"] = total
        task["current"] = str(event.get("current") or "")
        task["message"] = str(event.get("message") or "")
        task["updated_at"] = now
        if total > 0:
            task["percent"] = min(99, max(0, round(completed / total * 100)))
        self._append_log(task, task["message"])

    def _append_log(self, task: dict[str, Any], message: str) -> None:
        if not message:
            return
        task["logs"].append({"time": datetime.datetime.now().isoformat(), "message": message})
        if len(task["logs"]) > self.max_logs:
            del task["logs"][: len(task["logs"]) - self.max_logs]

    def _snapshot(self, task: dict[str, Any]) -> dict[str, Any]:
        snapshot = dict(task)
        snapshot["logs"] = list(task["logs"])
        return snapshot

    def _trim_finished_tasks(self) -> None:
        while len(self._order) > self.max_tasks:
            oldest = self._order[0]
            task = self._tasks.get(oldest)
            if task and task.get("status") == "running":
                break
            self._order.popleft()
            self._tasks.pop(oldest, None)


local_scrape_task_manager = LocalScrapeTaskManager()
