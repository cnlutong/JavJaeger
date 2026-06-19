import os
import platform
import sys

from fastapi import APIRouter

from modules.common.runtime import (
    VERSION_INFO,
    get_static_asset_version,
    build_client_config,
    build_system_config_summary,
)
from modules.history.service import download_history_service
from modules.javbus_api import javbus_api_service
from .path_browser import list_directory_payload


router = APIRouter(tags=["system"])


@router.get("/api/system/info")
async def get_system_info():
    downloaded_movies = await download_history_service.load_records()
    version_info = dict(VERSION_INFO)
    version_info["asset_version"] = get_static_asset_version()
    return {
        "version": version_info,
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


@router.get("/api/system/directories")
async def list_system_directories(path: str | None = None):
    return list_directory_payload(path)
