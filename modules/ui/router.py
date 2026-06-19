from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from modules.common.runtime import (
    VERSION_INFO,
    get_static_asset_version,
    is_frontend_auto_reload_enabled,
    is_frontend_cache_disabled,
    templates,
)


router = APIRouter(tags=["ui"])


@router.get("/", response_class=HTMLResponse)
async def home(request: Request):
    version_info = dict(VERSION_INFO)
    version_info["asset_version"] = get_static_asset_version()
    version_info["disable_cache"] = is_frontend_cache_disabled()
    version_info["auto_reload_frontend"] = is_frontend_auto_reload_enabled()

    response = templates.TemplateResponse(
        request,
        "index.html",
        {
            "version_info": version_info,
        },
    )
    if is_frontend_cache_disabled():
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response
