from fastapi import APIRouter, HTTPException

from .schemas import CookieSaveRequest, DownloadRequest, QrCodeStartRequest
from .service import (
    Pan115Error,
    create_qrcode_session,
    download,
    get_download_job,
    get_qrcode_session_status,
    get_status,
    list_directory_from_config,
    save_cookie,
    submit_download_job,
)


router = APIRouter(tags=["115"])


@router.post("/api/115/qrcode/start")
async def pan115_qrcode_start(request: QrCodeStartRequest | None = None):
    try:
        return await create_qrcode_session(request.app if request else None)
    except Pan115Error as exc:
        raise HTTPException(status_code=400, detail=exc.code) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="pan115_qrcode_start_failed") from exc


@router.get("/api/115/qrcode/{session_id}/status")
async def pan115_qrcode_status(session_id: str):
    try:
        return await get_qrcode_session_status(session_id)
    except Pan115Error as exc:
        raise HTTPException(status_code=400, detail=exc.code) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="pan115_qrcode_status_failed") from exc


@router.get("/api/115/status")
async def pan115_status():
    try:
        return await get_status()
    except Pan115Error as exc:
        raise HTTPException(status_code=400, detail=exc.code) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="pan115_status_failed") from exc


@router.post("/api/115/cookie")
async def pan115_save_cookie(request: CookieSaveRequest):
    try:
        return save_cookie(request.cookie, enabled=request.enabled)
    except Pan115Error as exc:
        raise HTTPException(status_code=400, detail=exc.code) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="pan115_cookie_save_failed") from exc


@router.post("/api/115/download")
async def pan115_download(request: DownloadRequest):
    try:
        return await download(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Pan115Error as exc:
        raise HTTPException(status_code=400, detail=exc.code) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="pan115_download_failed") from exc


@router.post("/api/115/download-jobs")
async def pan115_download_job(request: DownloadRequest):
    try:
        return submit_download_job(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Pan115Error as exc:
        raise HTTPException(status_code=400, detail=exc.code) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="pan115_download_job_failed") from exc


@router.get("/api/115/download-jobs/{job_id}")
async def pan115_download_job_status(job_id: str):
    try:
        return get_download_job(job_id)
    except Pan115Error as exc:
        raise HTTPException(status_code=404 if exc.code == "pan115_job_not_found" else 400, detail=exc.code) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="pan115_download_job_status_failed") from exc


@router.get("/api/115/files")
async def pan115_files(cid: str = "0", offset: int = 0, limit: int = 100):
    try:
        return await list_directory_from_config(cid, offset=offset, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Pan115Error as exc:
        raise HTTPException(status_code=400, detail=exc.code) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="pan115_files_failed") from exc
