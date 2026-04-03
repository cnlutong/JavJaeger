import os
import platform
import sys

from fastapi import APIRouter

from modules.common.runtime import (
    JAVBUS_API_BASE_URL,
    VERSION_INFO,
    api_client,
    build_client_config,
    build_system_config_summary,
)
from modules.history.service import download_history_service


router = APIRouter(tags=["system"])


@router.get("/api/system/info")
async def get_system_info():
    downloaded_movies = await download_history_service.load_records()
    return {
        "version": VERSION_INFO,
        "python_version": sys.version,
        "platform": platform.platform(),
        "architecture": platform.architecture(),
        "hostname": platform.node(),
        "javbus_api_base_url": JAVBUS_API_BASE_URL,
        "cache_size": api_client.cache_size,
        "downloaded_movies_count": len(downloaded_movies),
        "config_summary": build_system_config_summary(),
        "environment_variables": {
            "JAVBUS_API_BASE_URL": os.getenv("JAVBUS_API_BASE_URL"),
        },
    }


@router.get("/api/client-config")
async def get_client_config():
    return build_client_config()
