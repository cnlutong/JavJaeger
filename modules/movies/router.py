import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

from modules.history.service import local_movie_library_service
from .local_library import clear_local_library, get_local_library_payload, get_local_library_status, scan_local_library
from .local_scrape import apply_local_scrape, preview_local_scrape
from .schemas import LocalLibraryScanRequest, LocalScrapeApplyRequest, LocalScrapePreviewRequest, MovieCodeDownloadRequest, MovieRecognitionRequest
from .service import (
    get_all_movies_payload,
    get_movie_detail,
    get_movies_search_payload,
    get_movies_payload,
    parse_batch_movies_request,
)
from .workflows import (
    download_movies_by_codes_payload,
    get_batch_movies_payload,
    iter_batch_movie_events,
    recognize_movies_payload,
)


logger = logging.getLogger(__name__)

router = APIRouter(tags=["movies"])


@router.get("/api/movies")
async def get_movies(request: Request):
    return await get_movies_payload(request)


@router.get("/api/movies/all")
async def get_all_movies(request: Request):
    return await get_all_movies_payload(request)


@router.get("/api/movies/search")
async def search_movies(request: Request):
    return await get_movies_search_payload(request)


@router.get("/api/movies/local-library")
async def get_local_movie_library():
    try:
        return await get_local_library_payload()
    except Exception as exc:
        logger.error("Local library read failed: %s", exc)
        return {"success": False, "error": "library_read_failed", "message": "读取本地影片库失败"}


@router.post("/api/movies/local-library/scan")
async def scan_local_movie_library(request: LocalLibraryScanRequest):
    try:
        return await scan_local_library(request)
    except Exception as exc:
        logger.error("Local library scan failed: %s", exc)
        return {"success": False, "error": "library_scan_failed", "message": "扫描本地影片库失败"}


@router.delete("/api/movies/local-library")
async def clear_local_movie_library():
    try:
        return await clear_local_library()
    except Exception as exc:
        logger.error("Local library clear failed: %s", exc)
        return {"success": False, "error": "library_clear_failed", "message": "清空本地影片库失败"}


@router.get("/api/movies/local-library/poster/{movie_id}")
async def get_local_movie_library_poster(movie_id: str):
    poster_path = await local_movie_library_service.get_poster_path(movie_id)
    if poster_path is None:
        raise HTTPException(status_code=404, detail="poster_not_found")
    return FileResponse(poster_path)


@router.get("/api/movies/local-library/{movie_id}")
async def get_local_movie_library_status(movie_id: str):
    try:
        return await get_local_library_status(movie_id)
    except Exception as exc:
        logger.error("Local library status failed: %s", exc)
        return {"success": False, "error": "library_status_failed", "message": "读取本地影片库状态失败"}


@router.get("/api/movies/{movie_id}")
async def get_movie(movie_id: str):
    data = await get_movie_detail(movie_id)
    if data is None:
        return {"error": "鑾峰彇褰辩墖淇℃伅澶辫触", "message": "褰辩墖涓嶅瓨鍦ㄦ垨API璇锋眰澶辫触"}
    return data


@router.post("/api/movies/batch")
async def get_movies_batch(request: Request):
    try:
        batch_request = await parse_batch_movies_request(request)
    except Exception as exc:
        logger.error("瑙ｆ瀽鎵归噺璇锋眰澶辫触: %s", exc)
        return {"error": "invalid_request", "message": "请求格式错误"}

    return await get_batch_movies_payload(batch_request)


@router.post("/api/movies/batch-stream")
async def get_movies_batch_stream(request: Request):
    try:
        batch_request = await parse_batch_movies_request(request)
    except Exception as exc:
        logger.error("瑙ｆ瀽璇锋眰浣撳け璐? %s", exc)
        return {"error": "invalid_request", "message": "请求格式错误"}

    return StreamingResponse(
        iter_batch_movie_events(batch_request),
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
    return await recognize_movies_payload(request)


@router.post("/api/movies/download-by-codes")
async def download_movies_by_codes(request: MovieCodeDownloadRequest):
    return await download_movies_by_codes_payload(request)


@router.post("/api/movies/local-scrape/preview")
async def preview_local_movie_scrape(request: LocalScrapePreviewRequest):
    try:
        return await preview_local_scrape(request)
    except Exception as exc:
        logger.error("Local scrape preview failed: %s", exc)
        return {"success": False, "error": "preview_failed", "message": "预览本地整理失败"}


@router.post("/api/movies/local-scrape/apply")
async def apply_local_movie_scrape(request: LocalScrapeApplyRequest):
    try:
        return await apply_local_scrape(request)
    except Exception as exc:
        logger.error("Local scrape apply failed: %s", exc)
        return {"success": False, "error": "apply_failed", "message": "应用本地整理失败"}
