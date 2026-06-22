import asyncio
import logging
import random
import time
import uuid
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx

from modules.common import runtime
from modules.common.runtime import get_pan115_config
from modules.history.service import download_history_service, local_movie_library_service

from .schemas import DownloadRequest

try:
    from p115client import P115Client
except ModuleNotFoundError:
    P115Client = None


logger = logging.getLogger(__name__)

PAN115_QRCODE_TOKEN_URL = "https://qrcodeapi.115.com/api/1.0/web/1.0/token"
PAN115_QRCODE_STATUS_URL = "https://qrcodeapi.115.com/get/status/"
PAN115_QRCODE_LOGIN_URL_TEMPLATE = "https://passportapi.115.com/app/1.0/{app}/1.0/login/qrcode"
PAN115_QRCODE_IMAGE_URL_TEMPLATE = "https://qrcodeapi.115.com/api/1.0/mac/1.0/qrcode?uid={uid}"
PAN115_STATUS_CHECK_URL = "https://my.115.com/?ct=guide&ac=status"
PAN115_OFFLINE_SPACE_URL = "https://115.com/"
PAN115_WEB_OFFLINE_URL = "https://115.com/web/lixian/"
PAN115_FILE_LIST_URL = "https://webapi.115.com/files"
PAN115_DOWNLOAD_USER_AGENT = "JavJaeger/1.0"
PAN115_LOGIN_APPS = {"web", "android", "ios", "tv", "alipaymini", "wechatmini", "qandroid"}
PAN115_DEFAULT_BATCH_SIZE = 20
PAN115_MAX_BATCH_SIZE = 50
PAN115_DEFAULT_BATCH_INTERVAL_SECONDS = 25.0
PAN115_DEFAULT_JITTER_SECONDS = 5.0
PAN115_DEFAULT_FAILURE_BACKOFF_SECONDS = [120.0, 600.0]
PAN115_DIRECTORY_CACHE_TTL_SECONDS = 120.0
PAN115_VIDEO_EXTENSIONS = {
    ".mp4",
    ".avi",
    ".mkv",
    ".mov",
    ".wmv",
    ".flv",
    ".webm",
    ".m4v",
    ".ts",
    ".mts",
    ".mpeg",
    ".mpg",
}


class Pan115Error(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Pan115Credential:
    uid: str
    cid: str
    seid: str
    kid: str = ""

    @classmethod
    def from_cookie(cls, cookie: str) -> "Pan115Credential":
        parts: dict[str, str] = {}
        for item in str(cookie or "").split(";"):
            if "=" not in item:
                continue
            key, value = item.split("=", 1)
            key = key.strip().upper()
            value = value.strip()
            if key in {"UID", "CID", "SEID", "KID"}:
                parts[key] = value
        if not parts.get("UID") or not parts.get("CID") or not parts.get("SEID"):
            raise Pan115Error("pan115_cookie_invalid", "115 cookie missing UID, CID, or SEID")
        return cls(uid=parts["UID"], cid=parts["CID"], seid=parts["SEID"], kid=parts.get("KID", ""))

    def cookie_header(self) -> str:
        values = [f"UID={self.uid}", f"CID={self.cid}", f"SEID={self.seid}"]
        if self.kid:
            values.append(f"KID={self.kid}")
        return ";".join(values)


@dataclass(frozen=True)
class QrSession:
    uid: str
    time: int
    sign: str
    qrcode: str
    app: str
    created_at: float


@dataclass(frozen=True)
class Pan115ResolvedDownload:
    name: str
    url: str
    headers: list[str]
    size: int = 0
    pick_code: str = ""


class QrSessionStore:
    def __init__(self, ttl_seconds: int = 600) -> None:
        self.ttl_seconds = ttl_seconds
        self._sessions: dict[str, QrSession] = {}

    def create(self, session: dict[str, Any], app: str) -> str:
        self._collect_expired()
        uid = str(session.get("uid") or "")
        sign = str(session.get("sign") or "")
        qrcode = str(session.get("qrcode") or "")
        try:
            qr_time = int(session.get("time"))
        except (TypeError, ValueError):
            qr_time = 0
        if not uid or not sign or not qrcode or qr_time <= 0:
            raise Pan115Error("pan115_qrcode_invalid", "115 QR code response missing required fields")
        session_id = uuid.uuid4().hex
        self._sessions[session_id] = QrSession(
            uid=uid,
            time=qr_time,
            sign=sign,
            qrcode=qrcode,
            app=normalize_login_app(app),
            created_at=time.time(),
        )
        return session_id

    def get(self, session_id: str) -> QrSession:
        self._collect_expired()
        session = self._sessions.get(session_id)
        if session is None:
            raise Pan115Error("pan115_qrcode_session_not_found", "115 QR code session not found or expired")
        return session

    def delete(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def _collect_expired(self) -> None:
        now = time.time()
        expired = [
            session_id
            for session_id, session in self._sessions.items()
            if now - session.created_at > self.ttl_seconds
        ]
        for session_id in expired:
            self._sessions.pop(session_id, None)


qr_session_store = QrSessionStore()


class Pan115DirectoryCache:
    def __init__(self) -> None:
        self._items: dict[tuple[str, str, int, int], tuple[float, dict[str, Any]]] = {}

    def get(self, key: tuple[str, str, int, int], ttl_seconds: float) -> dict[str, Any] | None:
        item = self._items.get(key)
        if item is None:
            return None
        created_at, payload = item
        if time.time() - created_at > ttl_seconds:
            self._items.pop(key, None)
            return None
        return payload

    def set(self, key: tuple[str, str, int, int], payload: dict[str, Any]) -> None:
        self._items[key] = (time.time(), payload)


directory_cache = Pan115DirectoryCache()


class Pan115Client:
    def __init__(self, cookie: str, timeout_seconds: float = 20.0) -> None:
        self.credential = Pan115Credential.from_cookie(cookie)
        self.cookie = self.credential.cookie_header()
        self.timeout_seconds = timeout_seconds

    async def check_status(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(PAN115_STATUS_CHECK_URL, headers=self._headers())
            response.raise_for_status()
            payload = response.json()
        return {
            "connected": _is_success_payload(payload),
            "uid": self.credential.uid,
            "raw_state": payload.get("state") if isinstance(payload, dict) else None,
        }

    async def add_offline_tasks(self, urls: list[str], save_dir_id: str = "0") -> list[dict[str, Any]]:
        if not urls:
            return []

        sign_payload = await self._get_offline_sign()
        data = {
            "uid": self.user_id,
            "sign": str(sign_payload["sign"]),
            "time": str(sign_payload["time"]),
            "wp_path_id": save_dir_id or "0",
        }
        for index, task_url in enumerate(urls):
            data[f"url[{index}]"] = task_url

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                PAN115_WEB_OFFLINE_URL,
                params={"ct": "lixian", "ac": "add_task_urls"},
                data=data,
                headers=self._headers(),
            )
            response.raise_for_status()
            payload = response.json()

        items = payload.get("result") if isinstance(payload, dict) else []
        if not _is_success_payload(payload) and not isinstance(items, list):
            message = str(
                payload.get("error_msg")
                or payload.get("msg")
                or payload.get("error")
                or payload.get("message")
                or "115 offline request failed"
            )
            raise Pan115Error("pan115_add_failed", message)
        if not _is_success_payload(payload) and isinstance(items, list) and not items:
            message = str(
                payload.get("error_msg")
                or payload.get("msg")
                or payload.get("error")
                or payload.get("message")
                or "115 offline request failed"
            )
            raise Pan115Error("pan115_add_failed", message)

        items = items if isinstance(items, list) else []
        if not _is_success_payload(payload) and not any(_is_existing_task_item(item) for item in items):
            message = str(
                payload.get("error_msg")
                or payload.get("msg")
                or payload.get("error")
                or payload.get("message")
                or "115 offline request failed"
            )
            raise Pan115Error("pan115_add_failed", message)

        return _normalize_add_results(urls, items)

    async def list_directory(
        self,
        cid: str = "0",
        *,
        offset: int = 0,
        limit: int = 100,
        cache_ttl_seconds: float = PAN115_DIRECTORY_CACHE_TTL_SECONDS,
    ) -> dict[str, Any]:
        normalized_cid = str(cid or "0")
        normalized_offset = max(0, int(offset))
        normalized_limit = min(max(1, int(limit)), 200)
        cache_key = (self.user_id, normalized_cid, normalized_offset, normalized_limit)
        cached = directory_cache.get(cache_key, cache_ttl_seconds)
        if cached is not None:
            return cached

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(
                PAN115_FILE_LIST_URL,
                params={
                    "aid": "1",
                    "cid": normalized_cid,
                    "o": "user_ptime",
                    "asc": "1",
                    "offset": str(normalized_offset),
                    "show_dir": "1",
                    "limit": str(normalized_limit),
                    "snap": "0",
                    "natsort": "0",
                    "record_open_time": "1",
                    "format": "json",
                    "fc_mix": "0",
                },
                headers=self._headers(),
            )
            response.raise_for_status()
            payload = response.json()

        if not _is_success_payload(payload):
            raise Pan115Error("pan115_directory_list_failed", "115 directory list failed")
        result = _normalize_directory_payload(payload)
        directory_cache.set(cache_key, result)
        return result

    async def resolve_direct_download(
        self,
        pick_code: str,
        *,
        fallback_name: str = "",
        fallback_size: int = 0,
    ) -> Pan115ResolvedDownload:
        normalized_pick_code = str(pick_code or "").strip()
        if not normalized_pick_code:
            raise Pan115Error("pan115_pick_code_required", "115 pick code is required")

        url = await self._resolve_android_download_url(normalized_pick_code)
        if not url:
            raise Pan115Error("pan115_download_url_empty", "115 download URL is empty")

        return Pan115ResolvedDownload(
            name=fallback_name or normalized_pick_code,
            url=url,
            headers=self.build_download_headers(),
            size=fallback_size,
            pick_code=normalized_pick_code,
        )

    async def _resolve_android_download_url(self, pick_code: str) -> str:
        if P115Client is None:
            raise Pan115Error("pan115_android_client_unavailable", "p115client is required for 115 large-file downloads")
        client = P115Client(self.cookie)
        url = await client.download_url(
            pick_code,
            headers={"user-agent": PAN115_DOWNLOAD_USER_AGENT},
            app="android",
            async_=True,
        )
        return str(url or "")

    async def _get_offline_sign(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(
                PAN115_OFFLINE_SPACE_URL,
                params={"ct": "offline", "ac": "space", "_": str(int(time.time() * 1000))},
                headers=self._headers(),
            )
            response.raise_for_status()
            payload = response.json()

        if not _is_success_payload(payload) or not payload.get("sign") or not payload.get("time"):
            message = str(
                payload.get("error_msg")
                or payload.get("msg")
                or payload.get("error")
                or "115 offline sign request failed"
            )
            raise Pan115Error("pan115_offline_sign_failed", message)
        return payload

    def _headers(self) -> dict[str, str]:
        return {
            "Cookie": self.cookie,
            "User-Agent": "Mozilla/5.0 JavJaeger/1.0",
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://115.com/?tab=offline&mode=wangpan",
        }

    def build_download_headers(self) -> list[str]:
        headers = self._headers()
        return [
            f"Cookie: {headers['Cookie']}",
            f"User-Agent: {headers['User-Agent']}",
            f"Referer: {headers['Referer']}",
        ]

    @property
    def user_id(self) -> str:
        return self.credential.uid.split("_", 1)[0]


def normalize_login_app(app: str | None) -> str:
    value = str(app or "").strip().lower()
    if not value:
        return "wechatmini"
    if value not in PAN115_LOGIN_APPS:
        raise Pan115Error("pan115_login_app_unsupported", "unsupported 115 QR login app")
    return value


def build_qrcode_image_url(uid: str) -> str:
    return PAN115_QRCODE_IMAGE_URL_TEMPLATE.format(uid=quote(str(uid), safe=""))


async def start_qrcode() -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(PAN115_QRCODE_TOKEN_URL, headers={"Accept": "application/json"})
        response.raise_for_status()
        payload = response.json()

    if not isinstance(payload, dict) or int(payload.get("state") or 0) != 1:
        message = str(payload.get("message") if isinstance(payload, dict) else "115 QR code request failed")
        raise Pan115Error("pan115_qrcode_start_failed", message)
    data = payload.get("data") or {}
    if not isinstance(data, dict):
        raise Pan115Error("pan115_qrcode_start_failed", "115 QR code response missing data")
    return data


async def create_qrcode_session(app: str | None = None) -> dict[str, Any]:
    login_app = normalize_login_app(app)
    session = await start_qrcode()
    session_id = qr_session_store.create(session, login_app)
    uid = str(session.get("uid") or "")
    return {
        "session_id": session_id,
        "qrcode": str(session.get("qrcode") or ""),
        "qrcode_image_url": build_qrcode_image_url(uid),
        "status": 0,
        "state": "waiting",
        "app": login_app,
    }


async def check_qrcode_status(session: QrSession) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            PAN115_QRCODE_STATUS_URL,
            params={
                "uid": session.uid,
                "time": str(session.time),
                "sign": session.sign,
                "_": str(int(time.time() * 1000)),
            },
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        payload = response.json()

    if not isinstance(payload, dict) or int(payload.get("state") or 0) != 1:
        message = str(payload.get("message") if isinstance(payload, dict) else "115 QR code status failed")
        raise Pan115Error("pan115_qrcode_status_failed", message)
    data = payload.get("data") or {}
    if not isinstance(data, dict):
        raise Pan115Error("pan115_qrcode_status_failed", "115 QR code status missing data")

    status = int(data.get("status") or 0)
    return {
        "status": status,
        "state": _qrcode_state_name(status),
        "message": str(data.get("msg") or ""),
    }


async def login_qrcode(session: QrSession) -> str:
    app = normalize_login_app(session.app)
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            PAN115_QRCODE_LOGIN_URL_TEMPLATE.format(app=app),
            data={"account": session.uid, "app": app},
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        payload = response.json()

    if not isinstance(payload, dict) or int(payload.get("state") or 0) != 1:
        message = str(payload.get("message") if isinstance(payload, dict) else "115 QR code login failed")
        raise Pan115Error("pan115_qrcode_login_failed", message)
    data = payload.get("data") or {}
    credential = data.get("cookie") if isinstance(data, dict) else None
    if not isinstance(credential, dict):
        raise Pan115Error("pan115_qrcode_login_failed", "115 QR code login response missing cookie")
    cookie = _credential_to_cookie(credential)
    Pan115Credential.from_cookie(cookie)
    return cookie


async def get_qrcode_session_status(session_id: str) -> dict[str, Any]:
    session = qr_session_store.get(session_id)
    status_payload = await check_qrcode_status(session)
    if int(status_payload.get("status") or 0) == 2:
        cookie = await login_qrcode(session)
        runtime.update_config_section(
            "pan115",
            {
                "enabled": True,
                "cookie": cookie,
                "login_app": normalize_login_app(session.app),
            },
        )
        qr_session_store.delete(session_id)
        return {**status_payload, "configured": True}
    return {**status_payload, "configured": bool(get_pan115_config().get("cookie"))}


async def get_status() -> dict[str, Any]:
    config = get_pan115_config()
    enabled = bool(config.get("enabled"))
    cookie = str(config.get("cookie") or "")
    save_dir_id = str(config.get("save_dir_id") or "0")
    login_app = normalize_login_app(config.get("login_app"))
    payload = {
        "enabled": enabled,
        "configured": bool(enabled and cookie),
        "connected": False,
        "has_cookie": bool(cookie),
        "save_dir_id": save_dir_id,
        "login_app": login_app,
    }
    if not enabled or not cookie:
        return payload
    try:
        status = await Pan115Client(cookie).check_status()
    except Exception:
        return payload
    return {**payload, **status}


async def list_directory_from_config(cid: str = "0", offset: int = 0, limit: int = 100) -> dict[str, Any]:
    config = get_pan115_config()
    if not config.get("enabled") or not config.get("cookie"):
        raise ValueError("pan115_not_configured")
    return await Pan115Client(str(config.get("cookie"))).list_directory(cid, offset=offset, limit=limit)


async def resolve_download_entries_from_config(
    entries: list[Any],
    video_filter: bool = False,
    min_file_size_mb: int = 300,
) -> tuple[list[Pan115ResolvedDownload], list[dict[str, Any]]]:
    config = get_pan115_config()
    if not config.get("enabled") or not config.get("cookie"):
        raise ValueError("pan115_not_configured")
    client = Pan115Client(str(config.get("cookie")))
    return await _resolve_download_entries(client, entries, video_filter, min_file_size_mb)


def save_cookie(cookie: str, enabled: bool = True) -> dict[str, Any]:
    credential = Pan115Credential.from_cookie(cookie)
    updates = runtime.update_config_section(
        "pan115",
        {
            "enabled": bool(enabled),
            "cookie": credential.cookie_header(),
        },
    )
    return {
        "enabled": bool(updates.get("enabled")),
        "configured": bool(updates.get("enabled") and updates.get("cookie")),
        "has_cookie": bool(updates.get("cookie")),
        "save_dir_id": updates.get("save_dir_id") or "0",
        "login_app": normalize_login_app(updates.get("login_app")),
    }


def _credential_to_cookie(credential: dict[str, Any]) -> str:
    values = []
    for key in ("UID", "CID", "SEID", "KID"):
        value = credential.get(key) or credential.get(key.lower())
        if value:
            values.append(f"{key}={value}")
    return ";".join(values)


def _is_success_payload(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    state = payload.get("state")
    return state is True or state == 1 or state == "1" or str(state).lower() == "true"


def _qrcode_state_name(status: int) -> str:
    return {
        0: "waiting",
        1: "scanned",
        2: "allowed",
        -1: "expired",
        -2: "canceled",
    }.get(status, "unknown")


def _is_existing_task_item(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    try:
        errcode = int(item.get("errcode") or 0)
    except (TypeError, ValueError):
        errcode = 0
    return errcode == 10008 and bool(item.get("info_hash") or item.get("hash"))


def _normalize_add_results(urls: list[str], items: list[Any]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for index, url in enumerate(urls):
        item = items[index] if index < len(items) and isinstance(items[index], dict) else {}
        info_hash = item.get("info_hash") or item.get("hash")
        success = bool(item.get("state")) or _is_existing_task_item(item)
        results.append(
            {
                "magnet": url,
                "url": item.get("url") or url,
                "success": success,
                "task_id": info_hash,
                "info_hash": info_hash,
                "message": item.get("message") or item.get("error_msg") or ("" if success else "115 offline task failed"),
                **({} if success else {"error": "pan115_add_failed"}),
            }
        )
    return results


def _normalize_directory_payload(payload: dict[str, Any]) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    for item in payload.get("data") or []:
        if not isinstance(item, dict):
            continue
        is_folder = "cid" in item and str(item.get("fc")) == "0"
        entries.append(
            {
                "id": str(item.get("cid") or item.get("fid") or ""),
                "parent_id": str(item.get("pid") or ""),
                "name": str(item.get("n") or ""),
                "kind": "folder" if is_folder else str(item.get("ico") or "file"),
                "size": item.get("s") or "",
                "pick_code": "" if is_folder else str(item.get("pc") or item.get("pick_code") or ""),
            }
        )
    return {
        "cid": str(payload.get("cid") or "0"),
        "count": payload.get("count") or len(entries),
        "items": entries,
    }


def _extract_download_url(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    direct = payload.get("file_url")
    if direct:
        return str(direct)
    data = payload.get("data")
    if isinstance(data, dict):
        if data.get("file_url"):
            return str(data["file_url"])
        url_payload = data.get("url")
        if isinstance(url_payload, dict) and url_payload.get("url"):
            return str(url_payload["url"])
    if isinstance(data, list) and data:
        return _extract_download_url(data[0])
    for value in payload.values():
        if isinstance(value, dict) and value.get("url"):
            url_payload = value.get("url")
            if isinstance(url_payload, dict) and url_payload.get("url"):
                return str(url_payload["url"])
    return ""


def _extract_download_name(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    for key in ("file_name", "name", "n"):
        if payload.get(key):
            return str(payload[key])
    data = payload.get("data")
    if isinstance(data, dict):
        return _extract_download_name(data)
    if isinstance(data, list) and data:
        return _extract_download_name(data[0])
    for value in payload.values():
        if isinstance(value, dict):
            name = _extract_download_name(value)
            if name:
                return name
    return ""


def _extract_download_size(payload: Any) -> int:
    if not isinstance(payload, dict):
        return 0
    for key in ("file_size", "size", "s"):
        if payload.get(key) is not None:
            try:
                return int(float(payload[key]))
            except (TypeError, ValueError):
                return 0
    data = payload.get("data")
    if isinstance(data, dict):
        return _extract_download_size(data)
    if isinstance(data, list) and data:
        return _extract_download_size(data[0])
    for value in payload.values():
        if isinstance(value, dict):
            size = _extract_download_size(value)
            if size:
                return size
    return 0


def _legacy_web_download_requires_client(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    msg = str(payload.get("msg") or payload.get("message") or "")
    try:
        msg_code = int(payload.get("msg_code") or 0)
    except (TypeError, ValueError):
        msg_code = 0
    return msg_code == 50028 or "文件大小超出限制" in msg or "115电脑端" in msg


def _entry_value(entry: Any, name: str, default: Any = None) -> Any:
    if isinstance(entry, dict):
        return entry.get(name, default)
    return getattr(entry, name, default)


def _is_video_file(filename: str) -> bool:
    if not filename:
        return False
    return any(str(filename).lower().endswith(extension) for extension in PAN115_VIDEO_EXTENSIONS)


async def _resolve_download_entries(
    client: Pan115Client,
    entries: list[Any],
    video_filter: bool,
    min_file_size_mb: int,
) -> tuple[list[Pan115ResolvedDownload], list[dict[str, Any]]]:
    downloads: list[Pan115ResolvedDownload] = []
    skipped: list[dict[str, Any]] = []
    min_bytes = max(0, int(min_file_size_mb or 0)) * 1024 * 1024

    for entry in entries:
        name = str(_entry_value(entry, "name", "") or "")
        path = str(_entry_value(entry, "path", "") or "")
        is_directory = bool(_entry_value(entry, "is_directory", False))
        pick_code = str(_entry_value(entry, "pick_code", "") or "")
        try:
            size = int(float(_entry_value(entry, "size", 0) or 0))
        except (TypeError, ValueError):
            size = 0

        if is_directory:
            child_payload = await client.list_directory(path)
            child_downloads, child_skipped = await _resolve_download_entries(
                client,
                [
                    {
                        "name": item.get("name") or "",
                        "path": item.get("id") or "",
                        "is_directory": item.get("kind") == "folder",
                        "size": item.get("size") or 0,
                        "pick_code": item.get("pick_code") or "",
                    }
                    for item in child_payload.get("items") or []
                ],
                video_filter,
                min_file_size_mb,
            )
            downloads.extend(child_downloads)
            skipped.extend(child_skipped)
            continue

        if video_filter and (not _is_video_file(name) or size < min_bytes):
            skipped.append(
                {
                    "filename": name,
                    "success": False,
                    "message": f"不符合视频文件筛选条件（非视频文件或小于{min_file_size_mb}MB）",
                }
            )
            continue

        if not pick_code:
            skipped.append({"filename": name, "success": False, "message": "115 文件缺少 pick_code"})
            continue

        downloads.append(await client.resolve_direct_download(pick_code, fallback_name=name, fallback_size=size))

    return downloads, skipped


def _resolve_credentials(request: DownloadRequest) -> tuple[str, str, int, float, float, list[float]]:
    config = get_pan115_config()
    use_config = bool(config.get("enabled"))
    cookie = str((config.get("cookie") if use_config else "") or "")
    save_dir_id = request.save_dir_id or (config.get("save_dir_id") if use_config else "") or "0"
    if not cookie:
        raise ValueError("pan115_not_configured")
    return (
        cookie,
        str(save_dir_id or "0"),
        _normalize_batch_size(config.get("batch_size")),
        _normalize_batch_interval(config.get("batch_interval_seconds")),
        _normalize_jitter_seconds(config.get("jitter_seconds")),
        _normalize_failure_backoff(config.get("failure_backoff_seconds")),
    )


def _normalize_batch_size(value: Any) -> int:
    try:
        batch_size = int(float(value))
    except (TypeError, ValueError):
        return PAN115_DEFAULT_BATCH_SIZE
    if batch_size < 1:
        return 1
    return min(batch_size, PAN115_MAX_BATCH_SIZE)


def _normalize_batch_interval(value: Any) -> float:
    try:
        interval = float(value)
    except (TypeError, ValueError):
        return PAN115_DEFAULT_BATCH_INTERVAL_SECONDS
    return max(0.0, min(interval, 300.0))


def _normalize_jitter_seconds(value: Any) -> float:
    try:
        jitter = float(value)
    except (TypeError, ValueError):
        return PAN115_DEFAULT_JITTER_SECONDS
    return max(0.0, min(jitter, 60.0))


def _normalize_failure_backoff(value: Any) -> list[float]:
    if not isinstance(value, list):
        return list(PAN115_DEFAULT_FAILURE_BACKOFF_SECONDS)
    backoff: list[float] = []
    for item in value[:5]:
        try:
            seconds = float(item)
        except (TypeError, ValueError):
            continue
        if seconds >= 0:
            backoff.append(min(seconds, 3600.0))
    return backoff or list(PAN115_DEFAULT_FAILURE_BACKOFF_SECONDS)


def _chunk_pairs(links: list[str], movie_ids: list[str], batch_size: int) -> list[tuple[list[str], list[str]]]:
    chunks: list[tuple[list[str], list[str]]] = []
    for start in range(0, len(links), max(1, batch_size)):
        chunks.append((links[start : start + batch_size], movie_ids[start : start + batch_size]))
    return chunks


def _dedupe_key(magnet_link: str) -> str:
    return str(magnet_link or "").strip().lower()


def _next_batch_delay(base_interval: float, jitter_seconds: float) -> float:
    if base_interval <= 0:
        return 0.0
    jitter = random.uniform(-jitter_seconds, jitter_seconds) if jitter_seconds > 0 else 0.0
    return max(0.0, base_interval + jitter)


async def _dispatch_chunk_with_retries(
    client: Pan115Client,
    chunk_links: list[str],
    save_dir_id: str,
    failure_backoff_seconds: list[float],
) -> list[dict[str, Any]]:
    attempt = 0
    while True:
        try:
            return await client.add_offline_tasks(chunk_links, save_dir_id=save_dir_id)
        except Pan115Error:
            if attempt >= len(failure_backoff_seconds):
                raise
            await asyncio.sleep(failure_backoff_seconds[attempt])
            attempt += 1


async def download(request: DownloadRequest, progress_callback=None) -> dict[str, Any]:
    cookie, save_dir_id, batch_size, batch_interval_seconds, jitter_seconds, failure_backoff_seconds = _resolve_credentials(request)
    client = Pan115Client(cookie)

    dispatch_links: list[str] = []
    dispatch_movie_ids: list[str] = []
    results: list[dict[str, Any]] = []

    for index, magnet_link in enumerate(request.magnet_links):
        movie_id = request.movie_ids[index] if index < len(request.movie_ids) else ""
        if not magnet_link:
            results.append({"magnet": magnet_link, "success": False, "movie_id": movie_id, "error": "empty_magnet", "message": "磁力链接为空"})
            continue
        key = _dedupe_key(magnet_link)
        if any(_dedupe_key(link) == key for link in dispatch_links):
            results.append({"magnet": magnet_link, "success": False, "skipped": True, "movie_id": movie_id, "reason": "duplicate_magnet"})
            continue
        if movie_id and (
            await download_history_service.is_movie_downloaded(movie_id)
            or await local_movie_library_service.is_movie_present(movie_id)
        ):
            results.append({"magnet": magnet_link, "success": False, "skipped": True, "movie_id": movie_id, "reason": "already_exists"})
            logger.info("影片 %s 已存在，跳过 115 网盘下发", movie_id)
            continue
        dispatch_links.append(magnet_link)
        dispatch_movie_ids.append(movie_id)

    successful_movie_ids: list[str] = []
    if dispatch_links:
        chunks = _chunk_pairs(dispatch_links, dispatch_movie_ids, batch_size)
        for chunk_index, (chunk_links, chunk_movie_ids) in enumerate(chunks):
            if chunk_index > 0 and batch_interval_seconds > 0:
                await asyncio.sleep(_next_batch_delay(batch_interval_seconds, jitter_seconds))
            dispatched = await _dispatch_chunk_with_retries(client, chunk_links, save_dir_id, failure_backoff_seconds)
            for index, item in enumerate(dispatched):
                movie_id = chunk_movie_ids[index] if index < len(chunk_movie_ids) else ""
                result_item = {**item, "movie_id": movie_id}
                results.append(result_item)
                if item.get("success") and movie_id:
                    successful_movie_ids.append(movie_id)
            if progress_callback:
                await progress_callback(
                    {
                        "completed_count": len(results),
                        "total_count": len(request.magnet_links),
                        "current_batch": chunk_index + 1,
                        "total_batches": len(chunks),
                    }
                )

    if successful_movie_ids:
        await download_history_service.save_movies(successful_movie_ids)

    success_count = sum(1 for item in results if item.get("success"))
    skipped_count = sum(1 for item in results if item.get("skipped"))
    total_count = len(results)
    return {
        "success": success_count > 0 or skipped_count > 0,
        "success_count": success_count,
        "skipped_count": skipped_count,
        "message": f"成功添加 {success_count}/{total_count} 个 115 离线任务",
        "results": results,
    }


class Pan115DownloadJobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, dict[str, Any]] = {}

    def submit(self, request: DownloadRequest) -> dict[str, Any]:
        job_id = uuid.uuid4().hex
        snapshot = {
            "job_id": job_id,
            "status": "queued",
            "total_count": len(request.magnet_links),
            "completed_count": 0,
            "current_batch": 0,
            "total_batches": 0,
            "result": None,
            "error": "",
            "created_at": time.time(),
            "updated_at": time.time(),
        }
        self._jobs[job_id] = snapshot
        asyncio.create_task(self._run(job_id, request))
        return self.get(job_id)

    def get(self, job_id: str) -> dict[str, Any]:
        snapshot = self._jobs.get(job_id)
        if snapshot is None:
            raise Pan115Error("pan115_job_not_found", "115 download job not found")
        return dict(snapshot)

    async def _run(self, job_id: str, request: DownloadRequest) -> None:
        snapshot = self._jobs[job_id]
        snapshot["status"] = "running"
        snapshot["updated_at"] = time.time()

        async def update_progress(progress: dict[str, Any]) -> None:
            snapshot.update(progress)
            snapshot["updated_at"] = time.time()

        try:
            result = await download(request, progress_callback=update_progress)
            snapshot["result"] = result
            snapshot["completed_count"] = len(result.get("results") or [])
            snapshot["status"] = "completed" if result.get("success") else "failed"
        except Exception as exc:
            snapshot["status"] = "failed"
            snapshot["error"] = getattr(exc, "code", "") or str(exc)
        finally:
            snapshot["updated_at"] = time.time()


download_job_manager = Pan115DownloadJobManager()


def submit_download_job(request: DownloadRequest) -> dict[str, Any]:
    return download_job_manager.submit(request)


def get_download_job(job_id: str) -> dict[str, Any]:
    return download_job_manager.get(job_id)
