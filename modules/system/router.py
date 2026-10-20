import os
import hashlib
import json
import platform
import sys

from fastapi import APIRouter, HTTPException, Request, Response

from modules.common.runtime import (
    VERSION_INFO,
    get_static_asset_version,
    get_config_revision,
    etag_matches,
    build_client_config,
    build_system_config_summary,
)
from modules.history.service import download_history_service
from modules.javbus_api import javbus_api_service
from modules.common.tasks import background_tasks, job_owner
from .path_browser import list_directory_payload, list_file_entries_payload
from .settings import build_settings_payload, update_javbus_settings, update_system_settings


router = APIRouter(tags=["system"])


@router.get("/api/system/jobs")
async def list_background_jobs(request: Request):
    payload = {"tasks": background_tasks.list_tasks(job_owner(request)), "config_revision": get_config_revision()}
    etag = '"' + hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest() + '"'
    headers = {"ETag": etag, "Cache-Control": "no-cache"}
    if etag_matches(request.headers.get('if-none-match'), etag):
        return Response(status_code=304, headers=headers)
    return Response(content=json.dumps(payload), media_type='application/json', headers=headers)


@router.get("/api/system/jobs/{task_id}")
async def get_background_job(task_id: str, request: Request):
    task = background_tasks.get_task(task_id, job_owner(request))
    if task is None:
        raise HTTPException(status_code=404, detail="background_task_not_found")
    return task


@router.delete("/api/system/jobs/{task_id}")
async def dismiss_background_job(task_id: str, request: Request):
    try:
        if not background_tasks.dismiss(task_id, job_owner(request)):
            raise HTTPException(status_code=404, detail="background_task_not_found")
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"success": True}


@router.post('/api/system/jobs/{task_id}/cancel')
async def cancel_background_job(task_id: str, request: Request):
    try:
        task = background_tasks.cancel(task_id, job_owner(request))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if task is None:
        raise HTTPException(status_code=404, detail='background_task_not_found')
    return task


@router.post('/api/system/jobs/{task_id}/retry')
async def retry_background_job(task_id: str, request: Request):
    try:
        task = background_tasks.retry(task_id, job_owner(request))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if task is None:
        raise HTTPException(status_code=404, detail='background_task_not_found')
    return task


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
def list_system_directories(path: str | None = None):
    return list_directory_payload(path)


@router.get("/api/system/files")
def list_system_files(path: str | None = None):
    return list_file_entries_payload(path)


@router.get("/api/system/settings")
async def get_system_settings():
    return build_settings_payload()


@router.put("/api/system/settings")
async def put_system_settings(payload: dict):
    return await update_system_settings(payload)


@router.put("/api/system/settings/javbus")
async def put_javbus_settings(payload: dict):
    return await update_javbus_settings(payload)
