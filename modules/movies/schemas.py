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


class LocalScrapePreviewRequest(BaseModel):
    directory: str
    recursive: bool = True
    max_depth: Optional[int] = None
    scrape: bool = True
    concurrent: int = 3
    organize: bool = True
    target_directory: Optional[str] = None
    folder_template: Optional[str] = None
    naming_template: str = "{code} {title}"
    write_nfo: bool = True
    download_images: bool = True
    download_actor_images: bool = False
    download_list_thumbnail: bool = False
    overwrite_existing: bool = False


class LocalScrapeApplyItem(BaseModel):
    source_path: str
    code: Optional[str] = None
    metadata: Optional[dict] = None


class LocalScrapeApplyRequest(BaseModel):
    items: list[LocalScrapeApplyItem]
    organize: bool = True
    target_directory: Optional[str] = None
    folder_template: Optional[str] = None
    naming_template: str = "{code} {title}"
    write_nfo: bool = True
    download_images: bool = True
    download_actor_images: bool = False
    download_list_thumbnail: bool = False
    overwrite_existing: bool = False


class LocalScrapeDeleteRequest(BaseModel):
    directory: str
    source_paths: list[str]


class LocalLibraryScanRequest(BaseModel):
    directory: str
    recursive: bool = True
    max_depth: Optional[int] = None
    remove_missing: bool = True
    scrape: bool = True
    concurrent: int = 3
