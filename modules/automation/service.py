import asyncio
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from modules.common.runtime import get_aria2_config
from modules.history.service import local_movie_library_service
from modules.javbus_api import javbus_api_service
from modules.magnets.service import get_best_magnet_payload
from modules.movies.service import filter_movies_by_detail_conditions
from modules.pikpak.schemas import DownloadRequest
from modules.pikpak.service import download as pikpak_download
from modules.pan115.schemas import DownloadRequest as Pan115DownloadRequest
from modules.pan115.service import download as pan115_download
from modules.webdav.clients import Aria2Client
from modules.webdav.service import dispatch_magnet_downloads_to_aria2

from .schemas import (
    AutomationEdge,
    AutomationRun,
    AutomationRunItem,
    AutomationTask,
    AutomationTaskCreate,
    AutomationTaskUpdate,
)


logger = logging.getLogger(__name__)
DEFAULT_AUTOMATION_PATH = "data/automation_tasks.json"
REQUIRED_NODE_TYPES = {"trigger", "search", "magnet", "download"}
RUN_HISTORY_LIMIT = 50
MAX_AUTOMATION_ALL_PAGES = 100


class AutomationError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class AutomationService:
    def __init__(
        self,
        storage_path: str = DEFAULT_AUTOMATION_PATH,
        scheduler_enabled: bool = True,
        scheduler_interval_seconds: int = 30,
    ) -> None:
        self.storage_path = Path(storage_path)
        self.scheduler_enabled = scheduler_enabled
        self.scheduler_interval_seconds = scheduler_interval_seconds
        self._lock = asyncio.Lock()
        self._scheduler_task: asyncio.Task | None = None
        self._running_task_ids: set[str] = set()

    async def startup(self) -> None:
        await self._load_tasks()
        if self.scheduler_enabled and self._scheduler_task is None:
            self._scheduler_task = asyncio.create_task(self._scheduler_loop())

    async def shutdown(self) -> None:
        if self._scheduler_task:
            self._scheduler_task.cancel()
            try:
                await self._scheduler_task
            except asyncio.CancelledError:
                pass
            self._scheduler_task = None

    async def list_tasks(self) -> list[AutomationTask]:
        tasks = await self._load_tasks()
        return sorted(tasks, key=lambda item: item.created_at, reverse=True)

    async def get_task(self, task_id: str) -> AutomationTask:
        tasks = await self._load_tasks()
        task = self._find_task(tasks, task_id)
        if not task:
            raise AutomationError("task_not_found", "自动任务不存在")
        return task

    async def create_task(self, payload: AutomationTaskCreate) -> AutomationTask:
        self._validate_graph(payload.nodes, payload.edges)
        now = self._now()
        task = AutomationTask(
            **payload.model_dump(),
            id=uuid4().hex,
            created_at=now,
            updated_at=now,
        )
        task.next_run_at = self._calculate_next_run(task, datetime.fromisoformat(now))
        async with self._lock:
            tasks = await self._load_tasks_unlocked()
            tasks.append(task)
            await self._save_tasks_unlocked(tasks)
        return task

    async def update_task(self, task_id: str, payload: AutomationTaskUpdate) -> AutomationTask:
        async with self._lock:
            tasks = await self._load_tasks_unlocked()
            index, task = self._find_task_with_index(tasks, task_id)
            if task is None:
                raise AutomationError("task_not_found", "自动任务不存在")
            update_data = payload.model_dump(exclude_unset=True)
            next_data = task.model_dump()
            next_data.update(update_data)
            next_data["updated_at"] = self._now()
            updated = AutomationTask(**next_data)
            self._validate_graph(updated.nodes, updated.edges)
            updated.next_run_at = self._calculate_next_run(updated, datetime.now())
            tasks[index] = updated
            await self._save_tasks_unlocked(tasks)
            return updated

    async def delete_task(self, task_id: str) -> None:
        async with self._lock:
            tasks = await self._load_tasks_unlocked()
            next_tasks = [task for task in tasks if task.id != task_id]
            if len(next_tasks) == len(tasks):
                raise AutomationError("task_not_found", "自动任务不存在")
            await self._save_tasks_unlocked(next_tasks)

    async def run_task(self, task_id: str, manual: bool = False) -> AutomationRun:
        if task_id in self._running_task_ids:
            raise AutomationError("task_already_running", "任务正在运行")
        task = await self.get_task(task_id)
        self._running_task_ids.add(task_id)
        run = AutomationRun(
            id=uuid4().hex,
            task_id=task_id,
            status="running",
            started_at=self._now(),
        )
        try:
            run = await self._execute_task(task, run, manual=manual)
        except Exception as exc:
            logger.exception("自动任务运行失败: %s", task_id)
            run.status = "failed"
            run.error = str(exc)
            run.finished_at = self._now()
        finally:
            self._running_task_ids.discard(task_id)
        await self._record_run(task_id, run)
        return run

    async def list_runs(self, task_id: str) -> list[AutomationRun]:
        task = await self.get_task(task_id)
        return task.runs

    async def _execute_task(self, task: AutomationTask, run: AutomationRun, manual: bool = False) -> AutomationRun:
        search_node = self._first_node(task, "search")
        magnet_node = self._first_node(task, "magnet")
        download_node = self._first_node(task, "download")

        movies = await self._search_movies(search_node.config)
        run.found_count = len(movies)
        prepared = []
        for movie in movies:
            movie_id = str(movie.get("id") or movie.get("movie_id") or "").strip()
            if not movie_id:
                continue
            title = movie.get("title") or movie_id
            if search_node.config.get("skip_existing", True) and await self._movie_exists(movie_id):
                run.skipped_count += 1
                run.items.append(AutomationRunItem(movie_id=movie_id, title=title, status="skipped", message="already_exists"))
                continue

            magnet = await get_best_magnet_payload(
                movie_id,
                magnet_source=magnet_node.config.get("source", "javbus"),
                has_subtitle_filter=magnet_node.config.get("has_subtitle"),
                exclude_4k=bool(magnet_node.config.get("exclude_4k", False)),
                allow_chinese_subtitles=bool(magnet_node.config.get("allow_chinese_subtitles", True)),
                allow_param_present="allow_chinese_subtitles" in magnet_node.config,
                movie_data=movie,
            )
            if not magnet or not magnet.get("link"):
                run.skipped_count += 1
                run.items.append(AutomationRunItem(movie_id=movie_id, title=title, status="no_magnet", message="no_magnet"))
                continue
            run.magnet_count += 1
            prepared.append({"movie_id": movie_id, "title": title, "magnet": magnet})

        if prepared:
            results = await self._dispatch_downloads(download_node.config, prepared)
            run.dispatched_count = sum(1 for item in results if item.get("success"))
            for index, item in enumerate(prepared):
                result = results[index] if index < len(results) else {}
                run.items.append(
                    AutomationRunItem(
                        movie_id=item["movie_id"],
                        title=item["title"],
                        status="dispatched" if result.get("success") else "dispatch_failed",
                        magnet_link=item["magnet"].get("link"),
                        message=result.get("error") or result.get("message") or result.get("reason"),
                    )
                )

        run.finished_at = self._now()
        if run.dispatched_count == run.magnet_count and run.error is None:
            run.status = "success"
        elif run.dispatched_count > 0 or run.skipped_count > 0:
            run.status = "partial"
        else:
            run.status = "failed"
            run.error = run.error or "没有可派发的下载任务"
        return run

    async def _search_movies(self, config: dict[str, Any]) -> list[dict[str, Any]]:
        mode = config.get("mode", "keyword")
        max_results = self._parse_max_results(config)
        magnet = config.get("magnet", "exist")
        movie_type = config.get("type", "normal")
        if mode == "codes":
            raw_codes = str(config.get("codes") or "")
            codes = [item.strip().upper() for item in raw_codes.replace("\n", ",").split(",") if item.strip()]
            movies = [{"id": code, "title": code} for code in codes]
            return self._limit_movies(movies, max_results)
        if mode == "filter":
            filter_conditions = self._normalize_filter_conditions(config)
            if not filter_conditions:
                raise AutomationError("filter_required", "筛选条件不能为空")
            seed_filter = filter_conditions[0]

            async def fetch_filter_page(page: int) -> dict[str, Any]:
                return await javbus_api_service.get_movies_by_page(
                    {
                        "filterType": seed_filter["type"],
                        "filterValue": seed_filter["value"],
                        "magnet": magnet,
                        "type": movie_type,
                        "page": str(page),
                    }
                )

            movies = await self._collect_paginated_movies(fetch_filter_page, max_results, start_page=int(config.get("page") or 1))
            movies = await filter_movies_by_detail_conditions(
                movies,
                filter_conditions,
                actor_count_filter=config.get("actor_count_filter"),
                semaphore_size=5,
            )
            return self._limit_movies(movies, max_results)
        else:
            keyword = str(config.get("keyword") or "").strip()
            if not keyword:
                raise AutomationError("keyword_required", "关键词不能为空")

            async def fetch_keyword_page(page: int) -> dict[str, Any]:
                return await javbus_api_service.get_movies_by_keyword_and_page(
                    keyword,
                    page=str(page),
                    magnet=magnet,
                    movie_type=movie_type,
                )

            return await self._collect_paginated_movies(fetch_keyword_page, max_results, start_page=int(config.get("page") or 1))

    def _parse_max_results(self, config: dict[str, Any]) -> int | None:
        value = config.get("max_results")
        if config.get("max_results_all") or value == "all":
            return None
        try:
            parsed = int(value or 20)
        except (TypeError, ValueError):
            parsed = 20
        return max(1, min(parsed, 200))

    def _limit_movies(self, movies: list[dict[str, Any]], max_results: int | None) -> list[dict[str, Any]]:
        if max_results is None:
            return list(movies)
        return list(movies)[:max_results]

    def _normalize_filter_conditions(self, config: dict[str, Any]) -> list[dict[str, str]]:
        raw_filters = config.get("filters")
        conditions: list[dict[str, str]] = []
        if isinstance(raw_filters, list):
            for item in raw_filters:
                if not isinstance(item, dict):
                    continue
                filter_type = str(item.get("type") or "").strip()
                filter_value = str(item.get("value") or "").strip()
                if filter_type in {"star", "genre"} and filter_value:
                    conditions.append(
                        {
                            "type": filter_type,
                            "value": filter_value,
                            "label": str(item.get("label") or "").strip(),
                        }
                    )

        if not conditions:
            filter_type = str(config.get("filter_type") or "").strip()
            filter_value = str(config.get("filter_value") or "").strip()
            if filter_type in {"star", "genre"} and filter_value:
                conditions.append({"type": filter_type, "value": filter_value, "label": str(config.get("filter_label") or "").strip()})

        deduped: list[dict[str, str]] = []
        seen: set[tuple[str, str]] = set()
        for condition in conditions:
            key = (condition["type"], condition["value"])
            if key in seen:
                continue
            seen.add(key)
            deduped.append(condition)
        return deduped

    async def _collect_paginated_movies(
        self,
        fetch_page,
        max_results: int | None,
        start_page: int = 1,
    ) -> list[dict[str, Any]]:
        movies: list[dict[str, Any]] = []
        current_page = max(1, start_page)
        while True:
            payload = await fetch_page(current_page)
            page_movies = payload.get("movies") if isinstance(payload, dict) else []
            if not page_movies:
                break
            movies.extend(page_movies)
            if max_results is not None and len(movies) >= max_results:
                break
            pagination = payload.get("pagination") if isinstance(payload, dict) else {}
            has_next_page = bool(pagination.get("hasNextPage"))
            next_page = pagination.get("nextPage")
            if not has_next_page and not next_page:
                break
            current_page = int(next_page or current_page + 1)
            if current_page - start_page >= MAX_AUTOMATION_ALL_PAGES:
                logger.warning("自动任务检索达到最大页数限制 %s，停止获取", MAX_AUTOMATION_ALL_PAGES)
                break
        return self._limit_movies(movies, max_results)

    async def _dispatch_downloads(self, config: dict[str, Any], prepared: list[dict[str, Any]]) -> list[dict[str, Any]]:
        tool = config.get("tool", "pikpak")
        magnet_links = [item["magnet"]["link"] for item in prepared]
        movie_ids = [item["movie_id"] for item in prepared]
        magnet_sources = [item["magnet"].get("source") or "" for item in prepared]
        if tool == "aria2":
            return await self._dispatch_to_aria2(magnet_links, movie_ids, magnet_sources)
        if tool in {"115", "pan115"}:
            payload = await pan115_download(Pan115DownloadRequest(magnet_links=magnet_links, movie_ids=movie_ids, magnet_sources=magnet_sources))
            results = payload.get("results") if isinstance(payload, dict) else []
            return list(results or [])

        payload = await pikpak_download(DownloadRequest(magnet_links=magnet_links, movie_ids=movie_ids, magnet_sources=magnet_sources))
        results = payload.get("results") if isinstance(payload, dict) else []
        return list(results or [])

    async def _dispatch_to_aria2(
        self,
        magnet_links: list[str],
        movie_ids: list[str],
        magnet_sources: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        config = get_aria2_config()
        if not config.get("enabled") or not config.get("url"):
            raise AutomationError("aria2_not_configured", "Aria2 未在设置中启用")
        client = Aria2Client(str(config.get("url")), secret=str(config.get("secret") or ""))
        return await dispatch_magnet_downloads_to_aria2(client, magnet_links, movie_ids, magnet_sources or [])

    async def _movie_exists(self, movie_id: str) -> bool:
        return await local_movie_library_service.is_movie_present(movie_id)

    async def _record_run(self, task_id: str, run: AutomationRun) -> None:
        async with self._lock:
            tasks = await self._load_tasks_unlocked()
            index, task = self._find_task_with_index(tasks, task_id)
            if task is None:
                return
            task.runs.insert(0, run)
            task.runs = task.runs[:RUN_HISTORY_LIMIT]
            task.last_run_at = run.finished_at or run.started_at
            task.last_status = run.status
            task.updated_at = self._now()
            task.next_run_at = self._calculate_next_run(task, datetime.now())
            tasks[index] = task
            await self._save_tasks_unlocked(tasks)

    async def _scheduler_loop(self) -> None:
        while True:
            try:
                await self._run_due_tasks()
            except Exception:
                logger.exception("自动模式调度循环异常")
            await asyncio.sleep(self.scheduler_interval_seconds)

    async def _run_due_tasks(self) -> None:
        now = datetime.now()
        tasks = await self.list_tasks()
        for task in tasks:
            if not task.enabled or not task.next_run_at:
                continue
            try:
                due_at = datetime.fromisoformat(task.next_run_at)
            except ValueError:
                continue
            if due_at <= now and task.id not in self._running_task_ids:
                asyncio.create_task(self.run_task(task.id, manual=False))

    def _calculate_next_run(self, task: AutomationTask, now: datetime) -> str | None:
        if not task.enabled:
            return None
        if task.trigger.type == "auto":
            if task.last_run_at:
                return None
            return now.isoformat(timespec="seconds")
        if task.trigger.type == "interval":
            minutes = task.trigger.interval_minutes or 60
            if task.last_run_at:
                try:
                    base = datetime.fromisoformat(task.last_run_at)
                except ValueError:
                    base = now
                next_run = base + timedelta(minutes=minutes)
                return max(next_run, now).isoformat(timespec="seconds")
            return now.isoformat(timespec="seconds")
        if task.trigger.type == "scheduled":
            scheduled_time = task.trigger.scheduled_time or "00:00"
            hour, minute = [int(part) for part in scheduled_time.split(":")]
            candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if candidate <= now:
                candidate += timedelta(days=1)
            return candidate.isoformat(timespec="seconds")
        return None

    def _validate_graph(self, nodes: list[Any], edges: list[AutomationEdge]) -> None:
        node_types = {node.type for node in nodes}
        missing = REQUIRED_NODE_TYPES - node_types
        if missing:
            raise AutomationError("invalid_graph", f"自动任务缺少节点: {', '.join(sorted(missing))}")
        node_ids = {node.id for node in nodes}
        for edge in edges:
            if edge.source not in node_ids or edge.target not in node_ids:
                raise AutomationError("invalid_graph", "自动任务连线引用了不存在的节点")

    def _first_node(self, task: AutomationTask, node_type: str):
        for node in task.nodes:
            if node.type == node_type:
                return node
        raise AutomationError("invalid_graph", f"自动任务缺少 {node_type} 节点")

    async def _load_tasks(self) -> list[AutomationTask]:
        async with self._lock:
            return await self._load_tasks_unlocked()

    async def _load_tasks_unlocked(self) -> list[AutomationTask]:
        if not self.storage_path.exists():
            return []
        try:
            data = json.loads(self.storage_path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.error("读取自动任务失败: %s", exc)
            return []
        return [AutomationTask(**item) for item in data.get("tasks", [])]

    async def _save_tasks_unlocked(self, tasks: list[AutomationTask]) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"tasks": [task.model_dump() for task in tasks]}
        self.storage_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def _find_task(self, tasks: list[AutomationTask], task_id: str) -> AutomationTask | None:
        return next((task for task in tasks if task.id == task_id), None)

    def _find_task_with_index(self, tasks: list[AutomationTask], task_id: str) -> tuple[int, AutomationTask | None]:
        for index, task in enumerate(tasks):
            if task.id == task_id:
                return index, task
        return -1, None

    def _now(self) -> str:
        return datetime.now().isoformat(timespec="seconds")


automation_service = AutomationService()
