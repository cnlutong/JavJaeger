import logging
from typing import Any

from pikpakapi import PikPakApi

from modules.common.runtime import get_pikpak_config
from modules.history.service import download_history_service
from .schemas import DownloadRequest, PikPakCredentials


logger = logging.getLogger(__name__)


def resolve_credentials(username: str | None = None, password: str | None = None) -> PikPakCredentials:
    config = get_pikpak_config()
    use_config = bool(config.get("enabled"))
    resolved_username = username or (config.get("username") if use_config else "") or ""
    resolved_password = password or (config.get("password") if use_config else "") or ""
    if not resolved_username or not resolved_password:
        raise ValueError("未配置 PikPak 账号，请在 config.json 中填写 pikpak.username 和 pikpak.password，或手动登录")
    return PikPakCredentials(username=resolved_username, password=resolved_password)


async def login(credentials: PikPakCredentials | None = None) -> dict[str, Any]:
    resolved = credentials or resolve_credentials()
    try:
        client = PikPakApi(username=resolved.username, password=resolved.password)
        await client.login()
        logger.info("PikPak登录成功: %s", resolved.username)
        return {"success": True, "message": "登录成功", "username": resolved.username}
    except Exception as exc:
        logger.error("PikPak登录失败: %s", exc)
        return {"success": False, "message": f"登录失败: {exc}"}


async def download(request: DownloadRequest) -> dict[str, Any]:
    credentials = resolve_credentials(request.username, request.password)
    client = PikPakApi(username=credentials.username, password=credentials.password)
    await client.login()

    results: list[dict[str, Any]] = []
    successful_movie_ids: list[str] = []

    for index, magnet_link in enumerate(request.magnet_links):
        try:
            result = await client.offline_download(magnet_link)
            results.append(
                {
                    "magnet": magnet_link,
                    "success": True,
                    "task_id": result.get("task", {}).get("id") if result else None,
                }
            )
            if index < len(request.movie_ids):
                successful_movie_ids.append(request.movie_ids[index])
            logger.info("成功添加下载任务: %s...", magnet_link[:50])
        except Exception as exc:
            results.append({"magnet": magnet_link, "success": False, "error": str(exc)})
            logger.error("添加下载任务失败: %s... - %s", magnet_link[:50], exc)

    if successful_movie_ids:
        await download_history_service.save_movies(successful_movie_ids)

    success_count = sum(1 for item in results if item["success"])
    total_count = len(results)
    return {
        "success": success_count > 0,
        "message": f"成功添加 {success_count}/{total_count} 个下载任务",
        "results": results,
    }
