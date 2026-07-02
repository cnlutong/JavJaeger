import asyncio
import logging
import os
from typing import Any

from fastapi import APIRouter, Form, HTTPException, Request

from modules.common.runtime import get_aria2_config, get_webdav_config
from .clients import Aria2Client, WebDavClient, WebDavFile
from .schemas import AddDownloadsRequest, MagnetDownloadRequest
from .service import dispatch_magnet_downloads_to_aria2, dispatch_pan115_downloads_to_aria2
from .session_state import session_store


logger = logging.getLogger(__name__)

router = APIRouter(tags=["webdav"])

VIDEO_EXTENSIONS = {
    ".mp4",
    ".avi",
    ".mkv",
    ".mov",
    ".wmv",
    ".flv",
    ".webm",
    ".m4v",
    ".3gp",
    ".3g2",
    ".asf",
    ".rm",
    ".rmvb",
    ".vob",
    ".ts",
    ".mts",
    ".m2ts",
    ".divx",
    ".xvid",
    ".ogv",
    ".f4v",
    ".mpg",
    ".mpeg",
    ".m1v",
    ".m2v",
    ".mpe",
    ".mpv",
    ".mp2",
    ".mpa",
    ".mpu",
    ".mpg2",
}


def is_video_file(filename: str) -> bool:
    extension = os.path.splitext(filename.lower())[1] if filename else ""
    return extension in VIDEO_EXTENSIONS


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


def get_folder_files_recursive(webdav_client: WebDavClient, folder_path: str) -> list[WebDavFile]:
    all_files: list[WebDavFile] = []
    files = webdav_client.list_directory(folder_path)
    for file in files:
        if file.is_directory:
            all_files.extend(get_folder_files_recursive(webdav_client, file.path))
        else:
            all_files.append(file)
    return all_files


def download_folder_recursive(
    webdav_client: WebDavClient,
    aria2_client: Aria2Client,
    folder_path: str,
    folder_name: str,
    video_filter: bool,
    min_file_size_mb: int,
) -> list[dict[str, Any]]:
    all_files = get_folder_files_recursive(webdav_client, folder_path)
    eligible_files: list[WebDavFile] = []
    skipped_files: list[dict[str, Any]] = []

    for file in all_files:
        if video_filter and (not is_video_file(file.name) or file.size < min_file_size_mb * 1024 * 1024):
            skipped_files.append(
                {
                    "filename": file.name,
                    "success": False,
                    "skipped": True,
                    "message": f"不符合视频文件筛选条件（非视频文件或小于{min_file_size_mb}MB）",
                }
            )
            continue
        eligible_files.append(file)

    results: list[dict[str, Any]] = []
    for file in eligible_files:
        download_url = webdav_client._build_download_url(file.path)
        options = webdav_client.build_aria2_options({"out": file.name})
        gid = aria2_client.add_download(download_url, options)
        results.append({"filename": file.name, "success": True, "gid": gid, "message": f"已加入 {folder_name}"})

    return results + skipped_files


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


@router.post("/api/webdav/download")
async def add_downloads(request: Request, payload: AddDownloadsRequest):
    state = await session_store.get_state(request)
    if not state.aria2_client:
        raise HTTPException(status_code=400, detail="Aria2未连接")

    results: list[dict[str, Any]] = []
    local_files = [file_info for file_info in payload.files if file_info.source_type == "local"]
    for file_info in local_files:
        results.append({"filename": file_info.name, "success": False, "message": "本地文件不能发送到 Aria2"})

    pan115_files = [file_info for file_info in payload.files if file_info.source_type == "pan115"]
    if pan115_files:
        try:
            pan115_results = await dispatch_pan115_downloads_to_aria2(
                state.aria2_client,
                pan115_files,
                payload.video_filter,
                payload.min_file_size_mb,
            )
            results.extend(pan115_results)
        except ValueError as exc:
            results.append({"filename": "115网盘", "success": False, "message": str(exc)})
        except Exception as exc:
            logger.error("添加 115 文件到 Aria2 失败: %s", exc)
            results.append({"filename": "115网盘", "success": False, "error": "pan115_dispatch_failed", "message": "添加失败"})

    webdav_files = [
        file_info
        for file_info in payload.files
        if file_info.source_type not in {"local", "pan115"}
    ]
    if webdav_files and not state.webdav_client:
        raise HTTPException(status_code=400, detail="WebDAV未连接")

    for file_info in webdav_files:
        try:
            if not file_info.path:
                results.append({"filename": file_info.name, "success": False, "message": "文件路径为空"})
                continue

            if file_info.is_directory:
                folder_results = await asyncio.to_thread(
                    download_folder_recursive,
                    state.webdav_client,
                    state.aria2_client,
                    file_info.path,
                    file_info.name,
                    payload.video_filter,
                    payload.min_file_size_mb,
                )
                results.extend(folder_results)
                continue

            if payload.video_filter and (
                not is_video_file(file_info.name) or file_info.size < payload.min_file_size_mb * 1024 * 1024
            ):
                results.append(
                    {
                        "filename": file_info.name,
                        "success": False,
                        "skipped": True,
                        "message": f"不符合视频文件筛选条件（非视频文件或小于{payload.min_file_size_mb}MB）",
                    }
                )
                continue

            download_url = state.webdav_client._build_download_url(file_info.path)
            options = state.webdav_client.build_aria2_options({"out": file_info.name})
            gid = await asyncio.to_thread(state.aria2_client.add_download, download_url, options)
            results.append({"filename": file_info.name, "success": True, "gid": gid, "message": "添加成功"})
        except Exception as exc:
            logger.error("添加 WebDAV 下载任务失败: %s", exc)
            results.append({"filename": file_info.name, "success": False, "error": "download_add_failed", "message": "添加失败"})

    has_success = any(item.get("success") for item in results)
    has_real_failure = any(not item.get("success") and not item.get("skipped") for item in results)
    return {"success": has_success or (bool(results) and not has_real_failure), "results": results}


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
