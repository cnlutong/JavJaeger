from fastapi import APIRouter, HTTPException

from .schemas import DownloadRequest, PikPakCredentials
from .service import download, login


router = APIRouter(tags=["pikpak"])


@router.post("/api/pikpak/login")
async def pikpak_login(credentials: PikPakCredentials):
    return await login(credentials)


@router.post("/api/pikpak/login-config")
async def pikpak_login_with_config():
    return await login()


@router.post("/api/pikpak/download")
async def pikpak_download(request: DownloadRequest):
    try:
        return await download(request)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"下载失败: {exc}") from exc
