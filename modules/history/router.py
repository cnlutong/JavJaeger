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
        return {"error": "清空历史记录失败", "message": str(exc)}


@router.get("/api/downloaded-movies")
async def get_downloaded_movies():
    try:
        return await download_history_service.get_downloaded_movie_ids()
    except Exception as exc:
        logger.error("获取下载记录失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"获取下载记录失败: {exc}")


@router.get("/api/downloaded-movies/{movie_id}")
async def check_movie_downloaded(movie_id: str):
    try:
        return await download_history_service.get_downloaded_movie_status(movie_id)
    except Exception as exc:
        logger.error("检查下载状态失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"检查下载状态失败: {exc}")
