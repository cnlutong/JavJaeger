import asyncio
import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from modules.history.service import download_history_service
from modules.magnets.service import build_movie_with_best_magnet_result, get_best_magnet_payload
from modules.pikpak.schemas import DownloadRequest
from modules.pikpak.service import download as pikpak_download
from .schemas import MovieCodeDownloadRequest, MovieRecognitionRequest
from .service import (
    get_all_movies_payload,
    get_movie_detail,
    get_movies_payload,
    parse_batch_movies_request,
    parse_movie_codes,
    parse_movies_from_html,
)


logger = logging.getLogger(__name__)

router = APIRouter(tags=["movies"])


@router.get("/api/movies")
async def get_movies(request: Request):
    return await get_movies_payload(request)


@router.get("/api/movies/all")
async def get_all_movies(request: Request):
    return await get_all_movies_payload(request)


@router.get("/api/movies/{movie_id}")
async def get_movie(movie_id: str):
    data = await get_movie_detail(movie_id)
    if data is None:
        return {"error": "获取影片信息失败", "message": "影片不存在或API请求失败"}
    return data


@router.post("/api/movies/batch")
async def get_movies_batch(request: Request):
    try:
        batch_request = await parse_batch_movies_request(request)
    except Exception as exc:
        logger.error("解析批量请求失败: %s", exc)
        return {"error": "请求格式错误", "message": str(exc)}

    semaphore = asyncio.Semaphore(3)

    async def limited_get_movie(movie_id: str):
        async with semaphore:
            try:
                return await build_movie_with_best_magnet_result(
                    movie_id,
                    magnet_source=batch_request.magnet_source,
                    has_subtitle_filter=batch_request.has_subtitle_filter,
                    exclude_4k=batch_request.exclude_4k,
                    allow_chinese_subtitles=batch_request.allow_chinese_subtitles,
                    allow_param_present=batch_request.allow_chinese_subtitles is not None,
                )
            except Exception as exc:
                logger.error("获取影片 %s 信息失败: %s", movie_id, exc)
                return {"movie_id": movie_id, "success": False, "error": str(exc)}

    results = await asyncio.gather(*[limited_get_movie(movie_id) for movie_id in batch_request.movie_ids])
    return {"success": True, "results": results, "total_count": len(results)}


@router.post("/api/movies/batch-stream")
async def get_movies_batch_stream(request: Request):
    try:
        batch_request = await parse_batch_movies_request(request)
    except Exception as exc:
        logger.error("解析请求体失败: %s", exc)
        return {"error": "请求格式错误"}

    async def generate_results():
        async def get_movie_with_magnet(movie_id: str):
            try:
                return await build_movie_with_best_magnet_result(
                    movie_id,
                    magnet_source=batch_request.magnet_source,
                    has_subtitle_filter=batch_request.has_subtitle_filter,
                    exclude_4k=batch_request.exclude_4k,
                    allow_chinese_subtitles=batch_request.allow_chinese_subtitles,
                    allow_param_present=batch_request.allow_chinese_subtitles is not None,
                )
            except Exception as exc:
                logger.error("获取影片 %s 信息失败: %s", movie_id, exc)
                return {"movie_id": movie_id, "success": False, "error": str(exc)}

        yield f"data: {json.dumps({'type': 'start', 'total': len(batch_request.movie_ids)})}\n\n"

        semaphore = asyncio.Semaphore(3)

        async def limited_get_movie(movie_id: str, index: int):
            async with semaphore:
                result = await get_movie_with_magnet(movie_id)
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

    return StreamingResponse(
        generate_results(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
        },
    )


@router.post("/api/movies/recognize")
async def recognize_movies(request: MovieRecognitionRequest):
    try:
        movies = parse_movies_from_html(request.html_content)
        if not movies:
            return {"error": "未能从HTML内容中解析到任何影片信息"}

        if request.auto_download:
            movie_ids = [movie["id"] for movie in movies]
            magnet_results = []

            for movie_id in movie_ids:
                try:
                    if await download_history_service.is_movie_downloaded(movie_id):
                        logger.info("影片 %s 已下载，跳过", movie_id)
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

                    magnet_link = best_magnet.get("magnet_link") or best_magnet.get("magnetLink") or best_magnet.get("link")
                    if not magnet_link:
                        logger.warning("影片 %s 的磁力数据中缺少链接字段", movie_id)
                        continue

                    magnet_results.append(
                        {
                            "movie_id": movie_id,
                            "magnet_link": magnet_link,
                            "title": best_magnet.get("title", ""),
                            "size": best_magnet.get("size", ""),
                            "hasSubtitle": best_magnet.get("hasSubtitle", False),
                        }
                    )
                except Exception as exc:
                    logger.error("获取影片 %s 磁力链接失败: %s", movie_id, exc)

            if magnet_results:
                try:
                    download_result = await pikpak_download(
                        DownloadRequest(
                            magnet_links=[result["magnet_link"] for result in magnet_results],
                            movie_ids=[result["movie_id"] for result in magnet_results],
                            username=request.username,
                            password=request.password,
                        )
                    )
                except Exception as exc:
                    logger.error("PikPak自动下载失败: %s", exc)
                    return {
                        "success": True,
                        "movies": movies,
                        "magnet_results": magnet_results,
                        "download_result": {"success": False, "message": str(exc), "results": []},
                    }
                return {
                    "success": True,
                    "movies": movies,
                    "magnet_results": magnet_results,
                    "download_result": download_result,
                }

            return {
                "success": True,
                "movies": movies,
                "message": "解析成功，但未找到可下载的磁力链接",
            }

        return {"success": True, "movies": movies}
    except Exception as exc:
        logger.error("影片识别失败: %s", exc)
        return {"error": f"识别失败: {exc}"}


@router.post("/api/movies/download-by-codes")
async def download_movies_by_codes(request: MovieCodeDownloadRequest):
    try:
        movie_codes = parse_movie_codes(request.movie_codes)
        if not movie_codes:
            return {"error": "未能解析到有效的番号"}

        found_movies = []
        found_movie_data = {}
        not_found_codes = []

        for movie_code in movie_codes:
            try:
                if await download_history_service.is_movie_downloaded(movie_code):
                    found_movies.append({"id": movie_code, "title": "已下载", "status": "already_downloaded"})
                    continue

                movie_data = await get_movie_detail(movie_code)
                if movie_data and movie_data.get("id"):
                    found_movie_data[movie_data["id"]] = movie_data
                    found_movies.append(
                        {
                            "id": movie_data["id"],
                            "title": movie_data.get("title", ""),
                            "date": movie_data.get("date", ""),
                            "cover": movie_data.get("cover", ""),
                            "status": "found",
                        }
                    )
                else:
                    not_found_codes.append(movie_code)
            except Exception as exc:
                logger.error("搜索影片 %s 失败: %s", movie_code, exc)
                not_found_codes.append(movie_code)

        if request.auto_download:
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

                    magnet_link = best_magnet.get("magnet_link") or best_magnet.get("magnetLink") or best_magnet.get("link")
                    if not magnet_link:
                        continue

                    magnet_results.append(
                        {
                            "movie_id": movie_id,
                            "magnet_link": magnet_link,
                            "title": best_magnet.get("title", ""),
                            "size": best_magnet.get("size", ""),
                        }
                    )
                except Exception as exc:
                    logger.error("获取影片 %s 磁力链接失败: %s", movie["id"], exc)

            if magnet_results:
                try:
                    download_result = await pikpak_download(
                        DownloadRequest(
                            magnet_links=[result["magnet_link"] for result in magnet_results],
                            movie_ids=[result["movie_id"] for result in magnet_results],
                            username=request.username,
                            password=request.password,
                        )
                    )
                except Exception as exc:
                    logger.error("PikPak自动下载失败: %s", exc)
                    return {
                        "success": True,
                        "total_codes": len(movie_codes),
                        "found_movies": found_movies,
                        "not_found_codes": not_found_codes,
                        "magnet_results": magnet_results,
                        "download_result": {"success": False, "message": str(exc), "results": []},
                    }
                return {
                    "success": True,
                    "total_codes": len(movie_codes),
                    "found_movies": found_movies,
                    "not_found_codes": not_found_codes,
                    "magnet_results": magnet_results,
                    "download_result": download_result,
                }

            return {
                "success": True,
                "total_codes": len(movie_codes),
                "found_movies": found_movies,
                "not_found_codes": not_found_codes,
                "message": "找到影片但未找到可下载的磁力链接",
            }

        return {
            "success": True,
            "total_codes": len(movie_codes),
            "found_movies": found_movies,
            "not_found_codes": not_found_codes,
        }
    except Exception as exc:
        logger.error("番号下载失败: %s", exc)
        return {"error": f"处理失败: {exc}"}
