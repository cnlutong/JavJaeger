"""Process-local background work; jobs never store request credentials in snapshots."""
import asyncio
import datetime
import secrets
import uuid
from typing import Any, Awaitable, Callable

from fastapi import HTTPException, Request
from modules.common.runtime import trim_finished_tasks

TaskRunner = Callable[[Callable[[dict[str, Any]], None]], Awaitable[dict[str, Any]]]


def job_owner(request: Request) -> str:
    # Reuse the downloader session identity so refresh preserves both scopes.
    if not request.session.get('webdav_session_id'):
        request.session['webdav_session_id'] = secrets.token_urlsafe(24)
    return request.session['webdav_session_id']


class BackgroundTaskManager:
    def __init__(self, max_tasks: int = 20, max_logs: int = 300) -> None:
        self.max_tasks, self.max_logs = max_tasks, max_logs
        self._tasks = {}
        self._owners = {}
        self._running = set()

    def start_task(self, task_type: str, runner: TaskRunner, owner: str | None = None, exclusive: bool = True) -> str:
        return self._start_task(task_type, runner, owner, exclusive)

    def list_tasks(self, owner: str) -> list[dict[str, Any]]:
        return [{key: value for key, value in task.items() if key not in {'result', 'logs'}}
                for task_id, task in self._tasks.items() if self._owners.get(task_id) == owner]

    def dismiss(self, task_id: str, owner: str) -> bool:
        task = self.get_task(task_id, owner)
        if task is None:
            return False
        if task['status'] in {'running', 'queued'}:
            raise ValueError('任务仍在后台运行')
        self._tasks.pop(task_id, None)
        self._owners.pop(task_id, None)
        return True

    def get_task(self, task_id: str, owner: str | None = None) -> dict[str, Any] | None:
        task = self._tasks.get(task_id)
        if task is None or owner is not None and self._owners.get(task_id) != owner:
            return None
        return self._snapshot(task)

    def _start_task(self, task_type: str, runner: TaskRunner, owner: str | None = None, exclusive: bool = True) -> str:
        if owner and exclusive and any(self._owners.get(key) == owner and task['type'] == task_type and task['status'] in {'queued', 'running'} for key, task in self._tasks.items()):
            raise ValueError('同类后台任务正在运行，请等待完成')
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
        self._owners[task_id] = owner
        execution = asyncio.create_task(self._run_task(task, runner))
        self._running.add(execution)
        execution.add_done_callback(self._running.discard)
        return task_id

    async def _run_task(self, task: dict[str, Any], runner: TaskRunner) -> None:
        def progress(event: dict[str, Any]) -> None:
            self._apply_progress(task, event)

        try:
            result = await runner(progress)
            task["result"] = result
            task["status"] = "success" if result.get("success") else "failed"
            if result.get("success"):
                task["percent"] = 100
            task["message"] = result.get("message") or task.get("message") or "任务完成"
            self._append_log(task, task["message"])
        except Exception as exc:
            task["status"] = "failed"
            task["error"] = "task_failed"
            task["message"] = self._failure_message(exc)
            self._append_log(task, task["message"])
        finally:
            if task["status"] in {"queued", "running"}:
                task["status"] = "failed"
                task["error"] = "task_failed"
                task["message"] = "任务已中断，请核对已完成结果后重试"
                self._append_log(task, task["message"])
            task["finished_at"] = datetime.datetime.now().isoformat()
            task["updated_at"] = task["finished_at"]
            task_id = task["task_id"]
            self._tasks[task_id] = self._tasks.pop(task_id)
            owner = self._owners.get(task_id)
            owned = {key: value for key, value in self._tasks.items() if self._owners.get(key) == owner}
            previous = set(owned)
            trim_finished_tasks(owned, self.max_tasks)
            for key in previous - owned.keys():
                self._tasks.pop(key, None)
                self._owners.pop(key, None)

    def _apply_progress(self, task: dict[str, Any], event: dict[str, Any]) -> None:
        if "result" in event:
            task["result"] = event["result"]
        now = datetime.datetime.now().isoformat()
        same_phase = event.get("phase", task["phase"]) == task["phase"]
        completed = int(event.get("completed", task["completed"] if same_phase else 0) or 0)
        total = int(event.get("total", task["total"] if same_phase else 0) or 0)
        task["phase"] = event.get("phase") or task["phase"]
        task["completed"] = completed
        task["total"] = total
        task["current"] = str(event.get("current") or "")
        task["message"] = str(event.get("message") or "")
        task["updated_at"] = now
        task["percent"] = min(99, max(0, round(completed / total * 100))) if total > 0 else 0
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

    def _failure_message(self, error: Exception) -> str:
        return '任务失败，请检查配置并核对已完成结果后重试'


background_tasks = BackgroundTaskManager()


def submit_background_task(request: Request, kind: str, runner: TaskRunner, exclusive: bool = True) -> dict[str, Any]:
    owner = job_owner(request)
    try:
        task_id = background_tasks.start_task(kind, runner, owner, exclusive)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return background_tasks.get_task(task_id, owner)
