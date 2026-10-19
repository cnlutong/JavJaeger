import logging

from fastapi import APIRouter, HTTPException, Request

from .service import javbus_api_service


logger = logging.getLogger(__name__)

router = APIRouter(tags=["javbus-api"])


@router.get("/api/metadata-cache")
async def get_metadata_cache_settings():
    try:
        return await javbus_api_service.get_metadata_cache_settings()
    except OSError as exc:
        raise HTTPException(status_code=500, detail="无法读取服务端缓存，请检查数据目录权限") from exc


@router.put("/api/metadata-cache")
async def put_metadata_cache_settings(request: Request):
    try:
        return await javbus_api_service.update_metadata_cache_settings(await request.json())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail="无法保存服务端缓存，请检查可用空间与数据目录权限") from exc


@router.get("/api/stars/{star_id}")
async def get_star_info(star_id: str, request: Request):
    movie_type = request.query_params.get("type")
    try:
        return await javbus_api_service.get_star_info(star_id, movie_type)
    except Exception as exc:
        logger.error("Failed to get star info %s: %s", star_id, exc)
        return {"error": "Failed to get star info", "message": "JavBus request failed"}
