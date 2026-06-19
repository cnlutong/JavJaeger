from urllib.parse import unquote_plus, urlparse

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response, JSONResponse
import httpx


ALLOWED_IMAGE_HOSTS = {"www.javbus.com", "pics.dmm.co.jp"}


def _is_allowed_image_host(url: str) -> bool:
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        return parsed.scheme in {"http", "https"} and host in ALLOWED_IMAGE_HOSTS
    except ValueError:
        return False


router = APIRouter(tags=["proxy"])


@router.get("/api/image-proxy")
async def image_proxy(url: str = Query(..., description="Image URL from supported hosts")):
    target_url = unquote_plus(url)
    if not _is_allowed_image_host(target_url):
        raise HTTPException(status_code=400, detail="Unsupported image host")

    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        response = await client.get(
            target_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://www.javbus.com/",
                "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            },
        )

    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail="Failed to fetch image")

    content_type = response.headers.get("content-type", "application/octet-stream")
    return Response(
        content=response.content,
        media_type=content_type,
    )


@router.get("/api/{path:path}")
async def proxy_api(path: str, request: Request):
    return JSONResponse(
        status_code=404,
        content={
            "error": "Unknown API route",
            "message": f"/api/{path} is not implemented by JavJaeger",
        },
    )
