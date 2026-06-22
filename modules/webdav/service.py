import asyncio
import logging
from typing import Any

from modules.pan115 import service as pan115_service

from .clients import Aria2Client


logger = logging.getLogger(__name__)


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
