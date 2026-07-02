import logging

from fastapi import APIRouter, HTTPException

from .service import download_history_service


logger = logging.getLogger(__name__)

router = APIRouter(tags=["history"])


@router.get("/api/history")
async def get_history():
    try:
        return await download_history_service.get_history()
    except Exception as exc:
        logger.error("读取历史记录失败: %s", exc)
        return []


@router.delete("/api/history")
async def clear_history():
    try:
        return await download_history_service.clear()
    except Exception as exc:
        logger.error("清空历史记录失败: %s", exc)
        return {"error": "history_clear_failed", "message": "清空历史记录失败"}


@router.post("/api/history/check-local-library")
async def check_history_against_local_library():
    try:
        return await download_history_service.check_against_local_library()
    except Exception as exc:
        logger.error("核对历史记录入库状态失败: %s", exc)
        return {"success": False, "error": "history_library_check_failed", "message": "核对历史记录入库状态失败"}


@router.get("/api/downloaded-movies")
async def get_downloaded_movies():
    try:
        return await download_history_service.get_downloaded_movie_ids()
    except Exception as exc:
        logger.error("获取下载记录失败: %s", exc)
        raise HTTPException(status_code=500, detail="获取下载记录失败") from exc


@router.get("/api/downloaded-movies/{movie_id}")
async def check_movie_downloaded(movie_id: str):
    try:
        return await download_history_service.get_downloaded_movie_status(movie_id)
    except Exception as exc:
        logger.error("检查下载状态失败: %s", exc)
        raise HTTPException(status_code=500, detail="检查下载状态失败") from exc
