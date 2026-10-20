import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Form, HTTPException, Request

from modules.common.runtime import get_aria2_config, get_webdav_config
from .clients import Aria2Client, WebDavClient
from .schemas import AddDownloadsRequest, MagnetDownloadRequest
from .service import dispatch_magnet_downloads_to_aria2, dispatch_files_to_aria2, file_dispatch_runner
from .session_state import session_store
from modules.common.tasks import submit_background_task


logger = logging.getLogger(__name__)

router = APIRouter(tags=["webdav"])

async def establish_webdav_connection(
    request: Request,
    webdav_url: str,
    username: str = "",
    password: str = "",
) -> dict[str, Any]:
    state = await session_store.get_state(request)
    client: WebDavClient | None = None
    try:
        client = WebDavClient(webdav_url, username, password)
        await asyncio.to_thread(client.list_directory, "/")
        old_client = state.webdav_client
        state.webdav_client = client
        state.webdav_url = webdav_url
        state.webdav_username = username or None
        if old_client is not None and old_client is not client:
            old_client.close()
        return {"success": True, "message": "WebDAV连接成功"}
    except Exception as exc:
        if client is not None:
            client.close()
        state.webdav_client = None
        state.webdav_url = None
        state.webdav_username = None
        logger.error("WebDAV连接失败: %s", exc)
        return {"success": False, "error": "webdav_connect_failed", "message": "WebDAV连接失败"}


async def establish_aria2_connection(request: Request, aria2_url: str, aria2_secret: str = "") -> dict[str, Any]:
    state = await session_store.get_state(request)
    try:
        client = Aria2Client(aria2_url, aria2_secret)
        connected = await asyncio.to_thread(client.test_connection)
        if not connected:
            state.aria2_client = None
            state.aria2_url = None
            return {"success": False, "message": "Aria2连接失败"}

        state.aria2_client = client
        state.aria2_url = aria2_url
        return {"success": True, "message": "Aria2连接成功"}
    except Exception as exc:
        state.aria2_client = None
        state.aria2_url = None
        logger.error("Aria2连接失败: %s", exc)
        return {"success": False, "error": "aria2_connect_failed", "message": "Aria2连接失败"}


@router.post("/api/webdav/connect")
async def connect_webdav(
    request: Request,
    webdav_url: str = Form(...),
    username: str = Form(""),
    password: str = Form(""),
):
    return await establish_webdav_connection(request, webdav_url, username, password)


@router.post("/api/webdav/connect-config")
async def connect_webdav_with_config(request: Request):
    config = get_webdav_config()
    if not config.get("enabled"):
        return {"success": False, "message": "config.json 中未启用 webdav.enabled"}
    if not config.get("url"):
        return {"success": False, "message": "config.json 中未配置 webdav.url"}
    return await establish_webdav_connection(
        request,
        config["url"],
        config.get("username", ""),
        config.get("password", ""),
    )


@router.post("/api/aria2/connect")
async def connect_aria2(
    request: Request,
    aria2_url: str = Form(...),
    aria2_secret: str = Form(""),
):
    return await establish_aria2_connection(request, aria2_url, aria2_secret)


@router.post("/api/aria2/connect-config")
async def connect_aria2_with_config(request: Request):
    config = get_aria2_config()
    if not config.get("enabled"):
        return {"success": False, "message": "config.json 中未启用 aria2.enabled"}
    if not config.get("url"):
        return {"success": False, "message": "config.json 中未配置 aria2.url"}
    return await establish_aria2_connection(
        request,
        config["url"],
        config.get("secret", ""),
    )


@router.get("/api/webdav/status")
async def get_connection_status(request: Request):
    state = await session_store.get_state(request)
    webdav_connected = state.webdav_client is not None
    if webdav_connected:
        try:
            await asyncio.to_thread(state.webdav_client.list_directory, "/")
        except Exception as exc:
            logger.warning("WebDAV状态检查失败，已重置连接: %s", exc)
            state.webdav_client = None
            state.webdav_url = None
            state.webdav_username = None
            webdav_connected = False

    aria2_connected = False
    if state.aria2_client is not None:
        aria2_connected = await asyncio.to_thread(state.aria2_client.test_connection)
        if not aria2_connected:
            state.aria2_client = None
            state.aria2_url = None

    return {
        "webdav_connected": webdav_connected,
        "aria2_connected": aria2_connected,
        "webdav_url": state.webdav_url,
        "webdav_username": state.webdav_username,
        "aria2_url": state.aria2_url,
    }


@router.get("/api/webdav/files")
async def list_files(request: Request, path: str = "/"):
    state = await session_store.get_state(request)
    if not state.webdav_client:
        raise HTTPException(status_code=400, detail="请先连接WebDAV服务器")

    try:
        files = await asyncio.to_thread(state.webdav_client.list_directory, path)
        return {
            "success": True,
            "files": [
                {
                    "name": file.name,
                    "path": file.path,
                    "is_directory": file.is_directory,
                    "size": file.size,
                    "download_url": file.download_url,
                }
                for file in files
            ],
            "current_path": path,
        }
    except Exception as exc:
        logger.error("获取 WebDAV 文件列表失败: %s", exc)
        return {"success": False, "error": "webdav_list_failed", "message": "获取文件列表失败"}


def _check_file_dispatch(state, payload):
    if not state.aria2_client:
        raise HTTPException(status_code=400, detail='Aria2未连接')
    if any(file.source_type not in {'local', 'pan115'} for file in payload.files) and not state.webdav_client:
        raise HTTPException(status_code=400, detail='WebDAV未连接')


@router.post('/api/webdav/download')
async def add_downloads(request: Request, payload: AddDownloadsRequest):
    state = await session_store.get_state(request)
    _check_file_dispatch(state, payload)
    return await dispatch_files_to_aria2(state.webdav_client, state.aria2_client, payload)


@router.post('/api/webdav/download/jobs', status_code=202)
async def start_file_download_job(request: Request, payload: AddDownloadsRequest):
    state = await session_store.get_state(request)
    _check_file_dispatch(state, payload)
    runner = file_dispatch_runner(state.webdav_client, state.aria2_client, payload)
    return submit_background_task(request, 'file-dispatch', runner, cancellable=True, retryable=runner.can_retry)


@router.get("/api/aria2/status")
async def aria2_status(request: Request):
    state = await session_store.get_state(request)
    if not state.aria2_client:
        return {"connected": False}
    try:
        version = await asyncio.to_thread(state.aria2_client.get_version)
        return {"connected": True, "version": version}
    except Exception:
        return {"connected": False}


@router.get("/api/aria2/downloads")
async def get_aria2_downloads(request: Request):
    state = await session_store.get_state(request)
    if not state.aria2_client:
        raise HTTPException(status_code=400, detail="Aria2未连接")
    try:
        downloads = await asyncio.to_thread(state.aria2_client.get_downloads)
        return {"success": True, "downloads": downloads}
    except Exception as exc:
        logger.error("获取 Aria2 下载列表失败: %s", exc)
        return {"success": False, "error": "aria2_downloads_failed", "message": "获取下载列表失败"}


@router.post("/api/aria2/download-magnets")
async def add_aria2_magnets(request: Request, payload: MagnetDownloadRequest):
    state = await session_store.get_state(request)
    if not state.aria2_client:
        raise HTTPException(status_code=400, detail="请先连接 Aria2")

    results = await dispatch_magnet_downloads_to_aria2(
        state.aria2_client,
        payload.magnet_links,
        payload.movie_ids,
        payload.magnet_sources,
    )

    success_count = sum(1 for item in results if item["success"])
    skipped_count = sum(1 for item in results if item.get("skipped"))
    return {
        "success": success_count > 0 or skipped_count > 0,
        "success_count": success_count,
        "skipped_count": skipped_count,
        "message": f"添加磁力链接 {success_count}/{len(results)} 个到 Aria2",
        "results": results,
    }


@router.post("/api/aria2/pause/{gid}")
async def pause_download(request: Request, gid: str):
    state = await session_store.get_state(request)
    if not state.aria2_client:
        raise HTTPException(status_code=400, detail="Aria2未连接")
    try:
        success = await asyncio.to_thread(state.aria2_client.pause_download, gid)
        return {"success": success, "message": "暂停成功" if success else "暂停失败"}
    except Exception as exc:
        logger.error("暂停 Aria2 下载失败: %s", exc)
        return {"success": False, "error": "aria2_pause_failed", "message": "暂停失败"}


@router.post("/api/aria2/resume/{gid}")
async def resume_download(request: Request, gid: str):
    state = await session_store.get_state(request)
    if not state.aria2_client:
        raise HTTPException(status_code=400, detail="Aria2未连接")
    try:
        success = await asyncio.to_thread(state.aria2_client.resume_download, gid)
        return {"success": success, "message": "恢复成功" if success else "恢复失败"}
    except Exception as exc:
        logger.error("恢复 Aria2 下载失败: %s", exc)
        return {"success": False, "error": "aria2_resume_failed", "message": "恢复失败"}


@router.delete("/api/aria2/remove/{gid}")
async def remove_download(request: Request, gid: str):
    state = await session_store.get_state(request)
    if not state.aria2_client:
        raise HTTPException(status_code=400, detail="Aria2未连接")
    try:
        success = await asyncio.to_thread(state.aria2_client.remove_download, gid)
        return {"success": success, "message": "删除成功" if success else "删除失败"}
    except Exception as exc:
        logger.error("删除 Aria2 下载失败: %s", exc)
        return {"success": False, "error": "aria2_remove_failed", "message": "删除失败"}
