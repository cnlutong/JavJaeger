"""Process-local background work; jobs never store request credentials in snapshots."""
import asyncio
import datetime
import secrets
import uuid
from typing import Any, Awaitable, Callable

from fastapi import HTTPException, Request
from modules.common.runtime import trim_finished_tasks

TaskRunner = Callable[[Callable[[dict[str, Any]], None]], Awaitable[dict[str, Any]]]


class TaskCancelled(BaseException):
    """Cooperative stop at a workflow checkpoint, after any in-flight write settles."""
    result = None


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
        self._controls = {}

    def start_task(self, task_type: str, runner: TaskRunner, owner: str | None = None, exclusive: bool = True, *, cancellable=False, retryable=False) -> str:
        task_id = self._start_task(task_type, runner, owner, exclusive)
        if cancellable or retryable:
            self._controls[task_id] = (runner, cancellable, retryable, exclusive)
        return task_id

    def list_tasks(self, owner: str) -> list[dict[str, Any]]:
        return [{key: value for key, value in self._snapshot(task).items() if key not in {'result', 'logs'}}
                for task_id, task in self._tasks.items() if self._owners.get(task_id) == owner]

    def dismiss(self, task_id: str, owner: str) -> bool:
        task = self.get_task(task_id, owner)
        if task is None:
            return False
        if task['status'] in {'running', 'queued'}:
            raise ValueError('任务仍在后台运行')
        self._tasks.pop(task_id, None)
        self._owners.pop(task_id, None)
        self._controls.pop(task_id, None)
        return True

    def cancel(self, task_id: str, owner: str):
        task = self.get_task(task_id, owner)
        if task is None:
            return None
        if not task['can_cancel']:
            raise ValueError('任务当前不能取消')
        task = self._tasks[task_id]
        task['cancel_requested'] = True
        task['message'] = '正在取消：等待当前操作结束，已提交的下载将继续'
        task['updated_at'] = datetime.datetime.now().isoformat()
        self._append_log(task, task['message'])
        return self._snapshot(task)

    def retry(self, task_id: str, owner: str):
        snapshot = self.get_task(task_id, owner)
        if snapshot is None:
            return None
        if not snapshot['can_retry']:
            raise ValueError('任务当前没有可重试的未完成项')
        runner, _, _, exclusive = self._controls[task_id]
        if exclusive and any(key != task_id and self._owners.get(key) == owner and other['type'] == snapshot['type'] and other['status'] in {'queued', 'running'} for key, other in self._tasks.items()):
            raise ValueError('同类后台任务正在运行，请等待完成')
        task = self._tasks[task_id]
        task.update(status='running', phase='queued', percent=0, completed=0, total=0, current='', error=None,
                    cancel_requested=False, finished_at=None, updated_at=datetime.datetime.now().isoformat(), message='正在重试未完成项', attempt=task['attempt'] + 1)
        self._append_log(task, task['message'])
        self._launch(task, runner)
        return self._snapshot(task)

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
            "cancel_requested": False,
            "attempt": 1,
        }
        self._tasks[task_id] = task
        self._owners[task_id] = owner
        self._launch(task, runner)
        return task_id

    def _launch(self, task, runner):
        execution = asyncio.create_task(self._run_task(task, runner))
        self._running.add(execution)
        execution.add_done_callback(self._running.discard)

    async def _run_task(self, task: dict[str, Any], runner: TaskRunner) -> None:
        def progress(event: dict[str, Any]) -> None:
            self._apply_progress(task, event)
            if task['cancel_requested']:
                raise TaskCancelled()

        try:
            result = await runner(progress)
            task["result"] = result
            if task['cancel_requested']:
                raise TaskCancelled()
            task["status"] = "success" if result.get("success") else "failed"
            if result.get("success"):
                task["percent"] = 100
            task["message"] = result.get("message") or task.get("message") or "任务完成"
            self._append_log(task, task["message"])
        except TaskCancelled as exc:
            task['status'] = 'cancelled'
            if exc.result is not None:
                task['result'] = exc.result
            task['message'] = '任务已取消，已提交的下载继续；重试仅处理未成功提交项'
            self._append_log(task, task['message'])
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
                self._controls.pop(key, None)

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
        _, cancellable, retryable, _ = self._controls.get(task['task_id'], (None, False, False, False))
        active = task['status'] in {'queued', 'running'}
        snapshot['can_cancel'] = bool(cancellable and active and not task['cancel_requested'])
        snapshot['can_retry'] = bool(not active and (retryable() if callable(retryable) else retryable and task['status'] in {'failed', 'cancelled'}))
        return snapshot

    def _failure_message(self, error: Exception) -> str:
        return '任务失败，请检查配置并核对已完成结果后重试'


background_tasks = BackgroundTaskManager()


def submit_background_task(request: Request, kind: str, runner: TaskRunner, exclusive: bool = True, *, cancellable=False, retryable=False) -> dict[str, Any]:
    owner = job_owner(request)
    try:
        task_id = background_tasks.start_task(kind, runner, owner, exclusive, cancellable=cancellable, retryable=retryable)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return background_tasks.get_task(task_id, owner)
