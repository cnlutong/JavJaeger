from typing import Optional

from pydantic import BaseModel


class MovieRecognitionRequest(BaseModel):
    html_content: str
    auto_download: bool = True
    username: Optional[str] = None
    password: Optional[str] = None
    magnet_source: str = "javbus"
    has_subtitle_filter: Optional[str] = None
    exclude_4k: bool = False
    allow_chinese_subtitles: Optional[bool] = None


class MovieCodeDownloadRequest(BaseModel):
    movie_codes: str
    auto_download: bool = True
    username: Optional[str] = None
    password: Optional[str] = None
    magnet_source: str = "javbus"
    has_subtitle_filter: Optional[str] = None
    exclude_4k: bool = False
    allow_chinese_subtitles: Optional[bool] = None


class BatchMoviesRequest(BaseModel):
    movie_ids: list[str]
    has_subtitle_filter: Optional[str] = None
    magnet_source: str = "javbus"
    exclude_4k: bool = False
    allow_chinese_subtitles: Optional[bool] = None
