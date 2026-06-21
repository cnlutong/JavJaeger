from fastapi import APIRouter, HTTPException

from .schemas import DownloadRequest
from .service import Pan115Error, download


router = APIRouter(tags=["115"])


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
