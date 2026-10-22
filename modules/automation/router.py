from fastapi import APIRouter, HTTPException, Request, Response

from .schemas import AutomationTaskCreate, AutomationTaskList, AutomationTaskUpdate, OneOffDispatchRequest, PlaybackRequest
from .service import AutomationError, automation_service
from .service import dispatch_once, freeze_dispatch_credentials
from .playback import playback_runner, playback_stream
from modules.common.tasks import submit_background_task
from modules.webdav.session_state import session_store


router = APIRouter(prefix="/api/automation", tags=["automation"])


@router.post('/play-jobs', status_code=202)
async def start_playback_job(request: Request, payload: PlaybackRequest):
    try:
        runner = playback_runner(payload.movie_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='请先在设置中登录有效的 115 网盘账号') from exc
    return submit_background_task(request, 'browse-play', runner, cancellable=True, retryable=runner.can_retry)


@router.get('/play-jobs/{task_id}/stream')
async def stream_playback_job(task_id: str, request: Request):
    return await playback_stream(task_id, request)


@router.post('/dispatch-jobs', status_code=202)
async def start_dispatch_job(request: Request, payload: OneOffDispatchRequest):
    state = await session_store.get_state(request)
    if payload.tool == 'aria2' and state.aria2_client is None:
        raise HTTPException(status_code=400, detail='请先连接 Aria2')
    try:
        payload = freeze_dispatch_credentials(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    client = state.aria2_client
    return submit_background_task(request, 'dispatch-' + payload.tool, lambda progress: dispatch_once(payload, client, progress))


def _raise_http_error(error: AutomationError) -> None:
    status_code = 404 if error.code == "task_not_found" else 400
    raise HTTPException(status_code=status_code, detail={"error": error.code, "message": error.message})


@router.get("/tasks", response_model=AutomationTaskList)
async def list_tasks(request: Request, response: Response):
    etag, tasks = await automation_service.list_tasks_with_etag(request.headers.get("if-none-match"))
    headers = {"ETag": etag, "Cache-Control": "no-cache"}
    if tasks is None:
        return Response(status_code=304, headers=headers)
    response.headers.update(headers)
    return {"tasks": tasks}


@router.post("/tasks")
async def create_task(payload: AutomationTaskCreate):
    try:
        return await automation_service.create_task(payload)
    except AutomationError as exc:
        _raise_http_error(exc)


@router.get("/tasks/{task_id}")
async def get_task(task_id: str):
    try:
        return await automation_service.get_task(task_id)
    except AutomationError as exc:
        _raise_http_error(exc)


@router.put("/tasks/{task_id}")
async def update_task(task_id: str, payload: AutomationTaskUpdate):
    try:
        return await automation_service.update_task(task_id, payload)
    except AutomationError as exc:
        _raise_http_error(exc)


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    try:
        await automation_service.delete_task(task_id)
        return {"success": True}
    except AutomationError as exc:
        _raise_http_error(exc)


@router.post("/tasks/{task_id}/run")
async def run_task(task_id: str, response: Response, background: bool = False):
    try:
        run = await automation_service.run_task(task_id, manual=True, background=background)
        if background:
            response.status_code = 202
        return run
    except AutomationError as exc:
        _raise_http_error(exc)


@router.get("/tasks/{task_id}/runs")
async def list_runs(task_id: str):
    try:
        return {"runs": await automation_service.list_runs(task_id)}
    except AutomationError as exc:
        _raise_http_error(exc)
