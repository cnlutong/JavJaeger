from pydantic import BaseModel, Field


class DownloadRequest(BaseModel):
    magnet_links: list[str] = Field(default_factory=list)
    movie_ids: list[str] = Field(default_factory=list)
    magnet_sources: list[str] = Field(default_factory=list)
    save_dir_id: str | None = None


class QrCodeStartRequest(BaseModel):
    app: str | None = None


class CookieSaveRequest(BaseModel):
    cookie: str
    enabled: bool = True
