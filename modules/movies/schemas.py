from typing import Optional, Literal

from pydantic import BaseModel, Field


class SearchMovieSummary(BaseModel):
    id: str
    title: str | None = ''
    img: str | None = ''
    date: str | None = ''
    gid: str | int | None = None
    uc: str | int | None = None


class SearchEnrichmentRequest(BaseModel):
    movies: list[SearchMovieSummary] = Field(default_factory=list)
    source: Literal['javbus', 'cilisousuo', 'yhg007'] = 'javbus'
    mode: Literal['code', 'filter', 'recognize', 'magnet'] = 'filter'
    has_subtitle_filter: str | None = None
    exclude_4k: bool = False
    sort_by: str = 'size'
    sort_order: str = 'desc'
    all_pages: bool = False
    query: dict[str, str] = Field(default_factory=dict)
    has_next_page: bool = False


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
    code_overrides: dict[str, str] = {}
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
    download_sample_images: bool = False
    download_actor_images: bool = False
    download_list_thumbnail: bool = False
    overwrite_existing: bool = False


class LocalScrapeApplyItem(BaseModel):
    source_path: str
    target_video_path: Optional[str] = None
    code: Optional[str] = None
    metadata: Optional[dict] = None
    conflict_resolution: Optional[str] = None


class LocalScrapeApplyRequest(BaseModel):
    items: list[LocalScrapeApplyItem]
    organize: bool = True
    target_directory: Optional[str] = None
    folder_template: Optional[str] = None
    naming_template: str = "{code} {title}"
    write_nfo: bool = True
    download_images: bool = True
    download_sample_images: bool = False
    download_actor_images: bool = False
    download_list_thumbnail: bool = False
    overwrite_existing: bool = False


class LocalScrapeDeleteRequest(BaseModel):
    directory: str
    source_paths: list[str]


class LocalLibraryScanRequest(BaseModel):
    directory: Optional[str] = None
    directories: Optional[list[str]] = None
    ignored_paths: Optional[list[str]] = None
    recursive: bool = True
    max_depth: Optional[int] = None
    remove_missing: bool = True
    scrape: bool = False
    probe_media: bool = False
    regularize_files: bool = False
    concurrent: int = 3


class LocalLibrarySettingsRequest(BaseModel):
    source_directory: Optional[str] = None
    directories: Optional[list[str]] = None
    ignored_paths: Optional[list[str]] = None


class LocalLibraryInformationDownloadRequest(BaseModel):
    movie_ids: Optional[list[str]] = None
    fields: Optional[list[str]] = None
    only_missing: bool = True
    concurrent: int = 3
    write_nfo: bool = True
    download_images: bool = True
    download_sample_images: bool = False
    download_actor_images: bool = False
    download_list_thumbnail: bool = False
    overwrite_existing: bool = False


class MetadataScraperTestRequest(BaseModel):
    providers: Optional[list[str]] = None
    movie_ids: Optional[dict[str, str]] = None
    concurrent: int = 3
    apply_results: bool = False


class MetadataScraperApplyTestResultsRequest(BaseModel):
    results: list[dict]
