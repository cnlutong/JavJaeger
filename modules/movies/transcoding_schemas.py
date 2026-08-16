from typing import Literal

from pydantic import BaseModel, Field


TranscodingStatus = Literal["queued", "running", "completed", "failed", "cancelled"]


class TranscodingOptionsOverride(BaseModel):
    video_codec: str | None = None
    quality_mode: Literal["crf", "bitrate"] | None = None
    crf: int | None = Field(default=None, ge=0, le=51)
    video_bitrate_kbps: int | None = Field(default=None, ge=100, le=200000)
    speed_preset: str | None = None
    tune: str | None = None
    max_height: int | None = Field(default=None, ge=240, le=4320)
    frame_rate: int | None = Field(default=None, ge=1, le=120)
    pixel_format: str | None = None
    audio_codec: str | None = None
    audio_bitrate_kbps: int | None = Field(default=None, ge=32, le=1536)
    audio_channels: int | None = Field(default=None, ge=1, le=8)
    copy_subtitles: bool | None = None
    copy_metadata: bool | None = None
    deinterlace: bool | None = None


class TranscodingOptions(BaseModel):
    video_codec: str
    quality_mode: Literal["crf", "bitrate"]
    crf: int
    video_bitrate_kbps: int | None = None
    speed_preset: str
    tune: str | None = None
    max_height: int | None = None
    frame_rate: int | None = None
    pixel_format: str
    audio_codec: str
    audio_bitrate_kbps: int | None = None
    audio_channels: int | None = None
    copy_subtitles: bool
    copy_metadata: bool
    deinterlace: bool


class TranscodingPreset(BaseModel):
    id: str
    name: str
    description: str
    category: str
    options: TranscodingOptions


class TranscodingTaskCreate(BaseModel):
    movie_id: str
    file_index: int = Field(default=0, ge=0)
    preset_id: str = "quality_h265"
    options: TranscodingOptionsOverride = Field(default_factory=TranscodingOptionsOverride)


class TranscodingTask(BaseModel):
    id: str
    movie_id: str
    movie_title: str = ""
    file_index: int
    source_path: str
    file_name: str
    preset_id: str
    preset_name: str
    options: TranscodingOptions
    status: TranscodingStatus = "queued"
    progress: float = 0.0
    stage: str = "等待执行"
    speed: str = ""
    fps: float | None = None
    eta_seconds: int | None = None
    elapsed_seconds: int = 0
    input_size: int = 0
    output_size: int = 0
    cancel_requested: bool = False
    created_at: str
    started_at: str | None = None
    completed_at: str | None = None
    error: str = ""


class TranscodingTaskList(BaseModel):
    success: bool = True
    tasks: list[TranscodingTask]
    counts: dict[str, int]
    max_concurrent_tasks: int
