from fastapi import APIRouter, HTTPException, Request, Response

from .schemas import AutomationTaskCreate, AutomationTaskList, AutomationTaskUpdate
from .service import AutomationError, automation_service


router = APIRouter(prefix="/api/automation", tags=["automation"])


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
