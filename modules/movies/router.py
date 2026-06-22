import logging
import mimetypes

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

from modules.history.service import local_actor_library_service, local_movie_library_service
from .local_library import (
    clear_local_library,
    delete_local_library_movie,
    download_missing_local_library_information,
    get_local_library_information_check,
    get_local_library_payload,
    get_local_library_status,
    scan_local_library,
)
from .local_scrape import apply_local_scrape, delete_local_scrape_files, preview_local_scrape
from .local_scrape_tasks import local_scrape_task_manager
from .schemas import (
    LocalLibraryInformationDownloadRequest,
    LocalLibraryScanRequest,
    LocalScrapeApplyRequest,
    LocalScrapeDeleteRequest,
    LocalScrapePreviewRequest,
    MetadataScraperApplyTestResultsRequest,
    MetadataScraperTestRequest,
    MovieCodeDownloadRequest,
    MovieRecognitionRequest,
)
from .metadata_scrapers import apply_metadata_scraper_test_results, test_metadata_scraper_providers
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


@router.get("/api/movies/local-library/information/check")
async def check_local_movie_library_information(fields: str | None = None):
    try:
        return await get_local_library_information_check(fields)
    except Exception as exc:
        logger.error("Local library information check failed: %s", exc)
        return {"success": False, "error": "information_check_failed", "message": "检查影视库信息失败"}


@router.post("/api/movies/local-library/information/download")
async def download_local_movie_library_information(request: LocalLibraryInformationDownloadRequest):
    try:
        return await download_missing_local_library_information(request)
    except Exception as exc:
        logger.error("Local library information download failed: %s", exc)
        return {"success": False, "error": "information_download_failed", "message": "下载影视库缺失信息失败"}


@router.get("/api/movies/local-library/actors")
async def get_local_movie_library_actors():
    try:
        return await local_actor_library_service.get_summary()
    except Exception as exc:
        logger.error("Local actor library read failed: %s", exc)
        return {"success": False, "error": "actor_library_read_failed", "message": "璇诲彇婕斿憳淇℃伅搴撳け璐?"}


@router.get("/api/movies/local-library/actors/{actor_key}/movies")
async def get_local_movie_library_actor_movies(actor_key: str):
    try:
        return await local_actor_library_service.get_movies_for_actor(actor_key)
    except Exception as exc:
        logger.error("Local actor library movies failed: %s", exc)
        return {"success": False, "error": "actor_movies_read_failed", "message": "璇诲彇婕斿憳褰辩墖澶辫触"}


@router.get("/api/movies/local-library/actors/{actor_key}/avatar")
async def get_local_movie_library_actor_library_avatar(actor_key: str):
    avatar_path = await local_actor_library_service.get_avatar_path(actor_key)
    if avatar_path is None:
        raise HTTPException(status_code=404, detail="actor_avatar_not_found")
    return FileResponse(avatar_path)


@router.get("/api/movies/local-library/poster/{movie_id}")
async def get_local_movie_library_poster(movie_id: str):
    poster_path = await local_movie_library_service.get_poster_path(movie_id)
    if poster_path is None:
        raise HTTPException(status_code=404, detail="poster_not_found")
    return FileResponse(poster_path)


@router.get("/api/movies/local-library/thumbnail/{movie_id}")
async def get_local_movie_library_thumbnail(movie_id: str):
    thumbnail_path = await local_movie_library_service.get_thumbnail_path(movie_id)
    if thumbnail_path is None:
        raise HTTPException(status_code=404, detail="thumbnail_not_found")
    return FileResponse(thumbnail_path)


@router.get("/api/movies/local-library/actor-avatar/{movie_id}/{actor_name}")
async def get_local_movie_library_actor_avatar(movie_id: str, actor_name: str):
    avatar_path = await local_movie_library_service.get_actor_avatar_path(movie_id, actor_name)
    if avatar_path is None:
        raise HTTPException(status_code=404, detail="actor_avatar_not_found")
    return FileResponse(avatar_path)


@router.get("/api/movies/local-library/{movie_id}/play")
async def play_local_movie_library_file(movie_id: str, file_index: int = 0):
    video_path = await local_movie_library_service.get_video_file_path(movie_id, file_index)
    if video_path is None:
        raise HTTPException(status_code=404, detail="video_not_found")
    media_type = mimetypes.guess_type(str(video_path))[0] or "application/octet-stream"
    return FileResponse(video_path, media_type=media_type, filename=video_path.name)


@router.get("/api/movies/local-library/{movie_id}")
async def get_local_movie_library_status(movie_id: str):
    try:
        return await get_local_library_status(movie_id)
    except Exception as exc:
        logger.error("Local library status failed: %s", exc)
        return {"success": False, "error": "library_status_failed", "message": "读取本地影片库状态失败"}


@router.delete("/api/movies/local-library/{movie_id}")
async def delete_local_movie_library_movie(movie_id: str):
    try:
        return await delete_local_library_movie(movie_id)
    except Exception as exc:
        logger.error("Local library movie delete failed: %s", exc)
        return {"success": False, "error": "library_movie_delete_failed", "message": "删除影视库影片失败"}


@router.post("/api/movies/local-scrape/preview/jobs")
async def start_local_movie_scrape_preview_job(request: LocalScrapePreviewRequest):
    task_id = local_scrape_task_manager.start_preview_task(request)
    return {"success": True, "task_id": task_id}


@router.post("/api/movies/local-scrape/apply/jobs")
async def start_local_movie_scrape_apply_job(request: LocalScrapeApplyRequest):
    task_id = local_scrape_task_manager.start_apply_task(request)
    return {"success": True, "task_id": task_id}


@router.get("/api/movies/local-scrape/jobs/{task_id}")
async def get_local_movie_scrape_job(task_id: str):
    task = local_scrape_task_manager.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="local_scrape_task_not_found")
    return task


@router.post("/api/movies/metadata-scrapers/test")
async def test_movie_metadata_scrapers(request: MetadataScraperTestRequest):
    try:
        return await test_metadata_scraper_providers(request.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/api/movies/metadata-scrapers/apply-test-results")
async def apply_movie_metadata_scraper_test_results(request: MetadataScraperApplyTestResultsRequest):
    return apply_metadata_scraper_test_results(request.results)


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


@router.post("/api/movies/local-scrape/delete")
async def delete_local_movie_scrape_files(request: LocalScrapeDeleteRequest):
    try:
        return await delete_local_scrape_files(request)
    except Exception as exc:
        logger.error("Local scrape delete failed: %s", exc)
        return {"success": False, "error": "delete_failed", "message": "鍒犻櫎鏈湴鏂囦欢澶辫触"}


@router.post("/api/movies/local-scrape/apply")
async def apply_local_movie_scrape(request: LocalScrapeApplyRequest):
    try:
        return await apply_local_scrape(request)
    except Exception as exc:
        logger.error("Local scrape apply failed: %s", exc)
        return {"success": False, "error": "apply_failed", "message": "应用本地整理失败"}
