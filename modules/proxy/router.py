from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse


router = APIRouter(tags=["proxy"])


@router.get("/api/{path:path}")
async def proxy_api(path: str, request: Request):
    return JSONResponse(
        status_code=404,
        content={
            "error": "Unknown API route",
            "message": f"/api/{path} is not implemented by JavJaeger",
        },
    )
