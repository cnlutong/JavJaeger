import logging

from fastapi import APIRouter, Request

from .service import get_magnets_payload


logger = logging.getLogger(__name__)

router = APIRouter(tags=["magnets"])


@router.get("/api/magnets/{movie_id}")
async def get_magnets(movie_id: str, request: Request):
    try:
        return await get_magnets_payload(movie_id, dict(request.query_params))
    except Exception as exc:
        logger.error("获取磁力链接失败: %s", exc)
        return {"error": "获取磁力链接失败", "message": str(exc)}
