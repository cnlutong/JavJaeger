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
    def __init__(
        self,
        ttl_seconds: float = 12 * 60 * 60,
        cleanup_interval_seconds: float = 5 * 60,
        max_sessions: int = 200,
    ) -> None:
        self._sessions: dict[str, WebDavSessionState] = {}
        self._lock = asyncio.Lock()
        self._ttl_seconds = ttl_seconds
        self._cleanup_interval_seconds = cleanup_interval_seconds
        self._max_sessions = max_sessions
        self._last_cleanup = 0.0

    async def get_state(self, request: Request) -> WebDavSessionState:
        session_id = request.session.get("webdav_session_id")
        if not session_id:
            session_id = secrets.token_urlsafe(24)
            request.session["webdav_session_id"] = session_id

        async with self._lock:
            now = time.time()
            if now - self._last_cleanup >= self._cleanup_interval_seconds:
                self._cleanup_locked(now, keep_session_id=session_id)
                self._last_cleanup = now

            state = self._sessions.setdefault(session_id, WebDavSessionState())
            state.updated_at = now
            return state

    async def close_all(self) -> None:
        async with self._lock:
            for state in self._sessions.values():
                self._close_state(state)
            self._sessions.clear()

    def _cleanup_locked(self, now: float, keep_session_id: str | None = None) -> None:
        expired_session_ids = [
            session_id
            for session_id, state in self._sessions.items()
            if session_id != keep_session_id and now - state.updated_at >= self._ttl_seconds
        ]
        for session_id in expired_session_ids:
            state = self._sessions.pop(session_id, None)
            if state:
                self._close_state(state)

        overflow = len(self._sessions) - self._max_sessions
        if overflow <= 0:
            return

        oldest_session_ids = sorted(
            (item for item in self._sessions.items() if item[0] != keep_session_id),
            key=lambda item: item[1].updated_at,
        )
        for session_id, state in oldest_session_ids[:overflow]:
            self._sessions.pop(session_id, None)
            self._close_state(state)

    def _close_state(self, state: WebDavSessionState) -> None:
        if state.webdav_client is not None:
            state.webdav_client.close()
        state.webdav_client = None
        state.aria2_client = None
        state.webdav_url = None
        state.webdav_username = None
        state.aria2_url = None


session_store = WebDavSessionStore()
