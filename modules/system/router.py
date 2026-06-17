import os
import platform
import sys

from fastapi import APIRouter

from modules.common.runtime import (
    VERSION_INFO,
    build_client_config,
    build_system_config_summary,
)
from modules.history.service import download_history_service
from modules.javbus_api import javbus_api_service


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
        "javbus_base_url": javbus_api_service.base_url,
        "cache_size": javbus_api_service.cache_size,
        "downloaded_movies_count": len(downloaded_movies),
        "config_summary": build_system_config_summary(),
        "environment_variables": {
            "JAVBUS_BASE_URL": os.getenv("JAVBUS_BASE_URL"),
            "JAVBUS_PROXY": "***" if os.getenv("JAVBUS_PROXY") else None,
        },
    }


@router.get("/api/client-config")
async def get_client_config():
    return build_client_config()
