from typing import Any, Dict, List

from pydantic import BaseModel, Field


class DownloadItem(BaseModel):
    path: str
    name: str
    is_directory: bool = False
    size: int = 0
    source_type: str = "webdav"
    pick_code: str = ""


class AddDownloadsRequest(BaseModel):
    files: List[DownloadItem] = Field(default_factory=list)
    video_filter: bool = False
    min_file_size_mb: int = 300


class MagnetDownloadRequest(BaseModel):
    magnet_links: list[str]
    movie_ids: list[str] = Field(default_factory=list)
    magnet_sources: list[str] = Field(default_factory=list)


class OperationResult(BaseModel):
    filename: str
    success: bool
    message: str
    gid: str | None = None


class ConnectionState(BaseModel):
    webdav_connected: bool
    aria2_connected: bool
    webdav_url: str | None = None
    aria2_url: str | None = None


JsonDict = Dict[str, Any]
