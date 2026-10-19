from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response, JSONResponse
from . import service
from .service import _is_allowed_image_host


router = APIRouter(tags=["proxy"])


@router.get("/api/image-proxy")
async def image_proxy(url: str = Query(..., description="Image URL from supported hosts")):
    try:
        content, media = await service.image_proxy_service.get_image(url)
        return Response(content=content, media_type=media, headers={"Cache-Control": "public, max-age=86400",
            "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox"})
    except service.ImageProxyError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/api/image-cache")
async def image_cache_settings():
    try: return await service.image_proxy_service.status()
    except OSError as exc:
        raise HTTPException(status_code=500, detail="无法读取图片缓存，请检查数据目录权限") from exc


@router.put("/api/image-cache")
async def save_image_cache_settings(request: Request):
    try: return await service.image_proxy_service.configure(await request.json())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail="无法保存图片缓存，请检查可用空间与数据目录权限") from exc


@router.get("/api/{path:path}")
async def proxy_api(path: str, request: Request):
    return JSONResponse(
        status_code=404,
        content={
            "error": "Unknown API route",
            "message": f"/api/{path} is not implemented by JavJaeger",
        },
    )
