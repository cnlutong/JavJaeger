import asyncio
import datetime
import json
import logging
import os
import shutil
import subprocess
import time
import uuid
from collections import deque
from pathlib import Path
from typing import Any, Awaitable, Callable

from modules.common import runtime
from modules.history.service import local_movie_library_service

from .transcoding_schemas import (
    TranscodingOptions,
    TranscodingOptionsOverride,
    TranscodingPreset,
    TranscodingTask,
    TranscodingTaskCreate,
    TranscodingTaskList,
)


logger = logging.getLogger(__name__)

VIDEO_CODECS = {"libx264", "libx265", "libsvtav1", "h264_nvenc", "hevc_nvenc", "av1_nvenc"}
AUDIO_CODECS = {"aac", "ac3", "libopus", "copy"}
SPEED_PRESETS = {"ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"}
TUNES = {"film", "animation", "grain", "fastdecode", "zerolatency"}
PIXEL_FORMATS = {"yuv420p", "yuv420p10le", "auto"}
TERMINAL_STATUSES = {"completed", "failed", "cancelled"}
ACTIVE_STATUSES = {"queued", "running"}


def _options(**values: Any) -> TranscodingOptions:
    defaults = {
        "video_codec": "libx264",
        "quality_mode": "crf",
        "crf": 22,
        "video_bitrate_kbps": None,
        "speed_preset": "medium",
        "tune": "film",
        "max_height": None,
        "frame_rate": None,
        "pixel_format": "yuv420p",
        "audio_codec": "aac",
        "audio_bitrate_kbps": 192,
        "audio_channels": None,
        "copy_subtitles": True,
        "copy_metadata": True,
        "deinterlace": False,
    }
    defaults.update(values)
    return TranscodingOptions(**defaults)


TRANSCODING_PRESETS: tuple[TranscodingPreset, ...] = (
    TranscodingPreset(
        id="quality_h265",
        name="H.265 高画质压缩",
        description="尽量保持原始视觉质量，使用较慢编码换取更小体积；适合日常收藏。",
        category="画质基本保持",
        options=_options(video_codec="libx265", crf=20, speed_preset="slow", tune="grain", audio_bitrate_kbps=192),
    ),
    TranscodingPreset(
        id="archive_av1",
        name="AV1 高画质压缩",
        description="尽量保持原始视觉质量并追求更高压缩率；编码耗时较长且需播放器支持 AV1。",
        category="画质基本保持",
        options=_options(video_codec="libsvtav1", crf=24, speed_preset="slow", tune=None, audio_bitrate_kbps=160),
    ),
    TranscodingPreset(
        id="compact_h265",
        name="H.265 标准省空间",
        description="适度降低画质以显著缩小体积，同时保持原分辨率与帧率。",
        category="降低画质",
        options=_options(video_codec="libx265", crf=26, tune=None, audio_bitrate_kbps=128),
    ),
    TranscodingPreset(
        id="compatible_1080p",
        name="H.265 1080p 轻量版",
        description="适度降低画质并限制到 1080p，适合电视、平板和远程播放。",
        category="降低画质",
        options=_options(video_codec="libx265", crf=25, tune=None, max_height=1080, audio_bitrate_kbps=128, audio_channels=2),
    ),
    TranscodingPreset(
        id="mobile_720p",
        name="H.265 720p 极小版",
        description="明显降低画质并限制到 720p，优先获得适合手机和远程播放的小体积。",
        category="降低画质",
        options=_options(video_codec="libx265", crf=28, speed_preset="fast", tune=None, max_height=720, audio_bitrate_kbps=96, audio_channels=2),
    ),
)
PRESETS_BY_ID = {preset.id: preset for preset in TRANSCODING_PRESETS}
LEGACY_PRESET_ALIASES = {"balanced_h264": "quality_h265"}


class TranscodingError(ValueError):
    status_code = 400
    code = "transcoding_error"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class TranscodingNotFoundError(TranscodingError):
    status_code = 404
    code = "transcoding_not_found"


class TranscodingConflictError(TranscodingError):
    status_code = 409
    code = "transcoding_conflict"


class TranscodingUnavailableError(TranscodingError):
    status_code = 503
    code = "transcoding_unavailable"


class TranscodingCancelledError(RuntimeError):
    pass


class TranscodingOutputNotSmallerError(RuntimeError):
    pass


def _model_dump(model: Any) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def resolve_transcoding_options(
    preset_id: str,
    overrides: TranscodingOptionsOverride | None = None,
) -> TranscodingOptions:
    resolved_preset_id = LEGACY_PRESET_ALIASES.get(str(preset_id or ""), str(preset_id or ""))
    preset = PRESETS_BY_ID.get(resolved_preset_id)
    if preset is None:
        raise TranscodingError("未知的转码预设")
    values = _model_dump(preset.options)
    if overrides is not None:
        override_values = _model_dump(overrides)
        values.update({key: value for key, value in override_values.items() if value is not None})

    options = TranscodingOptions(**values)
    if options.video_codec not in VIDEO_CODECS:
        raise TranscodingError("不支持的视频编码器")
    if options.audio_codec not in AUDIO_CODECS:
        raise TranscodingError("不支持的音频编码器")
    if options.speed_preset not in SPEED_PRESETS:
        raise TranscodingError("不支持的编码速度档位")
    if options.tune is not None and options.tune not in TUNES:
        raise TranscodingError("不支持的视频调优类型")
    if options.pixel_format not in PIXEL_FORMATS:
        raise TranscodingError("不支持的像素格式")
    if options.quality_mode == "bitrate" and not options.video_bitrate_kbps:
        raise TranscodingError("平均码率模式必须填写视频码率")
    if options.audio_codec == "copy" and options.audio_channels is not None:
        raise TranscodingError("复制音频流时不能修改声道数")
    if options.video_codec not in {"libx264", "libx265"} and options.tune is not None:
        raise TranscodingError("当前视频编码器不支持所选调优类型")
    if options.video_codec == "libx265" and options.tune == "film":
        raise TranscodingError("x265 不支持真人影片 film 调优，请选择 grain 或不指定调优")
    return options


def _encoder_preset(codec: str, speed: str) -> str:
    if codec == "libsvtav1":
        return {
            "ultrafast": "12",
            "superfast": "10",
            "veryfast": "9",
            "faster": "8",
            "fast": "7",
            "medium": "6",
            "slow": "5",
            "slower": "4",
            "veryslow": "3",
        }[speed]
    if codec.endswith("_nvenc"):
        return {
            "ultrafast": "p1",
            "superfast": "p2",
            "veryfast": "p3",
            "faster": "p4",
            "fast": "p4",
            "medium": "p5",
            "slow": "p6",
            "slower": "p7",
            "veryslow": "p7",
        }[speed]
    return speed


def build_ffmpeg_command(
    source_path: Path,
    temporary_path: Path,
    options: TranscodingOptions,
    ffmpeg_path: str = "ffmpeg",
) -> list[str]:
    command = [ffmpeg_path, "-hide_banner", "-nostdin", "-y", "-i", str(source_path)]
    command.extend(["-map", "0:v:0", "-map", "0:a?"])
    if options.copy_subtitles:
        command.extend(["-map", "0:s?", "-c:s", "copy"])

    command.extend(["-map_metadata", "0" if options.copy_metadata else "-1"])
    command.extend(["-map_chapters", "0" if options.copy_metadata else "-1"])
    command.extend(["-c:v", options.video_codec, "-preset", _encoder_preset(options.video_codec, options.speed_preset)])

    if options.quality_mode == "crf":
        if options.video_codec.endswith("_nvenc"):
            command.extend(["-rc", "vbr", "-cq", str(options.crf)])
        else:
            command.extend(["-crf", str(options.crf)])
    else:
        command.extend(["-b:v", f"{options.video_bitrate_kbps}k"])

    if options.tune:
        command.extend(["-tune", options.tune])
    if options.pixel_format != "auto":
        command.extend(["-pix_fmt", options.pixel_format])

    video_filters: list[str] = []
    if options.deinterlace:
        video_filters.append("yadif")
    if options.max_height:
        video_filters.append(f"scale=-2:min({options.max_height}\\,ih)")
    if video_filters:
        command.extend(["-vf", ",".join(video_filters)])
    if options.frame_rate:
        command.extend(["-r", str(options.frame_rate)])

    command.extend(["-c:a", options.audio_codec])
    if options.audio_codec != "copy":
        if options.audio_bitrate_kbps:
            command.extend(["-b:a", f"{options.audio_bitrate_kbps}k"])
        if options.audio_channels:
            command.extend(["-ac", str(options.audio_channels)])

    if temporary_path.suffix.lower() in {".mp4", ".m4v", ".mov"}:
        command.extend(["-movflags", "+faststart"])
    command.extend(["-max_muxing_queue_size", "4096", "-progress", "pipe:1", "-nostats", str(temporary_path)])
    return command


Executor = Callable[
    [
        TranscodingTask,
        Path,
        Path,
        Callable[[dict[str, Any]], Awaitable[None]],
        asyncio.Event,
    ],
    Awaitable[None],
]


class TranscodingService:
    def __init__(
        self,
        storage_path: str | Path = "data/transcoding_tasks.json",
        library_service: Any = local_movie_library_service,
        executor: Executor | None = None,
        max_concurrent_tasks: int = 2,
        ffmpeg_path: str = "ffmpeg",
        ffprobe_path: str = "ffprobe",
        require_binaries: bool = True,
    ) -> None:
        self.storage_path = Path(storage_path)
        self.library_service = library_service
        self.max_concurrent_tasks = max(1, min(int(max_concurrent_tasks or 1), 8))
        self.ffmpeg_path = ffmpeg_path
        self.ffprobe_path = ffprobe_path
        self.require_binaries = require_binaries
        self.executor = executor or self._execute_ffmpeg
        self._tasks: dict[str, TranscodingTask] = {}
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._workers: list[asyncio.Task] = []
        self._processes: dict[str, asyncio.subprocess.Process] = {}
        self._cancel_events: dict[str, asyncio.Event] = {}
        self._active_sources: set[str] = set()
        self._lock = asyncio.Lock()
        self._lifecycle_lock = asyncio.Lock()
        self._loaded = False
        self._started = False
        self._shutting_down = False
        self._capabilities_cache: dict[str, Any] | None = None
        self._last_progress_save: dict[str, float] = {}

    async def startup(self) -> None:
        async with self._lifecycle_lock:
            if self._started:
                return
            self._shutting_down = False
            self._queue = asyncio.Queue()
            self._active_sources = set()
            async with self._lock:
                await self._load_unlocked()
                interrupted = False
                for task in self._tasks.values():
                    if task.status == "running":
                        task.status = "failed"
                        task.stage = "任务中断"
                        task.error = "应用重启，运行中的转码任务已中断；原文件保持不变"
                        task.completed_at = datetime.datetime.now().isoformat()
                        interrupted = True
                    if task.status == "queued":
                        self._active_sources.add(self._source_key(Path(task.source_path)))
                if interrupted:
                    await self._save_unlocked()
            self._workers = [
                asyncio.create_task(self._worker_loop(index), name=f"transcoding-worker-{index}")
                for index in range(self.max_concurrent_tasks)
            ]
            for task in self._tasks.values():
                if task.status == "queued":
                    self._queue.put_nowait(task.id)
            self._started = True

    async def shutdown(self) -> None:
        async with self._lifecycle_lock:
            if not self._started:
                return
            self._shutting_down = True
            for event in self._cancel_events.values():
                event.set()
            for process in list(self._processes.values()):
                if process.returncode is None:
                    try:
                        process.terminate()
                    except ProcessLookupError:
                        pass
            for worker in self._workers:
                worker.cancel()
            if self._workers:
                await asyncio.gather(*self._workers, return_exceptions=True)
            self._workers = []
            async with self._lock:
                for task in self._tasks.values():
                    if task.status == "running":
                        task.status = "failed"
                        task.stage = "任务中断"
                        task.error = "应用停止，转码任务已中断；原文件保持不变"
                        task.completed_at = datetime.datetime.now().isoformat()
                        self._active_sources.discard(self._source_key(Path(task.source_path)))
                await self._save_unlocked()
            self._processes.clear()
            self._cancel_events.clear()
            self._started = False

    async def list_tasks(self) -> TranscodingTaskList:
        await self._ensure_started()
        async with self._lock:
            tasks = sorted(self._tasks.values(), key=lambda item: item.created_at, reverse=True)
            counts = {status: 0 for status in ("queued", "running", "completed", "failed", "cancelled")}
            for task in tasks:
                counts[task.status] = counts.get(task.status, 0) + 1
            return TranscodingTaskList(
                tasks=[TranscodingTask(**_model_dump(task)) for task in tasks],
                counts=counts,
                max_concurrent_tasks=self.max_concurrent_tasks,
            )

    async def get_task(self, task_id: str) -> TranscodingTask:
        await self._ensure_started()
        async with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                raise TranscodingNotFoundError("转码任务不存在")
            return TranscodingTask(**_model_dump(task))

    async def create_task(self, payload: TranscodingTaskCreate) -> TranscodingTask:
        await self._ensure_started()
        if self.require_binaries and not self._binary_available(self.ffmpeg_path):
            raise TranscodingUnavailableError("服务器未安装 FFmpeg，无法启动转码")

        movie_id = str(payload.movie_id or "").strip().upper()
        if not movie_id:
            raise TranscodingError("影片番号无效")
        status = await self.library_service.get_status(movie_id)
        record = status.get("record") if isinstance(status, dict) else None
        if not isinstance(record, dict):
            raise TranscodingNotFoundError("影片不在本地影视库中")
        files = [item for item in record.get("files", []) if isinstance(item, dict)]
        if payload.file_index < 0 or payload.file_index >= len(files):
            raise TranscodingNotFoundError("影片文件不存在")
        file_record = files[payload.file_index]
        source_value = str(file_record.get("path") or "").strip()
        if not source_value:
            raise TranscodingNotFoundError("影视库记录缺少影片文件路径")
        try:
            source_path = Path(source_value).resolve(strict=True)
        except OSError as exc:
            raise TranscodingNotFoundError("影片文件当前不可访问") from exc
        if not source_path.is_file():
            raise TranscodingNotFoundError("影视库记录指向的不是普通文件")

        resolved_preset_id = LEGACY_PRESET_ALIASES.get(payload.preset_id, payload.preset_id)
        options = resolve_transcoding_options(resolved_preset_id, payload.options)
        preset = PRESETS_BY_ID[resolved_preset_id]
        now = datetime.datetime.now().isoformat()
        task = TranscodingTask(
            id=uuid.uuid4().hex,
            movie_id=movie_id,
            movie_title=str(record.get("title") or movie_id),
            file_index=payload.file_index,
            source_path=str(source_path),
            file_name=source_path.name,
            preset_id=preset.id,
            preset_name=preset.name,
            options=options,
            input_size=source_path.stat().st_size,
            created_at=now,
        )
        source_key = self._source_key(source_path)
        async with self._lock:
            if source_key in self._active_sources:
                raise TranscodingConflictError("该文件已有等待中或运行中的转码任务")
            self._tasks[task.id] = task
            self._active_sources.add(source_key)
            await self._save_unlocked()
        self._queue.put_nowait(task.id)
        return TranscodingTask(**_model_dump(task))

    async def cancel_task(self, task_id: str) -> TranscodingTask:
        await self._ensure_started()
        process = None
        async with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                raise TranscodingNotFoundError("转码任务不存在")
            if task.status in TERMINAL_STATUSES:
                return TranscodingTask(**_model_dump(task))
            task.cancel_requested = True
            if task.status == "queued":
                task.status = "cancelled"
                task.stage = "已取消"
                task.completed_at = datetime.datetime.now().isoformat()
                self._active_sources.discard(self._source_key(Path(task.source_path)))
            else:
                task.stage = "正在取消"
                event = self._cancel_events.get(task_id)
                if event:
                    event.set()
                process = self._processes.get(task_id)
            await self._save_unlocked()
            result = TranscodingTask(**_model_dump(task))
        if process is not None and process.returncode is None:
            try:
                process.terminate()
            except ProcessLookupError:
                pass
        return result

    async def retry_task(self, task_id: str) -> TranscodingTask:
        old_task = await self.get_task(task_id)
        if old_task.status not in {"failed", "cancelled"}:
            raise TranscodingConflictError("只有失败或已取消的任务可以重试")
        override = TranscodingOptionsOverride(**_model_dump(old_task.options))
        return await self.create_task(
            TranscodingTaskCreate(
                movie_id=old_task.movie_id,
                file_index=old_task.file_index,
                preset_id=old_task.preset_id,
                options=override,
            )
        )

    async def delete_task(self, task_id: str) -> dict[str, Any]:
        await self._ensure_started()
        async with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                raise TranscodingNotFoundError("转码任务不存在")
            if task.status not in TERMINAL_STATUSES:
                raise TranscodingConflictError("等待中或运行中的任务不能删除")
            self._tasks.pop(task_id, None)
            await self._save_unlocked()
        return {"success": True, "deleted": True, "task_id": task_id}

    async def get_presets_and_capabilities(self) -> dict[str, Any]:
        if self._capabilities_cache is None:
            self._capabilities_cache = await asyncio.to_thread(self._detect_capabilities)
        result = dict(self._capabilities_cache)
        encoders = set(result.get("available_encoders") or [])
        result["success"] = True
        result["max_concurrent_tasks"] = self.max_concurrent_tasks
        result["output_must_be_smaller"] = True
        result["presets"] = [
            {
                **_model_dump(preset),
                "available": not encoders or preset.options.video_codec in encoders,
            }
            for preset in TRANSCODING_PRESETS
        ]
        result["video_codecs"] = [
            {"value": codec, "available": not encoders or codec in encoders}
            for codec in sorted(VIDEO_CODECS)
        ]
        result["audio_codecs"] = sorted(AUDIO_CODECS)
        return result

    async def _ensure_started(self) -> None:
        if not self._started:
            await self.startup()

    async def _worker_loop(self, _index: int) -> None:
        while True:
            task_id = await self._queue.get()
            try:
                async with self._lock:
                    task = self._tasks.get(task_id)
                    should_run = task is not None and task.status == "queued"
                if should_run:
                    await self._run_task(task_id)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Transcoding worker failed for task %s", task_id)
            finally:
                self._queue.task_done()

    async def _run_task(self, task_id: str) -> None:
        source_path: Path | None = None
        temporary_path: Path | None = None
        cancel_event = asyncio.Event()
        started = time.monotonic()
        async with self._lock:
            task = self._tasks.get(task_id)
            if task is None or task.status != "queued":
                return
            task.status = "running"
            task.stage = "准备转码"
            task.started_at = datetime.datetime.now().isoformat()
            task.cancel_requested = False
            self._cancel_events[task_id] = cancel_event
            await self._save_unlocked()
            source_path = Path(task.source_path)
            temporary_path = source_path.with_name(f".{source_path.stem}.javjaeger-{task.id}{source_path.suffix}")

        async def update_progress(values: dict[str, Any]) -> None:
            async with self._lock:
                current = self._tasks.get(task_id)
                if current is None or current.status != "running":
                    return
                if "progress" in values:
                    current.progress = max(0.0, min(float(values["progress"]), 99.9))
                if "speed" in values:
                    current.speed = str(values["speed"] or "")
                if "fps" in values:
                    try:
                        current.fps = float(values["fps"])
                    except (TypeError, ValueError):
                        pass
                if "eta_seconds" in values:
                    eta_seconds = values["eta_seconds"]
                    try:
                        current.eta_seconds = max(0, int(eta_seconds)) if eta_seconds is not None else None
                    except (TypeError, ValueError):
                        current.eta_seconds = None
                if "output_size" in values:
                    try:
                        current.output_size = max(0, int(values["output_size"]))
                    except (TypeError, ValueError):
                        pass
                current.elapsed_seconds = max(0, int(time.monotonic() - started))
                current.stage = "正在转码"
                now = time.monotonic()
                if now - self._last_progress_save.get(task_id, 0.0) >= 1.0:
                    self._last_progress_save[task_id] = now
                    await self._save_unlocked()

        try:
            await self.executor(task, source_path, temporary_path, update_progress, cancel_event)
            if cancel_event.is_set():
                raise TranscodingCancelledError("任务已取消")
            if not temporary_path.exists() or not temporary_path.is_file() or temporary_path.stat().st_size <= 0:
                raise RuntimeError("FFmpeg 未生成有效的输出文件")
            output_size = temporary_path.stat().st_size
            if output_size >= task.input_size:
                async with self._lock:
                    current = self._tasks.get(task_id)
                    if current:
                        current.output_size = output_size
                raise TranscodingOutputNotSmallerError("转码结果体积未减小，已丢弃临时文件并保留原文件")
            os.replace(temporary_path, source_path)
            media_info = await self._probe_media(source_path)
            file_stat = source_path.stat()
            media_info.update(
                {
                    "size": file_stat.st_size,
                    "modified_at": datetime.datetime.fromtimestamp(file_stat.st_mtime).isoformat(),
                }
            )
            try:
                await self.library_service.update_file_after_transcode(task.movie_id, str(source_path), media_info)
            except Exception as exc:
                logger.warning("Transcoded file library metadata update failed for %s: %s", source_path, exc)
            async with self._lock:
                current = self._tasks.get(task_id)
                if current:
                    current.status = "completed"
                    current.progress = 100.0
                    current.stage = "转码完成并已覆盖原文件"
                    current.output_size = output_size
                    current.elapsed_seconds = max(0, int(time.monotonic() - started))
                    current.eta_seconds = 0
                    current.completed_at = datetime.datetime.now().isoformat()
                    current.error = ""
                    self._active_sources.discard(self._source_key(source_path))
                    await self._save_unlocked()
        except TranscodingCancelledError:
            await self._mark_cancelled(task_id, started)
        except TranscodingOutputNotSmallerError as exc:
            await self._mark_failed(
                task_id,
                self._safe_error(exc),
                started,
                stage="未覆盖：输出体积未减小，原文件保持不变",
            )
        except asyncio.CancelledError:
            if self._shutting_down:
                await self._mark_failed(task_id, "应用停止，任务中断；原文件保持不变", started)
            raise
        except Exception as exc:
            if cancel_event.is_set():
                await self._mark_cancelled(task_id, started)
            else:
                await self._mark_failed(task_id, self._safe_error(exc), started)
        finally:
            if temporary_path is not None:
                try:
                    if temporary_path.exists():
                        temporary_path.unlink()
                except OSError as exc:
                    logger.warning("Failed to remove transcoding temporary file %s: %s", temporary_path, exc)
            async with self._lock:
                self._processes.pop(task_id, None)
                self._cancel_events.pop(task_id, None)
                self._last_progress_save.pop(task_id, None)
                if source_path is not None:
                    self._active_sources.discard(self._source_key(source_path))

    async def _mark_cancelled(self, task_id: str, started: float) -> None:
        async with self._lock:
            task = self._tasks.get(task_id)
            if task:
                task.status = "cancelled"
                task.stage = "已取消，原文件保持不变"
                task.elapsed_seconds = max(0, int(time.monotonic() - started))
                task.completed_at = datetime.datetime.now().isoformat()
                task.error = ""
                self._active_sources.discard(self._source_key(Path(task.source_path)))
                await self._save_unlocked()

    async def _mark_failed(
        self,
        task_id: str,
        error: str,
        started: float,
        stage: str = "转码失败，原文件保持不变",
    ) -> None:
        async with self._lock:
            task = self._tasks.get(task_id)
            if task:
                task.status = "failed"
                task.stage = stage
                task.elapsed_seconds = max(0, int(time.monotonic() - started))
                task.completed_at = datetime.datetime.now().isoformat()
                task.error = error
                self._active_sources.discard(self._source_key(Path(task.source_path)))
                await self._save_unlocked()

    async def _execute_ffmpeg(
        self,
        task: TranscodingTask,
        source_path: Path,
        temporary_path: Path,
        progress: Callable[[dict[str, Any]], Awaitable[None]],
        cancel_event: asyncio.Event,
    ) -> None:
        duration = await self._probe_duration(source_path)
        command = build_ffmpeg_command(source_path, temporary_path, task.options, self.ffmpeg_path)
        process_kwargs: dict[str, Any] = {
            "stdout": asyncio.subprocess.PIPE,
            "stderr": asyncio.subprocess.PIPE,
        }
        if os.name == "nt":
            process_kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        process = await asyncio.create_subprocess_exec(*command, **process_kwargs)
        async with self._lock:
            self._processes[task.id] = process

        stderr_lines: deque[str] = deque(maxlen=30)

        async def collect_stderr() -> None:
            if process.stderr is None:
                return
            while True:
                line = await process.stderr.readline()
                if not line:
                    return
                stderr_lines.append(line.decode("utf-8", errors="replace").strip())

        stderr_task = asyncio.create_task(collect_stderr())
        progress_values: dict[str, str] = {}
        try:
            if process.stdout is not None:
                while True:
                    line = await process.stdout.readline()
                    if not line:
                        break
                    decoded = line.decode("utf-8", errors="replace").strip()
                    if "=" not in decoded:
                        continue
                    key, value = decoded.split("=", 1)
                    progress_values[key] = value
                    if key != "progress":
                        continue
                    out_time_seconds = self._progress_seconds(progress_values)
                    percent = (out_time_seconds / duration * 100.0) if duration > 0 else 0.0
                    speed = progress_values.get("speed", "")
                    speed_factor = self._speed_factor(speed)
                    eta = int(max(0.0, duration - out_time_seconds) / speed_factor) if duration > 0 and speed_factor > 0 else None
                    await progress(
                        {
                            "progress": percent,
                            "speed": speed,
                            "fps": progress_values.get("fps"),
                            "eta_seconds": eta,
                            "output_size": progress_values.get("total_size") or 0,
                        }
                    )
                    progress_values = {}
            return_code = await process.wait()
            await stderr_task
        finally:
            if not stderr_task.done():
                stderr_task.cancel()
                await asyncio.gather(stderr_task, return_exceptions=True)

        if cancel_event.is_set():
            raise TranscodingCancelledError("任务已取消")
        if return_code != 0:
            detail = "\n".join(line for line in stderr_lines if line)[-4000:]
            raise RuntimeError(detail or f"FFmpeg 退出码 {return_code}")

    async def _probe_duration(self, source_path: Path) -> float:
        if not self._binary_available(self.ffprobe_path):
            return 0.0
        command = [
            self.ffprobe_path,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(source_path),
        ]
        kwargs: dict[str, Any] = {"stdout": asyncio.subprocess.PIPE, "stderr": asyncio.subprocess.DEVNULL}
        if os.name == "nt":
            kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        try:
            process = await asyncio.create_subprocess_exec(*command, **kwargs)
            stdout, _ = await asyncio.wait_for(process.communicate(), timeout=15)
            if process.returncode == 0:
                return max(0.0, float(stdout.decode("utf-8", errors="replace").strip() or 0))
        except (OSError, ValueError, asyncio.TimeoutError):
            pass
        return 0.0

    async def _probe_media(self, source_path: Path) -> dict[str, Any]:
        if not self._binary_available(self.ffprobe_path):
            return {}
        command = [
            self.ffprobe_path,
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,codec_name,bit_rate:format=format_name,duration,bit_rate",
            "-of",
            "json",
            str(source_path),
        ]
        kwargs: dict[str, Any] = {"stdout": asyncio.subprocess.PIPE, "stderr": asyncio.subprocess.DEVNULL}
        if os.name == "nt":
            kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        try:
            process = await asyncio.create_subprocess_exec(*command, **kwargs)
            stdout, _ = await asyncio.wait_for(process.communicate(), timeout=20)
            if process.returncode != 0:
                return {}
            payload = json.loads(stdout.decode("utf-8", errors="replace") or "{}")
            stream = (payload.get("streams") or [{}])[0]
            container = payload.get("format") or {}
            width = int(stream.get("width") or 0)
            height = int(stream.get("height") or 0)
            bitrate = int(stream.get("bit_rate") or container.get("bit_rate") or 0)
            duration = int(float(container.get("duration") or 0))
            return {
                key: value
                for key, value in {
                    "width": width,
                    "height": height,
                    "resolution_pixels": width * height,
                    "bitrate": bitrate,
                    "codec": stream.get("codec_name") or "",
                    "container": container.get("format_name") or "",
                    "duration_seconds": duration,
                }.items()
                if value not in (None, "", 0)
            }
        except (OSError, ValueError, json.JSONDecodeError, asyncio.TimeoutError):
            return {}

    def _detect_capabilities(self) -> dict[str, Any]:
        ffmpeg_available = self._binary_available(self.ffmpeg_path)
        ffprobe_available = self._binary_available(self.ffprobe_path)
        encoders: list[str] = []
        if ffmpeg_available:
            try:
                flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
                result = subprocess.run(
                    [self.ffmpeg_path, "-hide_banner", "-encoders"],
                    capture_output=True,
                    text=True,
                    timeout=8,
                    check=False,
                    creationflags=flags,
                )
                output = f"{result.stdout}\n{result.stderr}"
                encoders = sorted(codec for codec in VIDEO_CODECS if codec in output)
            except (OSError, subprocess.SubprocessError):
                encoders = []
        return {
            "ffmpeg_available": ffmpeg_available,
            "ffprobe_available": ffprobe_available,
            "available_encoders": encoders,
        }

    async def _load_unlocked(self) -> None:
        if self._loaded:
            return
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.storage_path.exists():
            self._tasks = {}
            await self._save_unlocked()
            self._loaded = True
            return
        try:
            payload = json.loads(self.storage_path.read_text(encoding="utf-8"))
            items = payload.get("tasks", []) if isinstance(payload, dict) else []
            self._tasks = {
                task.id: task
                for item in items
                if isinstance(item, dict)
                for task in [TranscodingTask(**item)]
            }
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            logger.error("Failed to load transcoding tasks from %s: %s", self.storage_path, exc)
            self._tasks = {}
        self._loaded = True

    async def _save_unlocked(self) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": 1,
            "updated_at": datetime.datetime.now().isoformat(),
            "tasks": [_model_dump(task) for task in self._tasks.values()],
        }
        temporary = self.storage_path.with_name(f".{self.storage_path.name}.{uuid.uuid4().hex}.tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, self.storage_path)

    @staticmethod
    def _progress_seconds(values: dict[str, str]) -> float:
        for key in ("out_time_us", "out_time_ms"):
            try:
                return max(0.0, float(values.get(key) or 0) / 1_000_000.0)
            except (TypeError, ValueError):
                continue
        raw = str(values.get("out_time") or "")
        try:
            hours, minutes, seconds = raw.split(":")
            return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _speed_factor(speed: str) -> float:
        try:
            return max(0.0, float(str(speed or "").rstrip("x")))
        except ValueError:
            return 0.0

    @staticmethod
    def _source_key(path: Path) -> str:
        return os.path.normcase(os.path.abspath(str(path)))

    @staticmethod
    def _safe_error(exc: Exception) -> str:
        value = str(exc or "").strip()
        return value[-4000:] if value else exc.__class__.__name__

    @staticmethod
    def _binary_available(binary: str) -> bool:
        candidate = Path(binary)
        if candidate.parent != Path(".") or candidate.is_absolute():
            return candidate.exists() and candidate.is_file()
        return shutil.which(binary) is not None


def _configured_concurrency() -> int:
    try:
        config = runtime.get_transcoding_config()
        return max(1, min(int(config.get("max_concurrent_tasks") or 2), 8))
    except (TypeError, ValueError, AttributeError):
        return 2


transcoding_service = TranscodingService(max_concurrent_tasks=_configured_concurrency())
