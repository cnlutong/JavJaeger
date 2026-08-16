import asyncio
import datetime
import json
import logging
import os
import shutil
import subprocess
import sys
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

AUTO_VIDEO_CODECS = {"h264_auto", "hevc_auto", "av1_auto"}
HARDWARE_VIDEO_CODECS = {
    "h264_nvenc",
    "hevc_nvenc",
    "av1_nvenc",
    "h264_qsv",
    "hevc_qsv",
    "av1_qsv",
    "h264_vaapi",
    "hevc_vaapi",
    "av1_vaapi",
    "h264_amf",
    "hevc_amf",
    "av1_amf",
    "h264_videotoolbox",
    "hevc_videotoolbox",
}
LEGACY_CPU_CODEC_INTENTS = {
    "libx264": "h264_auto",
    "libx265": "hevc_auto",
    "libsvtav1": "av1_auto",
}
VIDEO_CODECS = AUTO_VIDEO_CODECS | HARDWARE_VIDEO_CODECS | set(LEGACY_CPU_CODEC_INTENTS)
ENCODER_PRIORITY = {
    "h264_auto": ["h264_nvenc", "h264_qsv", "h264_vaapi", "h264_amf", "h264_videotoolbox"],
    "hevc_auto": ["hevc_nvenc", "hevc_qsv", "hevc_vaapi", "hevc_amf", "hevc_videotoolbox"],
    "av1_auto": ["av1_nvenc", "av1_qsv", "av1_vaapi", "av1_amf"],
}
ENCODER_FAMILY_LABELS = {"h264_auto": "H.264", "hevc_auto": "H.265", "av1_auto": "AV1"}
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
        options=_options(video_codec="hevc_auto", crf=20, speed_preset="slow", tune=None, audio_bitrate_kbps=192),
    ),
    TranscodingPreset(
        id="archive_av1",
        name="AV1 高画质压缩",
        description="尽量保持原始视觉质量并追求更高压缩率；编码耗时较长且需播放器支持 AV1。",
        category="画质基本保持",
        options=_options(video_codec="av1_auto", crf=24, speed_preset="slow", tune=None, audio_bitrate_kbps=160),
    ),
    TranscodingPreset(
        id="compact_h265",
        name="H.265 标准省空间",
        description="适度降低画质以显著缩小体积，同时保持原分辨率与帧率。",
        category="降低画质",
        options=_options(video_codec="hevc_auto", crf=26, tune=None, audio_bitrate_kbps=128),
    ),
    TranscodingPreset(
        id="compatible_1080p",
        name="H.265 1080p 轻量版",
        description="适度降低画质并限制到 1080p，适合电视、平板和远程播放。",
        category="降低画质",
        options=_options(video_codec="hevc_auto", crf=25, tune=None, max_height=1080, audio_bitrate_kbps=128, audio_channels=2),
    ),
    TranscodingPreset(
        id="mobile_720p",
        name="H.265 720p 极小版",
        description="明显降低画质并限制到 720p，优先获得适合手机和远程播放的小体积。",
        category="降低画质",
        options=_options(video_codec="hevc_auto", crf=28, speed_preset="fast", tune=None, max_height=720, audio_bitrate_kbps=96, audio_channels=2),
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

    requested_codec = str(values.get("video_codec") or "")
    if requested_codec in LEGACY_CPU_CODEC_INTENTS:
        values["video_codec"] = LEGACY_CPU_CODEC_INTENTS[requested_codec]
        values["tune"] = None

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
    if options.tune is not None:
        raise TranscodingError("GPU 硬件编码不支持当前内容调优选项")
    return options


def _encoder_preset(codec: str, speed: str) -> str:
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


def _hardware_backend_for_encoder(codec: str) -> str:
    for suffix, backend in (
        ("_nvenc", "nvenc"),
        ("_qsv", "qsv"),
        ("_vaapi", "vaapi"),
        ("_amf", "amf"),
        ("_videotoolbox", "videotoolbox"),
    ):
        if codec.endswith(suffix):
            return backend
    return ""


def build_ffmpeg_command(
    source_path: Path,
    temporary_path: Path,
    options: TranscodingOptions,
    ffmpeg_path: str = "ffmpeg",
    hardware_backend: str | None = None,
    hardware_device: str | None = None,
) -> list[str]:
    backend = hardware_backend or _hardware_backend_for_encoder(options.video_codec)
    if options.video_codec not in HARDWARE_VIDEO_CODECS or not backend:
        raise TranscodingError("只允许使用已经通过探针验证的 GPU 硬件编码器")

    command = [ffmpeg_path, "-hide_banner", "-nostdin", "-y"]
    if backend == "vaapi":
        if not hardware_device:
            raise TranscodingError("VAAPI 转码缺少 GPU 设备")
        command.extend(["-vaapi_device", hardware_device])
    elif backend == "qsv":
        if not hardware_device:
            raise TranscodingError("QSV 转码缺少 GPU 设备")
        command.extend(["-init_hw_device", f"qsv=javjaeger_gpu:{hardware_device}", "-filter_hw_device", "javjaeger_gpu"])

    command.extend(["-i", str(source_path)])
    command.extend(["-map", "0:v:0", "-map", "0:a?"])
    if options.copy_subtitles:
        command.extend(["-map", "0:s?", "-c:s", "copy"])

    command.extend(["-map_metadata", "0" if options.copy_metadata else "-1"])
    command.extend(["-map_chapters", "0" if options.copy_metadata else "-1"])
    command.extend(["-c:v", options.video_codec])
    if backend in {"nvenc", "qsv"}:
        command.extend(["-preset", _encoder_preset(options.video_codec, options.speed_preset)])
    elif backend == "amf":
        speed_quality = "speed" if options.speed_preset in {"ultrafast", "superfast", "veryfast", "faster", "fast"} else "quality" if options.speed_preset in {"slow", "slower", "veryslow"} else "balanced"
        command.extend(["-quality", speed_quality])

    if options.quality_mode == "crf":
        if backend == "nvenc":
            command.extend(["-rc", "vbr", "-cq", str(options.crf)])
        elif backend == "vaapi":
            command.extend(["-rc_mode", "CQP", "-qp", str(options.crf)])
        elif backend == "qsv":
            command.extend(["-global_quality", str(options.crf)])
        elif backend == "amf":
            command.extend(["-rc", "cqp", "-qp_i", str(options.crf), "-qp_p", str(options.crf), "-qp_b", str(options.crf)])
        elif backend == "videotoolbox":
            command.extend(["-q:v", str(max(1, 100 - round(options.crf * 100 / 51)))])
        else:
            raise TranscodingError("当前 GPU 编码器不支持恒定质量模式")
    else:
        command.extend(["-b:v", f"{options.video_bitrate_kbps}k"])

    if options.pixel_format != "auto" and backend not in {"vaapi", "qsv"}:
        command.extend(["-pix_fmt", options.pixel_format])

    video_filters: list[str] = []
    if options.deinterlace:
        video_filters.append("yadif")
    if options.max_height:
        video_filters.append(f"scale=-2:min({options.max_height}\\,ih)")
    if backend in {"vaapi", "qsv"}:
        upload_format = "p010le" if options.pixel_format == "yuv420p10le" else "nv12"
        video_filters.append(f"format={upload_format}")
        video_filters.append("hwupload=extra_hw_frames=64" if backend == "qsv" else "hwupload")
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
CapabilityDetector = Callable[[], dict[str, Any]]


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
        capability_detector: CapabilityDetector | None = None,
    ) -> None:
        self.storage_path = Path(storage_path)
        self.library_service = library_service
        self.max_concurrent_tasks = max(1, min(int(max_concurrent_tasks or 1), 8))
        self.ffmpeg_path = ffmpeg_path
        self.ffprobe_path = ffprobe_path
        self.require_binaries = require_binaries
        self.executor = executor or self._execute_ffmpeg
        self.capability_detector = capability_detector or self._detect_capabilities
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
            capabilities = await self._get_capabilities() if self.require_binaries else None
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
                        if capabilities is not None:
                            try:
                                options, gpu = self._bind_options_to_gpu(task.options, capabilities)
                                task.options = options
                                self._apply_gpu_to_task(task, gpu)
                            except TranscodingUnavailableError as exc:
                                task.status = "failed"
                                task.stage = "GPU 不可用，任务未执行"
                                task.error = exc.message
                                task.completed_at = datetime.datetime.now().isoformat()
                                interrupted = True
                                continue
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
        capabilities = await self._get_capabilities() if self.require_binaries else None
        if capabilities is not None and not capabilities.get("gpu_available"):
            reason = str(capabilities.get("gpu_error") or "未检测到可用 GPU 硬件编码器")
            raise TranscodingUnavailableError(f"GPU 转码不可用：{reason}")

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
        gpu: dict[str, Any] = {}
        if capabilities is not None:
            options, gpu = self._bind_options_to_gpu(options, capabilities)
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
            gpu_name=str(gpu.get("name") or ""),
            gpu_vendor=str(gpu.get("vendor") or ""),
            hardware_backend=str(gpu.get("backend") or ""),
            hardware_device=str(gpu.get("device") or ""),
            input_size=source_path.stat().st_size,
            created_at=now,
            stage="等待 GPU 执行",
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
        capabilities = await self._get_capabilities()
        result = dict(capabilities)
        result["success"] = True
        result["max_concurrent_tasks"] = self.max_concurrent_tasks
        result["output_must_be_smaller"] = True
        result["hardware_acceleration_required"] = True
        preset_payloads: list[dict[str, Any]] = []
        for preset in TRANSCODING_PRESETS:
            preset_payload = _model_dump(preset)
            try:
                options, gpu = self._bind_options_to_gpu(preset.options, capabilities)
                preset_payload["options"] = _model_dump(options)
                preset_payload["available"] = True
                preset_payload["gpu"] = gpu
                preset_payload["unavailable_reason"] = ""
            except TranscodingUnavailableError as exc:
                preset_payload["available"] = False
                preset_payload["gpu"] = None
                preset_payload["unavailable_reason"] = exc.message
            preset_payloads.append(preset_payload)
        result["presets"] = preset_payloads

        encoder_gpu = {
            encoder: gpu
            for gpu in capabilities.get("gpus") or []
            for encoder in gpu.get("encoders") or []
        }
        result["video_codecs"] = [
            {
                "value": codec,
                "available": True,
                "gpu_name": str(encoder_gpu.get(codec, {}).get("name") or ""),
                "backend": str(encoder_gpu.get(codec, {}).get("backend") or ""),
            }
            for codec in sorted(set(capabilities.get("available_encoders") or []))
        ]
        result["audio_codecs"] = sorted(AUDIO_CODECS)
        return result

    async def _get_capabilities(self) -> dict[str, Any]:
        if self._capabilities_cache is None:
            self._capabilities_cache = await asyncio.to_thread(self.capability_detector)
        return dict(self._capabilities_cache)

    def _bind_options_to_gpu(
        self,
        options: TranscodingOptions,
        capabilities: dict[str, Any],
    ) -> tuple[TranscodingOptions, dict[str, Any]]:
        requested_codec = LEGACY_CPU_CODEC_INTENTS.get(options.video_codec, options.video_codec)
        gpus = [gpu for gpu in capabilities.get("gpus") or [] if isinstance(gpu, dict)]
        if not gpus:
            reason = str(capabilities.get("gpu_error") or "未检测到可用 GPU 硬件编码器")
            raise TranscodingUnavailableError(reason)

        if requested_codec in AUTO_VIDEO_CODECS:
            candidates = ENCODER_PRIORITY[requested_codec]
        elif requested_codec in HARDWARE_VIDEO_CODECS:
            candidates = [requested_codec]
        else:
            raise TranscodingUnavailableError("CPU 视频编码器已禁用，只允许使用 GPU 硬件编码")

        for gpu in gpus:
            gpu_encoders = set(gpu.get("encoders") or [])
            for encoder in candidates:
                if encoder not in gpu_encoders:
                    continue
                values = _model_dump(options)
                values["video_codec"] = encoder
                values["tune"] = None
                return TranscodingOptions(**values), dict(gpu)

        family = ENCODER_FAMILY_LABELS.get(requested_codec, requested_codec)
        raise TranscodingUnavailableError(f"当前 GPU 不支持 {family} 硬件编码")

    @staticmethod
    def _apply_gpu_to_task(task: TranscodingTask, gpu: dict[str, Any]) -> None:
        task.gpu_name = str(gpu.get("name") or "")
        task.gpu_vendor = str(gpu.get("vendor") or "")
        task.hardware_backend = str(gpu.get("backend") or "")
        task.hardware_device = str(gpu.get("device") or "")

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
            task.stage = "准备 GPU 转码"
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
                current.stage = "GPU 正在转码"
                now = time.monotonic()
                if now - self._last_progress_save.get(task_id, 0.0) >= 1.0:
                    self._last_progress_save[task_id] = now
                    await self._save_unlocked()

        try:
            if self.require_binaries and task.options.video_codec not in HARDWARE_VIDEO_CODECS:
                raise RuntimeError("检测到非 GPU 编码器，任务已拒绝执行；原文件保持不变")
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
        command = build_ffmpeg_command(
            source_path,
            temporary_path,
            task.options,
            self.ffmpeg_path,
            hardware_backend=task.hardware_backend,
            hardware_device=task.hardware_device,
        )
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
        listed_encoders = self._listed_hardware_encoders() if ffmpeg_available else []
        gpus: list[dict[str, Any]] = []

        nvenc_encoders = [codec for codec in listed_encoders if codec.endswith("_nvenc")]
        nvidia_smi = shutil.which("nvidia-smi")
        if nvidia_smi and nvenc_encoders:
            try:
                result = self._run_probe_command(
                    [nvidia_smi, "--query-gpu=name", "--format=csv,noheader"],
                    timeout=8,
                )
                names = [line.strip() for line in result.stdout.splitlines() if line.strip()] if result.returncode == 0 else []
            except (OSError, subprocess.SubprocessError):
                names = []
            for index, name in enumerate(names):
                usable = [
                    codec
                    for codec in nvenc_encoders
                    if self._probe_hardware_encoder(codec, "nvenc", str(index))
                ]
                if usable:
                    gpus.append(
                        {
                            "name": name,
                            "vendor": "NVIDIA",
                            "backend": "nvenc",
                            "device": str(index),
                            "encoders": sorted(usable),
                        }
                    )

        render_nodes = sorted(Path("/dev/dri").glob("renderD*")) if os.name != "nt" else []
        for render_node in render_nodes:
            identity = self._drm_gpu_identity(render_node)
            backends = ["qsv", "vaapi"] if identity["vendor"] == "Intel" else ["vaapi"]
            for backend in backends:
                candidates = [codec for codec in listed_encoders if codec.endswith(f"_{backend}")]
                usable = [
                    codec
                    for codec in candidates
                    if self._probe_hardware_encoder(codec, backend, str(render_node))
                ]
                if usable:
                    gpus.append(
                        {
                            **identity,
                            "backend": backend,
                            "device": str(render_node),
                            "encoders": sorted(usable),
                        }
                    )
                    break

        if os.name == "nt":
            amf_encoders = [codec for codec in listed_encoders if codec.endswith("_amf")]
            usable_amf = [codec for codec in amf_encoders if self._probe_hardware_encoder(codec, "amf", "")]
            if usable_amf:
                gpus.append(
                    {
                        "name": "AMD GPU",
                        "vendor": "AMD",
                        "backend": "amf",
                        "device": "",
                        "encoders": sorted(usable_amf),
                    }
                )

        if sys.platform == "darwin":
            vt_encoders = [codec for codec in listed_encoders if codec.endswith("_videotoolbox")]
            usable_vt = [codec for codec in vt_encoders if self._probe_hardware_encoder(codec, "videotoolbox", "")]
            if usable_vt:
                gpus.append(
                    {
                        "name": "Apple GPU",
                        "vendor": "Apple",
                        "backend": "videotoolbox",
                        "device": "",
                        "encoders": sorted(usable_vt),
                    }
                )

        available_encoders = sorted(
            {
                encoder
                for gpu in gpus
                for encoder in gpu.get("encoders") or []
            }
        )
        if not ffmpeg_available:
            gpu_error = "服务器未安装 FFmpeg"
        elif os.name != "nt" and not render_nodes and not gpus:
            gpu_error = "容器未映射 /dev/dri/renderD*，无法访问 GPU"
        elif not gpus:
            gpu_error = "检测到的 GPU 无法创建 FFmpeg 硬件编码会话，请检查驱动和容器设备映射"
        else:
            gpu_error = ""

        if gpus:
            logger.info(
                "GPU transcoding ready: %s backend=%s encoders=%s",
                gpus[0]["name"],
                gpus[0]["backend"],
                ",".join(available_encoders),
            )
        else:
            logger.warning("GPU transcoding unavailable: %s", gpu_error)
        return {
            "ffmpeg_available": ffmpeg_available,
            "ffprobe_available": ffprobe_available,
            "hardware_acceleration_required": True,
            "gpu_available": bool(gpus),
            "gpu_error": gpu_error,
            "available_encoders": available_encoders,
            "selected_gpu": dict(gpus[0]) if gpus else None,
            "gpus": gpus,
        }

    def _listed_hardware_encoders(self) -> list[str]:
        try:
            result = self._run_probe_command(
                [self.ffmpeg_path, "-hide_banner", "-encoders"],
                timeout=8,
            )
            output = f"{result.stdout}\n{result.stderr}"
            return sorted(codec for codec in HARDWARE_VIDEO_CODECS if codec in output)
        except (OSError, subprocess.SubprocessError):
            return []

    def _probe_hardware_encoder(self, codec: str, backend: str, device: str) -> bool:
        command = [self.ffmpeg_path, "-hide_banner", "-loglevel", "error", "-nostdin", "-y"]
        if backend == "vaapi":
            command.extend(["-vaapi_device", device])
        elif backend == "qsv":
            command.extend(["-init_hw_device", f"qsv=javjaeger_probe:{device}", "-filter_hw_device", "javjaeger_probe"])
        command.extend(
            [
                "-f",
                "lavfi",
                "-i",
                "color=size=320x180:rate=1:duration=1",
            ]
        )
        if backend in {"vaapi", "qsv"}:
            upload = "format=nv12,hwupload=extra_hw_frames=64" if backend == "qsv" else "format=nv12,hwupload"
            command.extend(["-vf", upload])
        command.extend(["-c:v", codec])
        if backend == "nvenc" and device:
            command.extend(["-gpu", device])
        command.extend(["-frames:v", "1", "-f", "null", "-"])
        try:
            return self._run_probe_command(command, timeout=12).returncode == 0
        except (OSError, subprocess.SubprocessError):
            return False

    def _drm_gpu_identity(self, render_node: Path) -> dict[str, str]:
        uevent_path = Path("/sys/class/drm") / render_node.name / "device" / "uevent"
        values: dict[str, str] = {}
        try:
            for line in uevent_path.read_text(encoding="utf-8", errors="replace").splitlines():
                key, separator, value = line.partition("=")
                if separator:
                    values[key] = value
        except OSError:
            pass

        pci_id = str(values.get("PCI_ID") or "")
        vendor_id = pci_id.partition(":")[0].upper()
        vendor = {"1002": "AMD", "8086": "Intel", "10DE": "NVIDIA"}.get(vendor_id, "Unknown")
        name = ""
        slot = str(values.get("PCI_SLOT_NAME") or "")
        lspci = shutil.which("lspci")
        if lspci and slot:
            try:
                result = self._run_probe_command([lspci, "-s", slot], timeout=5)
                line = result.stdout.strip()
                name = line.partition(": ")[2].strip() if result.returncode == 0 else ""
            except (OSError, subprocess.SubprocessError):
                name = ""
        if not name:
            device_id = pci_id.partition(":")[2] or "unknown"
            name = f"{vendor} GPU {device_id}"
        return {"name": name, "vendor": vendor}

    @staticmethod
    def _run_probe_command(command: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        return subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            creationflags=flags,
        )

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
