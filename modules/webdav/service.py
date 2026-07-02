import asyncio
import logging
from typing import Any

from modules.history.service import download_history_service, local_movie_library_service
from modules.magnets.service import get_same_source_replacement_magnet_payload
from modules.pan115 import service as pan115_service

from .clients import Aria2Client


logger = logging.getLogger(__name__)


async def dispatch_magnet_downloads_to_aria2(
    aria2_client: Aria2Client,
    magnet_links: list[str],
    movie_ids: list[str],
    magnet_sources: list[str] | None = None,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    successful_movie_ids: list[str] = []
    successful_magnet_links: list[str] = []
    successful_magnet_sources: list[str] = []

    for index, magnet_link in enumerate(magnet_links):
        movie_id = movie_ids[index] if index < len(movie_ids) else ""
        magnet_source = magnet_sources[index] if magnet_sources is not None and index < len(magnet_sources) else ""
        original_magnet_link = ""
        if movie_id and await local_movie_library_service.is_movie_present(movie_id):
            results.append(
                {
                    "movie_id": movie_id,
                    "success": False,
                    "skipped": True,
                    "reason": "already_exists",
                    "message": "影片已在本地影视库中",
                }
            )
            continue
        if movie_id and await download_history_service.is_magnet_downloaded(movie_id, magnet_link):
            replacement = await get_same_source_replacement_magnet_payload(movie_id, magnet_link, magnet_source)
            replacement_link = str((replacement or {}).get("link") or "").strip()
            if not replacement_link or replacement_link.lower() == str(magnet_link or "").strip().lower():
                results.append(
                    {
                        "movie_id": movie_id,
                        "success": False,
                        "skipped": True,
                        "reason": "magnet_already_tried",
                        "message": "磁力链接已在历史记录中",
                    }
                )
                continue
            original_magnet_link = magnet_link
            magnet_link = replacement_link
            magnet_source = str((replacement or {}).get("source") or magnet_source or "").strip().lower()
        if not magnet_link:
            results.append(
                {
                    "movie_id": movie_id,
                    "success": False,
                    "message": "磁力链接为空",
                }
            )
            continue

        try:
            gid = await asyncio.to_thread(aria2_client.add_download, magnet_link)
            result_item = {
                "movie_id": movie_id,
                "magnet": magnet_link,
                "source": magnet_source,
                "success": True,
                "gid": gid,
                "message": "已添加到 Aria2",
            }
            if original_magnet_link:
                result_item["original_magnet"] = original_magnet_link
            results.append(result_item)
            if movie_id:
                successful_movie_ids.append(movie_id)
                successful_magnet_links.append(magnet_link)
                successful_magnet_sources.append(magnet_source)
        except Exception as exc:
            logger.error("添加 Aria2 磁力链接失败: %s", exc)
            results.append(
                {
                    "movie_id": movie_id,
                    "success": False,
                    "error": "aria2_add_failed",
                    "message": "添加失败",
                }
            )

    if successful_movie_ids:
        await download_history_service.save_movies(successful_movie_ids, successful_magnet_links, successful_magnet_sources)

    return results


async def dispatch_pan115_downloads_to_aria2(
    aria2_client: Aria2Client,
    files: list[Any],
    video_filter: bool,
    min_file_size_mb: int,
) -> list[dict[str, Any]]:
    downloads, skipped = await pan115_service.resolve_download_entries_from_config(
        files,
        video_filter=video_filter,
        min_file_size_mb=min_file_size_mb,
    )

    results: list[dict[str, Any]] = []
    for item in downloads:
        try:
            options: dict[str, Any] = {"out": item.name, "user-agent": pan115_service.PAN115_DOWNLOAD_USER_AGENT}
            if item.headers:
                options["header"] = item.headers
            gid = await asyncio.to_thread(
                aria2_client.add_download,
                item.url,
                options,
            )
            results.append({"filename": item.name, "success": True, "gid": gid, "message": "添加成功"})
        except Exception as exc:
            logger.error("添加 115 文件到 Aria2 失败: %s", exc)
            results.append({"filename": item.name, "success": False, "error": "pan115_aria2_add_failed", "message": "添加失败"})

    return results + [{**item, "skipped": True} for item in skipped]
