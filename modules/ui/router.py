from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from modules.common.runtime import VERSION_INFO, templates


router = APIRouter(tags=["ui"])


@router.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "version_info": VERSION_INFO,
        },
    )
