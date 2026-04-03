import asyncio
import secrets
import time
from dataclasses import dataclass, field

from fastapi import Request

from .clients import Aria2Client, WebDavClient


@dataclass
class WebDavSessionState:
    webdav_client: WebDavClient | None = None
    aria2_client: Aria2Client | None = None
    webdav_url: str | None = None
    webdav_username: str | None = None
    aria2_url: str | None = None
    updated_at: float = field(default_factory=time.time)


class WebDavSessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, WebDavSessionState] = {}
        self._lock = asyncio.Lock()

    async def get_state(self, request: Request) -> WebDavSessionState:
        session_id = request.session.get("webdav_session_id")
        if not session_id:
            session_id = secrets.token_urlsafe(24)
            request.session["webdav_session_id"] = session_id

        async with self._lock:
            state = self._sessions.setdefault(session_id, WebDavSessionState())
            state.updated_at = time.time()
            return state


session_store = WebDavSessionStore()
