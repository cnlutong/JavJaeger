import logging
from collections.abc import Callable
from typing import Any

import httpx

from modules.common import runtime
from modules.common.runtime import get_pan115_config
from modules.history.service import download_history_service, local_movie_library_service

from .schemas import DownloadRequest


logger = logging.getLogger(__name__)

PAN115_API_BASE_URL = "https://proapi.115.com"
PAN115_AUTH_BASE_URL = "https://passportapi.115.com"
PAN115_ADD_OFFLINE_URL = f"{PAN115_API_BASE_URL}/open/offline/add_task_urls"
PAN115_REFRESH_TOKEN_URL = f"{PAN115_AUTH_BASE_URL}/open/refreshToken"


class Pan115Error(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class Pan115Client:
    def __init__(
        self,
        access_token: str,
        refresh_token: str = "",
        on_token_refresh: Callable[[str, str], None] | None = None,
        timeout_seconds: float = 20.0,
    ) -> None:
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.on_token_refresh = on_token_refresh
        self.timeout_seconds = timeout_seconds

    async def add_offline_tasks(self, urls: list[str], save_dir_id: str = "0") -> list[dict[str, Any]]:
        if not urls:
            return []
        payload = await self._auth_request(
            PAN115_ADD_OFFLINE_URL,
            data={
                "urls": "\n".join(urls),
                "wp_path_id": save_dir_id or "0",
            },
        )
        items = payload if isinstance(payload, list) else []
        return _normalize_add_results(urls, items)

    async def _auth_request(self, url: str, data: dict[str, str], retry: bool = False) -> Any:
        headers = {"Authorization": f"Bearer {self.access_token}"}
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(url, data=data, headers=headers)
            response.raise_for_status()
            payload = response.json()

        if _is_success_payload(payload):
            return payload.get("data")

        code = payload.get("code") if isinstance(payload, dict) else None
        if not retry and self.refresh_token and _is_auth_expired_code(code):
            await self._refresh_token()
            return await self._auth_request(url, data, retry=True)

        message = str(payload.get("message") or payload.get("error") or "115 Open API request failed")
        raise Pan115Error("pan115_api_failed", message)

    async def _refresh_token(self) -> None:
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(PAN115_REFRESH_TOKEN_URL, data={"refresh_token": self.refresh_token})
            response.raise_for_status()
            payload = response.json()

        if not isinstance(payload, dict) or payload.get("code") not in (0, "0"):
            message = str(payload.get("message") if isinstance(payload, dict) else "115 token refresh failed")
            raise Pan115Error("pan115_refresh_failed", message)

        data = payload.get("data") or {}
        access_token = str(data.get("access_token") or "")
        refresh_token = str(data.get("refresh_token") or "")
        if not access_token:
            raise Pan115Error("pan115_refresh_failed", "115 token refresh response missing access_token")

        self.access_token = access_token
        if refresh_token:
            self.refresh_token = refresh_token
        if self.on_token_refresh:
            self.on_token_refresh(self.access_token, self.refresh_token)


def _is_success_payload(payload: Any) -> bool:
    return isinstance(payload, dict) and payload.get("state") is True


def _is_auth_expired_code(code: Any) -> bool:
    try:
        numeric = int(code)
    except (TypeError, ValueError):
        return False
    return numeric == 99 or 4010000 <= numeric < 4020000


def _normalize_add_results(urls: list[str], items: list[Any]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for index, url in enumerate(urls):
        item = items[index] if index < len(items) and isinstance(items[index], dict) else {}
        item_state = item.get("state")
        item_code = item.get("code")
        success = bool(item_state) and item_code in (0, "0", None)
        results.append(
            {
                "magnet": url,
                "url": item.get("url") or url,
                "success": success,
                "task_id": item.get("info_hash"),
                "info_hash": item.get("info_hash"),
                "message": item.get("message") or ("" if success else "115 offline task failed"),
                **({} if success else {"error": "pan115_add_failed"}),
            }
        )
    return results


def _resolve_credentials(request: DownloadRequest) -> tuple[str, str, str, bool]:
    config = get_pan115_config()
    use_config = bool(config.get("enabled"))
    access_token = request.access_token or (config.get("access_token") if use_config else "") or ""
    refresh_token = request.refresh_token or (config.get("refresh_token") if use_config else "") or ""
    save_dir_id = request.save_dir_id or (config.get("save_dir_id") if use_config else "") or "0"
    if not access_token:
        raise ValueError("pan115_not_configured")
    should_persist_refreshed_tokens = bool(use_config and not request.access_token and config.get("access_token"))
    return str(access_token), str(refresh_token), str(save_dir_id or "0"), should_persist_refreshed_tokens


def _persist_refreshed_tokens(access_token: str, refresh_token: str) -> None:
    updates = {"access_token": access_token}
    if refresh_token:
        updates["refresh_token"] = refresh_token
    runtime.update_config_section("pan115", updates)


async def download(request: DownloadRequest) -> dict[str, Any]:
    access_token, refresh_token, save_dir_id, should_persist_refreshed_tokens = _resolve_credentials(request)
    client = Pan115Client(
        access_token,
        refresh_token,
        on_token_refresh=_persist_refreshed_tokens if should_persist_refreshed_tokens else None,
    )

    dispatch_links: list[str] = []
    dispatch_movie_ids: list[str] = []
    results: list[dict[str, Any]] = []

    for index, magnet_link in enumerate(request.magnet_links):
        movie_id = request.movie_ids[index] if index < len(request.movie_ids) else ""
        if not magnet_link:
            results.append({"magnet": magnet_link, "success": False, "movie_id": movie_id, "error": "empty_magnet", "message": "磁力链接为空"})
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
        dispatched = await client.add_offline_tasks(dispatch_links, save_dir_id=save_dir_id)
        for index, item in enumerate(dispatched):
            movie_id = dispatch_movie_ids[index] if index < len(dispatch_movie_ids) else ""
            result_item = {**item, "movie_id": movie_id}
            results.append(result_item)
            if item.get("success") and movie_id:
                successful_movie_ids.append(movie_id)

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
