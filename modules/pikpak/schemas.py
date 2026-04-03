from typing import Optional

from pydantic import BaseModel


class PikPakCredentials(BaseModel):
    username: str
    password: str


class DownloadRequest(BaseModel):
    magnet_links: list[str]
    movie_ids: list[str]
    username: Optional[str] = None
    password: Optional[str] = None
