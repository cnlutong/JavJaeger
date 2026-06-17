import logging

from fastapi import APIRouter, Request

from .service import javbus_api_service


logger = logging.getLogger(__name__)

router = APIRouter(tags=["javbus-api"])


@router.get("/api/stars/{star_id}")
async def get_star_info(star_id: str, request: Request):
    movie_type = request.query_params.get("type")
    try:
        return await javbus_api_service.get_star_info(star_id, movie_type)
    except Exception as exc:
        logger.error("Failed to get star info %s: %s", star_id, exc)
        return {"error": "Failed to get star info", "message": "JavBus request failed"}
