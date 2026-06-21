from pydantic import BaseModel, Field


class DownloadRequest(BaseModel):
    magnet_links: list[str] = Field(default_factory=list)
    movie_ids: list[str] = Field(default_factory=list)
    access_token: str | None = None
    refresh_token: str | None = None
    save_dir_id: str | None = None

