from typing import Optional

from pydantic import BaseModel, Field


class PikPakCredentials(BaseModel):
    username: str
    password: str


class DownloadRequest(BaseModel):
    magnet_links: list[str] = Field(default_factory=list)
    movie_ids: list[str] = Field(default_factory=list)
    magnet_sources: list[str] = Field(default_factory=list)
    username: Optional[str] = None
    password: Optional[str] = None
