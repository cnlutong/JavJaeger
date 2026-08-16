import asyncio
import sys
from pathlib import Path

import pytest

from modules.movies.transcoding import (
    TRANSCODING_PRESETS,
    TranscodingConflictError,
    TranscodingError,
    TranscodingService,
    TranscodingUnavailableError,
    build_ffmpeg_command,
    resolve_transcoding_options,
)
from modules.movies.transcoding_schemas import TranscodingOptions, TranscodingOptionsOverride, TranscodingTaskCreate


AMD_GPU_CAPABILITIES = {
    "ffmpeg_available": True,
    "ffprobe_available": True,
    "hardware_acceleration_required": True,
    "gpu_available": True,
    "available_encoders": ["h264_vaapi", "hevc_vaapi"],
    "selected_gpu": {
        "name": "AMD Barcelo",
        "vendor": "AMD",
        "backend": "vaapi",
        "device": "/dev/dri/renderD128",
        "encoders": ["h264_vaapi", "hevc_vaapi"],
    },
    "gpus": [
        {
            "name": "AMD Barcelo",
            "vendor": "AMD",
            "backend": "vaapi",
            "device": "/dev/dri/renderD128",
            "encoders": ["h264_vaapi", "hevc_vaapi"],
        }
    ],
}


class FakeLibraryService:
    def __init__(self, files_by_movie: dict[str, Path]):
        self.files_by_movie = files_by_movie
        self.updates: list[tuple[str, str, dict]] = []

    async def get_status(self, movie_id: str):
        source = self.files_by_movie.get(movie_id.upper())
        return {
            "success": True,
            "in_local_library": source is not None,
            "record": {
                "movie_id": movie_id.upper(),
                "files": [
                    {
                        "path": str(source),
                        "scan_root": str(source.parent),
                        "file_name": source.name,
                        "size": source.stat().st_size,
                    }
                ],
            }
            if source
            else None,
        }

    async def update_file_after_transcode(self, movie_id: str, path: str, media_info: dict):
        self.updates.append((movie_id, path, media_info))
        return True


async def wait_for_terminal(service: TranscodingService, task_id: str, timeout: float = 2.0):
    async def poll():
        while True:
            task = await service.get_task(task_id)
            if task.status in {"completed", "failed", "cancelled"}:
                return task
            await asyncio.sleep(0.01)

    return await asyncio.wait_for(poll(), timeout=timeout)


def test_professional_options_build_a_shell_free_ffmpeg_command():
    requested_options = resolve_transcoding_options(
        "quality_h265",
        TranscodingOptionsOverride(
            max_height=1080,
            frame_rate=30,
            audio_channels=2,
            deinterlace=True,
            copy_subtitles=False,
        ),
    )
    option_values = requested_options.model_dump() if hasattr(requested_options, "model_dump") else requested_options.dict()
    option_values["video_codec"] = "hevc_vaapi"
    options = TranscodingOptions(**option_values)

    command = build_ffmpeg_command(
        Path("D:/media/input movie.mkv"),
        Path("D:/media/.input movie.javjaeger-task.mkv"),
        options,
        ffmpeg_path="ffmpeg",
        hardware_backend="vaapi",
        hardware_device="/dev/dri/renderD128",
    )

    assert command[:8] == [
        "ffmpeg",
        "-hide_banner",
        "-nostdin",
        "-y",
        "-vaapi_device",
        "/dev/dri/renderD128",
        "-i",
        str(Path("D:/media/input movie.mkv")),
    ]
    assert command[command.index("-c:v") + 1] == "hevc_vaapi"
    assert command[command.index("-rc_mode") + 1] == "CQP"
    assert command[command.index("-qp") + 1] == "20"
    assert "-preset" not in command
    assert command[command.index("-r") + 1] == "30"
    assert command[command.index("-ac") + 1] == "2"
    assert "yadif" in command[command.index("-vf") + 1]
    assert "scale=-2:min(1080\\,ih)" in command[command.index("-vf") + 1]
    assert "format=nv12" in command[command.index("-vf") + 1]
    assert "hwupload" in command[command.index("-vf") + 1]
    assert "0:s?" not in command
    assert "libx265" not in command
    assert command[-1] == str(Path("D:/media/.input movie.javjaeger-task.mkv"))
    with pytest.raises(TranscodingError):
        resolve_transcoding_options(
            "quality_h265",
            TranscodingOptionsOverride(video_codec="libx264; Remove-Item *"),
        )


def test_presets_only_offer_smaller_file_strategies():
    assert [preset.id for preset in TRANSCODING_PRESETS] == [
        "quality_h265",
        "archive_av1",
        "compact_h265",
        "compatible_1080p",
        "mobile_720p",
    ]
    assert {preset.category for preset in TRANSCODING_PRESETS} == {"画质基本保持", "降低画质"}
    assert all(preset.options.video_codec in {"hevc_auto", "av1_auto"} for preset in TRANSCODING_PRESETS)
    assert all(
        preset.options.crf >= 25
        for preset in TRANSCODING_PRESETS
        if preset.category == "降低画质"
    )
    assert resolve_transcoding_options("balanced_h264").video_codec == "hevc_auto"
    assert resolve_transcoding_options(
        "quality_h265",
        TranscodingOptionsOverride(video_codec="libx265"),
    ).video_codec == "hevc_auto"


def test_capabilities_resolve_presets_to_smoke_tested_gpu_encoders(tmp_path: Path):
    async def exercise():
        service = TranscodingService(
            storage_path=tmp_path / "transcoding_tasks.json",
            capability_detector=lambda: AMD_GPU_CAPABILITIES,
        )
        return await service.get_presets_and_capabilities()

    capabilities = asyncio.run(exercise())
    presets = {preset["id"]: preset for preset in capabilities["presets"]}

    assert capabilities["hardware_acceleration_required"] is True
    assert capabilities["gpu_available"] is True
    assert capabilities["selected_gpu"]["name"] == "AMD Barcelo"
    assert presets["quality_h265"]["available"] is True
    assert presets["quality_h265"]["options"]["video_codec"] == "hevc_vaapi"
    assert presets["archive_av1"]["available"] is False
    assert "AV1" in presets["archive_av1"]["unavailable_reason"]
    assert [codec["value"] for codec in capabilities["video_codecs"]] == ["h264_vaapi", "hevc_vaapi"]


def test_background_task_is_bound_to_detected_gpu_and_never_cpu_encoder(tmp_path: Path):
    source = tmp_path / "GPU-001.mkv"
    source.write_bytes(b"original-video")
    library = FakeLibraryService({"GPU-001": source})

    async def successful_executor(task, source_path, temporary_path, progress, cancel_event):
        assert task.options.video_codec == "hevc_vaapi"
        assert task.hardware_backend == "vaapi"
        assert task.hardware_device == "/dev/dri/renderD128"
        temporary_path.write_bytes(b"gpu-video")

    async def exercise():
        service = TranscodingService(
            storage_path=tmp_path / "transcoding_tasks.json",
            library_service=library,
            executor=successful_executor,
            ffmpeg_path=sys.executable,
            capability_detector=lambda: AMD_GPU_CAPABILITIES,
        )
        await service.startup()
        try:
            created = await service.create_task(TranscodingTaskCreate(movie_id="GPU-001"))
            return await wait_for_terminal(service, created.id)
        finally:
            await service.shutdown()

    task = asyncio.run(exercise())

    assert task.status == "completed"
    assert task.options.video_codec == "hevc_vaapi"
    assert task.gpu_name == "AMD Barcelo"
    assert task.hardware_backend == "vaapi"
    assert source.read_bytes() == b"gpu-video"


def test_new_task_is_rejected_instead_of_falling_back_to_cpu_when_gpu_is_unavailable(tmp_path: Path):
    source = tmp_path / "GPU-FAIL-001.mkv"
    source.write_bytes(b"original-video")
    library = FakeLibraryService({"GPU-FAIL-001": source})
    no_gpu = {
        "ffmpeg_available": True,
        "ffprobe_available": True,
        "hardware_acceleration_required": True,
        "gpu_available": False,
        "available_encoders": [],
        "selected_gpu": None,
        "gpus": [],
    }

    async def exercise():
        service = TranscodingService(
            storage_path=tmp_path / "transcoding_tasks.json",
            library_service=library,
            executor=lambda *args: None,
            ffmpeg_path=sys.executable,
            capability_detector=lambda: no_gpu,
        )
        await service.startup()
        try:
            with pytest.raises(TranscodingUnavailableError, match="GPU"):
                await service.create_task(TranscodingTaskCreate(movie_id="GPU-FAIL-001"))
        finally:
            await service.shutdown()

    asyncio.run(exercise())


def test_successful_background_task_atomically_replaces_source_and_updates_library(tmp_path: Path):
    source = tmp_path / "ABC-123.mkv"
    source.write_bytes(b"original-video")
    library = FakeLibraryService({"ABC-123": source})

    async def successful_executor(task, source_path, temporary_path, progress, cancel_event):
        assert source_path.read_bytes() == b"original-video"
        await progress({"progress": 42.5, "speed": "1.7x", "output_size": 8})
        temporary_path.write_bytes(b"encoded-video")

    async def exercise():
        service = TranscodingService(
            storage_path=tmp_path / "transcoding_tasks.json",
            library_service=library,
            executor=successful_executor,
            max_concurrent_tasks=2,
            require_binaries=False,
        )
        await service.startup()
        try:
            created = await service.create_task(TranscodingTaskCreate(movie_id="abc-123", preset_id="quality_h265"))
            return await wait_for_terminal(service, created.id)
        finally:
            await service.shutdown()

    task = asyncio.run(exercise())

    assert task.status == "completed"
    assert task.progress == 100
    assert task.input_size == len(b"original-video")
    assert task.output_size == len(b"encoded-video")
    assert source.read_bytes() == b"encoded-video"
    assert library.updates[0][0] == "ABC-123"
    assert library.updates[0][1] == str(source.resolve())
    assert not list(tmp_path.glob(".*.javjaeger-*.mkv"))


def test_unknown_progress_metrics_do_not_fail_transcoding_task(tmp_path: Path):
    source = tmp_path / "UNKNOWN-001.mp4"
    source.write_bytes(b"original-video")
    library = FakeLibraryService({"UNKNOWN-001": source})

    async def executor_with_unknown_metrics(task, source_path, temporary_path, progress, cancel_event):
        await progress(
            {
                "progress": 0.0,
                "speed": "",
                "fps": None,
                "eta_seconds": None,
                "output_size": None,
            }
        )
        temporary_path.write_bytes(b"encoded-video")

    async def exercise():
        service = TranscodingService(
            storage_path=tmp_path / "transcoding_tasks.json",
            library_service=library,
            executor=executor_with_unknown_metrics,
            require_binaries=False,
        )
        await service.startup()
        try:
            created = await service.create_task(TranscodingTaskCreate(movie_id="UNKNOWN-001"))
            return await wait_for_terminal(service, created.id)
        finally:
            await service.shutdown()

    task = asyncio.run(exercise())

    assert task.status == "completed"
    assert task.eta_seconds == 0
    assert task.output_size == len(b"encoded-video")
    assert source.read_bytes() == b"encoded-video"


@pytest.mark.parametrize("encoded", [b"same-len", b"larger-output"])
def test_output_that_is_not_smaller_never_replaces_source(tmp_path: Path, encoded: bytes):
    source = tmp_path / "SIZE-001.mp4"
    source.write_bytes(b"original")
    library = FakeLibraryService({"SIZE-001": source})

    async def non_reducing_executor(task, source_path, temporary_path, progress, cancel_event):
        temporary_path.write_bytes(encoded)

    async def exercise():
        service = TranscodingService(
            storage_path=tmp_path / "transcoding_tasks.json",
            library_service=library,
            executor=non_reducing_executor,
            require_binaries=False,
        )
        await service.startup()
        try:
            created = await service.create_task(TranscodingTaskCreate(movie_id="SIZE-001"))
            return await wait_for_terminal(service, created.id)
        finally:
            await service.shutdown()

    task = asyncio.run(exercise())

    assert task.status == "failed"
    assert "未覆盖" in task.stage
    assert "体积未减小" in task.error
    assert task.output_size == len(encoded)
    assert source.read_bytes() == b"original"
    assert library.updates == []
    assert not list(tmp_path.glob(".*.javjaeger-*.mp4"))


def test_failed_transcode_keeps_original_and_removes_partial_output(tmp_path: Path):
    source = tmp_path / "FAIL-001.mp4"
    source.write_bytes(b"keep-me")
    library = FakeLibraryService({"FAIL-001": source})

    async def failing_executor(task, source_path, temporary_path, progress, cancel_event):
        temporary_path.write_bytes(b"partial")
        raise RuntimeError("encoder failed")

    async def exercise():
        service = TranscodingService(
            storage_path=tmp_path / "transcoding_tasks.json",
            library_service=library,
            executor=failing_executor,
            require_binaries=False,
        )
        await service.startup()
        try:
            created = await service.create_task(TranscodingTaskCreate(movie_id="FAIL-001"))
            return await wait_for_terminal(service, created.id)
        finally:
            await service.shutdown()

    task = asyncio.run(exercise())

    assert task.status == "failed"
    assert "encoder failed" in task.error
    assert source.read_bytes() == b"keep-me"
    assert library.updates == []
    assert not list(tmp_path.glob(".*.javjaeger-*.mp4"))


def test_distinct_movies_can_transcode_concurrently_and_same_source_is_rejected(tmp_path: Path):
    first_source = tmp_path / "ONE-001.mkv"
    second_source = tmp_path / "TWO-002.mkv"
    first_source.write_bytes(b"one" * 20)
    second_source.write_bytes(b"two" * 20)
    library = FakeLibraryService({"ONE-001": first_source, "TWO-002": second_source})
    both_running = asyncio.Event()
    release = asyncio.Event()
    running = 0

    async def blocking_executor(task, source_path, temporary_path, progress, cancel_event):
        nonlocal running
        running += 1
        if running == 2:
            both_running.set()
        await release.wait()
        temporary_path.write_bytes(f"encoded-{task.movie_id}".encode())

    async def exercise():
        service = TranscodingService(
            storage_path=tmp_path / "transcoding_tasks.json",
            library_service=library,
            executor=blocking_executor,
            max_concurrent_tasks=2,
            require_binaries=False,
        )
        await service.startup()
        try:
            first = await service.create_task(TranscodingTaskCreate(movie_id="ONE-001"))
            with pytest.raises(TranscodingConflictError):
                await service.create_task(TranscodingTaskCreate(movie_id="ONE-001"))
            second = await service.create_task(TranscodingTaskCreate(movie_id="TWO-002"))
            await asyncio.wait_for(both_running.wait(), timeout=1)
            assert (await service.get_task(first.id)).status == "running"
            assert (await service.get_task(second.id)).status == "running"
            release.set()
            return await asyncio.gather(
                wait_for_terminal(service, first.id),
                wait_for_terminal(service, second.id),
            )
        finally:
            release.set()
            await service.shutdown()

    first_result, second_result = asyncio.run(exercise())

    assert first_result.status == "completed"
    assert second_result.status == "completed"


def test_running_task_can_be_cancelled_without_replacing_source(tmp_path: Path):
    source = tmp_path / "STOP-001.mkv"
    source.write_bytes(b"original")
    library = FakeLibraryService({"STOP-001": source})
    executor_started = asyncio.Event()

    async def cancellable_executor(task, source_path, temporary_path, progress, cancel_event):
        temporary_path.write_bytes(b"partial-output")
        executor_started.set()
        await cancel_event.wait()

    async def exercise():
        service = TranscodingService(
            storage_path=tmp_path / "transcoding_tasks.json",
            library_service=library,
            executor=cancellable_executor,
            require_binaries=False,
        )
        await service.startup()
        try:
            created = await service.create_task(TranscodingTaskCreate(movie_id="STOP-001"))
            await asyncio.wait_for(executor_started.wait(), timeout=1)
            cancellation = await service.cancel_task(created.id)
            result = await wait_for_terminal(service, created.id)
            return cancellation, result
        finally:
            await service.shutdown()

    cancellation, result = asyncio.run(exercise())
    assert cancellation.cancel_requested is True
    assert result.status == "cancelled"
    assert source.read_bytes() == b"original"
    assert not list(tmp_path.glob(".*.javjaeger-*.mkv"))


def test_main_registers_transcoding_routes_before_proxy():
    from main import app

    paths = [getattr(route, "path", "") for route in app.routes]
    assert "/api/movies/transcoding/presets" in paths
    assert "/api/movies/transcoding/tasks" in paths
    assert "/api/movies/transcoding/tasks/{task_id}/cancel" in paths
    assert paths.index("/api/movies/transcoding/tasks") < paths.index("/api/{path:path}")
