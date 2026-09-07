import logging
from typing import Any

from pikpakapi import PikPakApi

from modules.common.runtime import get_pikpak_config
from modules.history.service import download_history_service, local_movie_library_service
from modules.magnets.service import get_same_source_replacement_magnet_payload
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
        return {"success": False, "message": "登录失败"}


async def download(request: DownloadRequest) -> dict[str, Any]:
    try:
        credentials = resolve_credentials(request.username, request.password)
        client = PikPakApi(username=credentials.username, password=credentials.password)
        await client.login()
    except Exception:
        results = [{"movie_id": request.movie_ids[index] if index < len(request.movie_ids) else "", "magnet": link,
                    "source": request.magnet_sources[index] if index < len(request.magnet_sources) else "", "success": False,
                    "error": "pikpak_login_failed", "message": "PikPak 登录失败，请检查连接后重试"} for index, link in enumerate(request.magnet_links)]
        await download_history_service.record_dispatch_results(results, "pikpak")
        return {"success": False, "success_count": 0, "failed_count": len(results), "results": results, "message": "PikPak 登录失败"}

    results: list[dict[str, Any]] = []

    for index, magnet_link in enumerate(request.magnet_links):
        movie_id = request.movie_ids[index] if index < len(request.movie_ids) else None
        magnet_source = request.magnet_sources[index] if index < len(request.magnet_sources) else ""
        original_magnet_link = ""
        if movie_id and await local_movie_library_service.is_movie_present(movie_id):
            results.append({"magnet": magnet_link, "success": False, "skipped": True, "movie_id": movie_id, "reason": "already_exists"})
            logger.info("影片 %s 已存在，跳过 PikPak 下发", movie_id)
            continue

        if movie_id and await download_history_service.is_magnet_downloaded(movie_id, magnet_link):
            replacement = await get_same_source_replacement_magnet_payload(movie_id, magnet_link, magnet_source)
            replacement_link = str((replacement or {}).get("link") or "").strip()
            if not replacement_link or replacement_link.lower() == str(magnet_link or "").strip().lower():
                results.append({"magnet": magnet_link, "success": False, "skipped": True, "movie_id": movie_id, "reason": "magnet_already_tried"})
                logger.info("Download link for movie %s already exists in history and no replacement was found", movie_id)
                continue
            original_magnet_link = magnet_link
            magnet_link = replacement_link
            magnet_source = str((replacement or {}).get("source") or magnet_source or "").strip().lower()

        try:
            result = await client.offline_download(magnet_link)
            result_item = {
                "movie_id": movie_id,
                "magnet": magnet_link,
                "source": magnet_source,
                "success": True,
                "task_id": result.get("task", {}).get("id") if result else None,
            }
            if original_magnet_link:
                result_item["original_magnet"] = original_magnet_link
            results.append(result_item)
            logger.info("已提交 PikPak 任务: %s", movie_id)
        except Exception:
            results.append({"movie_id": movie_id, "magnet": magnet_link, "source": magnet_source, "success": False, "error": "download_dispatch_failed"})
            logger.warning("PikPak 派发失败: %s", movie_id)

    await download_history_service.record_dispatch_results(results, "pikpak")

    success_count = sum(1 for item in results if item["success"])
    skipped_count = sum(1 for item in results if item.get("skipped"))
    total_count = len(results)
    return {
        "success": success_count > 0 or skipped_count > 0,
        "success_count": success_count,
        "skipped_count": skipped_count,
        "failed_count": total_count - success_count - skipped_count,
        "message": f"成功添加 {success_count}/{total_count} 个下载任务",
        "results": results,
    }
