import asyncio
import logging
import os
from typing import Any

from modules.history.service import download_history_service, local_movie_library_service
from modules.magnets.service import get_same_source_replacement_magnet_payload
from modules.pan115 import service as pan115_service

from .clients import Aria2Client, WebDavClient, WebDavFile
from modules.common.runtime import run_blocking_io


logger = logging.getLogger(__name__)


async def dispatch_magnet_downloads_to_aria2(
    aria2_client: Aria2Client,
    magnet_links: list[str],
    movie_ids: list[str],
    magnet_sources: list[str] | None = None,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []

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
        except Exception as exc:
            logger.error("添加 Aria2 磁力链接失败: %s", exc)
            results.append(
                {
                    "movie_id": movie_id,
                    "success": False,
                    "error": "aria2_add_failed",
                    "magnet": magnet_link,
                    "source": magnet_source,
                    "message": "添加失败",
                }
            )

    await download_history_service.record_dispatch_results(results, "aria2")

    return results


async def dispatch_pan115_downloads_to_aria2(
    aria2_client: Aria2Client,
    files: list[Any],
    video_filter: bool,
    min_file_size_mb: float,
    progress_callback=None,
) -> list[dict[str, Any]]:
    downloads, skipped = await pan115_service.resolve_download_entries_from_config(
        files,
        video_filter=video_filter,
        min_file_size_mb=min_file_size_mb,
        **({'progress_callback': progress_callback} if progress_callback else {}),
    )

    results: list[dict[str, Any]] = []
    for index, item in enumerate(downloads):
        if progress_callback:
            progress_callback({'phase': 'dispatch', 'completed': index, 'total': len(downloads), 'current': item.name, 'message': f'正在提交：{item.name}'})
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
        if progress_callback:
            progress_callback({'phase': 'dispatch', 'completed': index + 1, 'total': len(downloads), 'current': item.name,
                'message': f"{'已提交' if results[-1]['success'] else '提交失败'}：{item.name}（{index + 1}/{len(downloads)}）"})

    return results + [{**item, "skipped": True} for item in skipped]


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


def get_folder_files_recursive(webdav_client: WebDavClient, folder_path: str, progress_callback=None) -> list[WebDavFile]:
    all_files: list[WebDavFile] = []
    if progress_callback:
        progress_callback({'phase': 'scan', 'message': f'正在遍历文件夹：{folder_path}', 'current': folder_path})
    files = webdav_client.list_directory(folder_path)
    for file in files:
        if file.is_directory:
            all_files.extend(get_folder_files_recursive(webdav_client, file.path, progress_callback))
        else:
            all_files.append(file)
    return all_files


def download_folder_recursive(
    webdav_client: WebDavClient,
    aria2_client: Aria2Client,
    folder_path: str,
    folder_name: str,
    video_filter: bool,
    min_file_size_mb: float,
    progress_callback=None,
) -> list[dict[str, Any]]:
    all_files = get_folder_files_recursive(webdav_client, folder_path, progress_callback)
    eligible_files: list[WebDavFile] = []
    skipped_files: list[dict[str, Any]] = []

    for index, file in enumerate(all_files):
        if progress_callback:
            progress_callback({'phase': 'filter', 'completed': index, 'total': len(all_files), 'current': file.name, 'message': f'正在筛选文件：{file.name}'})
        if (video_filter and not is_video_file(file.name)) or file.size < min_file_size_mb * 1024 * 1024:
            if progress_callback:
                progress_callback({'phase': 'filter', 'completed': index + 1, 'total': len(all_files), 'message': f'跳过不符合筛选条件的文件：{file.name}'})
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
    for index, file in enumerate(eligible_files):
        if progress_callback:
            progress_callback({'phase': 'dispatch', 'completed': index, 'total': len(eligible_files), 'current': file.name, 'message': f'正在提交：{file.name}'})
        try:
            download_url = webdav_client._build_download_url(file.path)
            options = webdav_client.build_aria2_options({"out": file.name})
            gid = aria2_client.add_download(download_url, options)
            results.append({"filename": file.name, "success": True, "gid": gid, "message": f"已加入 {folder_name}"})
        except Exception:
            results.append({"filename": file.name, "success": False, "error": "download_add_failed", "message": "添加失败"})
        if progress_callback:
            progress_callback({'phase': 'dispatch', 'completed': index + 1, 'total': len(eligible_files), 'current': file.name,
                'message': f"{'已提交' if results[-1]['success'] else '提交失败'}：{file.name}（{index + 1}/{len(eligible_files)}）"})

    return results + skipped_files


async def dispatch_files_to_aria2(webdav_client, aria2_client, payload, progress_callback=None):
    if progress_callback:
        progress_callback({'phase': 'scan', 'message': '正在解析网盘目录，文件总量待确定'})
    results: list[dict[str, Any]] = []
    local_files = [file_info for file_info in payload.files if file_info.source_type == "local"]
    for file_info in local_files:
        results.append({"filename": file_info.name, "success": False, "message": "本地文件不能发送到 Aria2"})

    pan115_files = [file_info for file_info in payload.files if file_info.source_type == "pan115"]
    if pan115_files:
        try:
            pan115_results = await dispatch_pan115_downloads_to_aria2(
                aria2_client,
                pan115_files,
                payload.video_filter,
                payload.min_file_size_mb,
                progress_callback,
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
    if webdav_files and not webdav_client:
        raise ValueError("WebDAV未连接")

    for index, file_info in enumerate(webdav_files):
        if progress_callback and not file_info.is_directory:
            progress_callback({'phase': 'dispatch', 'completed': index, 'total': len(webdav_files), 'current': file_info.name, 'message': f'正在提交：{file_info.name}'})
        try:
            if not file_info.path:
                results.append({"filename": file_info.name, "success": False, "message": "文件路径为空"})
                continue

            if file_info.is_directory:
                folder_results = await run_blocking_io(
                    download_folder_recursive,
                    webdav_client,
                    aria2_client,
                    file_info.path,
                    file_info.name,
                    payload.video_filter,
                    payload.min_file_size_mb,
                    progress_callback,
                )
                results.extend(folder_results)
                continue

            if (payload.video_filter and not is_video_file(file_info.name)) or file_info.size < payload.min_file_size_mb * 1024 * 1024:
                results.append(
                    {
                        "filename": file_info.name,
                        "success": False,
                        "skipped": True,
                        "message": f"不符合视频文件筛选条件（非视频文件或小于{payload.min_file_size_mb}MB）",
                    }
                )
                continue

            download_url = webdav_client._build_download_url(file_info.path)
            options = webdav_client.build_aria2_options({"out": file_info.name})
            gid = await run_blocking_io(aria2_client.add_download, download_url, options)
            results.append({"filename": file_info.name, "success": True, "gid": gid, "message": "添加成功"})
        except Exception as exc:
            logger.error("添加 WebDAV 下载任务失败: %s", exc)
            results.append({"filename": file_info.name, "success": False, "error": "download_add_failed", "message": "添加失败"})
        finally:
            if progress_callback and not file_info.is_directory:
                state = '已跳过' if results[-1].get('skipped') else '已提交' if results[-1].get('success') else '提交失败'
                progress_callback({'phase': 'dispatch', 'completed': index + 1, 'total': len(webdav_files), 'current': file_info.name,
                    'message': f'{state}：{file_info.name}（所选项 {index + 1}/{len(webdav_files)}）'})

    has_success = any(item.get("success") for item in results)
    has_real_failure = any(not item.get("success") and not item.get("skipped") for item in results)
    counts = {key: sum(bool(item.get(key)) for item in results) for key in ('success', 'skipped')}
    failed = sum(not item.get('success') and not item.get('skipped') for item in results)
    message = f"文件派发完成：{counts['success']} 成功，{failed} 失败，{counts['skipped']} 跳过" if results else '没有新增下载任务，请检查目录和筛选条件'
    return {"success": has_success or (bool(results) and not has_real_failure), "results": results, "message": message}


def file_dispatch_runner(webdav_client, aria2_client, payload):
    # A refresh may reconnect and close the browser session's original WebDAV client.
    connection = (webdav_client.base_url, webdav_client.username, webdav_client.password, webdav_client.timeout_seconds) if webdav_client else None
    payload = payload.model_copy(deep=True)

    async def run(progress):
        private_client = WebDavClient(*connection) if connection else None
        try:
            return await dispatch_files_to_aria2(private_client, aria2_client, payload, progress_callback=progress)
        finally:
            if private_client:
                private_client.close()
    return run
