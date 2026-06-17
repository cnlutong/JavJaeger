import asyncio
import json
import logging
from typing import Any, AsyncIterator

from modules.history.service import download_history_service, local_movie_library_service
from modules.magnets.service import build_movie_with_best_magnet_result, get_best_magnet_payload
from modules.pikpak.schemas import DownloadRequest
from modules.pikpak.service import download as pikpak_download
from .schemas import BatchMoviesRequest, MovieCodeDownloadRequest, MovieRecognitionRequest
from .service import get_movie_detail, parse_movie_codes, parse_movies_from_html


logger = logging.getLogger(__name__)


async def is_movie_known(movie_id: str) -> bool:
    return await download_history_service.is_movie_downloaded(movie_id) or await local_movie_library_service.is_movie_present(movie_id)


async def known_movie_status(movie_id: str) -> str | None:
    if await local_movie_library_service.is_movie_present(movie_id):
        return "local_exists"
    if await download_history_service.is_movie_downloaded(movie_id):
        return "already_downloaded"
    return None


async def _movie_with_best_magnet(batch_request: BatchMoviesRequest, movie_id: str) -> dict[str, Any]:
    try:
        return await build_movie_with_best_magnet_result(
            movie_id,
            magnet_source=batch_request.magnet_source,
            has_subtitle_filter=batch_request.has_subtitle_filter,
            exclude_4k=batch_request.exclude_4k,
            allow_chinese_subtitles=batch_request.allow_chinese_subtitles,
            allow_param_present=batch_request.allow_chinese_subtitles is not None,
        )
    except Exception:
        logger.exception("Failed to build movie magnet result for %s", movie_id)
        return {"movie_id": movie_id, "success": False, "error": "movie_fetch_failed"}


async def get_batch_movies_payload(batch_request: BatchMoviesRequest) -> dict[str, Any]:
    semaphore = asyncio.Semaphore(3)

    async def limited_get_movie(movie_id: str) -> dict[str, Any]:
        async with semaphore:
            return await _movie_with_best_magnet(batch_request, movie_id)

    results = await asyncio.gather(*[limited_get_movie(movie_id) for movie_id in batch_request.movie_ids])
    return {"success": True, "results": results, "total_count": len(results)}


async def iter_batch_movie_events(batch_request: BatchMoviesRequest) -> AsyncIterator[str]:
    yield f"data: {json.dumps({'type': 'start', 'total': len(batch_request.movie_ids)})}\n\n"

    semaphore = asyncio.Semaphore(3)

    async def limited_get_movie(movie_id: str, index: int) -> dict[str, Any]:
        async with semaphore:
            result = await _movie_with_best_magnet(batch_request, movie_id)
            result["index"] = index + 1
            result["type"] = "progress"
            return result

    batch_size = 5
    for index in range(0, len(batch_request.movie_ids), batch_size):
        batch_movie_ids = batch_request.movie_ids[index : index + batch_size]
        batch_indices = list(range(index, min(index + batch_size, len(batch_request.movie_ids))))
        batch_results = await asyncio.gather(
            *[limited_get_movie(movie_id, batch_index) for movie_id, batch_index in zip(batch_movie_ids, batch_indices)]
        )

        for result in batch_results:
            yield f"data: {json.dumps(result)}\n\n"

        await asyncio.sleep(0.02)

    yield f"data: {json.dumps({'type': 'complete'})}\n\n"


async def recognize_movies_payload(request: MovieRecognitionRequest) -> dict[str, Any]:
    try:
        movies = parse_movies_from_html(request.html_content)
        if not movies:
            return {"error": "no_movies_found", "message": "未能从HTML内容中解析到影片信息"}

        if not request.auto_download:
            return {"success": True, "movies": movies}

        movie_ids = [movie["id"] for movie in movies]
        magnet_results = []

        for movie_id in movie_ids:
            try:
                if await is_movie_known(movie_id):
                    logger.info("影片 %s 已存在，跳过", movie_id)
                    continue

                best_magnet = await get_best_magnet_payload(
                    movie_id,
                    magnet_source=request.magnet_source,
                    has_subtitle_filter=request.has_subtitle_filter,
                    exclude_4k=request.exclude_4k,
                    allow_chinese_subtitles=request.allow_chinese_subtitles,
                    allow_param_present=request.allow_chinese_subtitles is not None,
                )
                if not best_magnet:
                    logger.warning("未找到影片 %s 的磁力链接", movie_id)
                    continue

                magnet_url = best_magnet.get("link")
                if not magnet_url:
                    logger.warning("影片 %s 的磁力数据中缺少链接字段", movie_id)
                    continue

                magnet_results.append(
                    {
                        "movie_id": movie_id,
                        "link": magnet_url,
                        "title": best_magnet.get("title", ""),
                        "size": best_magnet.get("size", ""),
                        "shareDate": best_magnet.get("shareDate"),
                        "hasSubtitle": best_magnet.get("hasSubtitle", False),
                    }
                )
            except Exception:
                logger.exception("Failed to fetch best magnet for recognized movie %s", movie_id)

        if not magnet_results:
            return {
                "success": True,
                "movies": movies,
                "message": "解析成功，但未找到可下载的磁力链接",
            }

        try:
            download_result = await pikpak_download(
                DownloadRequest(
                    magnet_links=[result["link"] for result in magnet_results],
                    movie_ids=[result["movie_id"] for result in magnet_results],
                    username=request.username,
                    password=request.password,
                )
            )
        except Exception:
            logger.exception("PikPak auto download failed after recognition")
            download_result = {"success": False, "message": "PikPak自动下载失败", "results": []}

        return {
            "success": True,
            "movies": movies,
            "magnet_results": magnet_results,
            "download_result": download_result,
        }
    except Exception:
        logger.exception("Movie recognition failed")
        return {"error": "recognition_failed", "message": "影片识别失败"}


async def download_movies_by_codes_payload(request: MovieCodeDownloadRequest) -> dict[str, Any]:
    try:
        movie_codes = parse_movie_codes(request.movie_codes)
        if not movie_codes:
            return {"error": "no_valid_movie_codes", "message": "未能解析到有效番号"}

        found_movies = []
        found_movie_data = {}
        not_found_codes = []

        for movie_code in movie_codes:
            try:
                existing_status = await known_movie_status(movie_code)
                if existing_status:
                    title = "本地已存在" if existing_status == "local_exists" else "已下载"
                    found_movies.append({"id": movie_code, "title": title, "status": existing_status})
                    continue

                movie_data = await get_movie_detail(movie_code)
                if movie_data and movie_data.get("id"):
                    found_movie_data[movie_data["id"]] = movie_data
                    found_movies.append(
                        {
                            "id": movie_data["id"],
                            "title": movie_data.get("title", ""),
                            "date": movie_data.get("date", ""),
                            "img": movie_data.get("img", ""),
                            "status": "found",
                        }
                    )
                else:
                    not_found_codes.append(movie_code)
            except Exception:
                logger.exception("Failed to search movie code %s", movie_code)
                not_found_codes.append(movie_code)

        if not request.auto_download:
            return {
                "success": True,
                "total_codes": len(movie_codes),
                "found_movies": found_movies,
                "not_found_codes": not_found_codes,
            }

        movies_to_download = [movie for movie in found_movies if movie["status"] == "found"]
        if not movies_to_download:
            return {
                "success": True,
                "total_codes": len(movie_codes),
                "found_movies": found_movies,
                "not_found_codes": not_found_codes,
                "message": "没有需要下载的新影片",
            }

        magnet_results = []
        for movie in movies_to_download:
            try:
                movie_id = movie["id"]
                best_magnet = await get_best_magnet_payload(
                    movie_id,
                    magnet_source=request.magnet_source,
                    has_subtitle_filter=request.has_subtitle_filter,
                    exclude_4k=request.exclude_4k,
                    allow_chinese_subtitles=request.allow_chinese_subtitles,
                    allow_param_present=request.allow_chinese_subtitles is not None,
                    movie_data=found_movie_data.get(movie_id),
                )
                if not best_magnet:
                    continue

                magnet_url = best_magnet.get("link")
                if not magnet_url:
                    continue

                magnet_results.append(
                    {
                        "movie_id": movie_id,
                        "link": magnet_url,
                        "title": best_magnet.get("title", ""),
                        "size": best_magnet.get("size", ""),
                        "shareDate": best_magnet.get("shareDate"),
                    }
                )
            except Exception:
                logger.exception("Failed to fetch best magnet for movie %s", movie["id"])

        if not magnet_results:
            return {
                "success": True,
                "total_codes": len(movie_codes),
                "found_movies": found_movies,
                "not_found_codes": not_found_codes,
                "message": "找到影片但未找到可下载的磁力链接",
            }

        try:
            download_result = await pikpak_download(
                DownloadRequest(
                    magnet_links=[result["link"] for result in magnet_results],
                    movie_ids=[result["movie_id"] for result in magnet_results],
                    username=request.username,
                    password=request.password,
                )
            )
        except Exception:
            logger.exception("PikPak auto download failed for movie codes")
            download_result = {"success": False, "message": "PikPak自动下载失败", "results": []}

        return {
            "success": True,
            "total_codes": len(movie_codes),
            "found_movies": found_movies,
            "not_found_codes": not_found_codes,
            "magnet_results": magnet_results,
            "download_result": download_result,
        }
    except Exception:
        logger.exception("Movie code download workflow failed")
        return {"error": "movie_code_processing_failed", "message": "番号处理失败"}
