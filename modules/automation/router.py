from fastapi import APIRouter, HTTPException

from .schemas import AutomationTaskCreate, AutomationTaskList, AutomationTaskUpdate
from .service import AutomationError, automation_service


router = APIRouter(prefix="/api/automation", tags=["automation"])


def _raise_http_error(error: AutomationError) -> None:
    status_code = 404 if error.code == "task_not_found" else 400
    raise HTTPException(status_code=status_code, detail=error.code)


@router.get("/tasks", response_model=AutomationTaskList)
async def list_tasks():
    return {"tasks": await automation_service.list_tasks()}


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
async def run_task(task_id: str):
    try:
        return await automation_service.run_task(task_id, manual=True)
    except AutomationError as exc:
        _raise_http_error(exc)


@router.get("/tasks/{task_id}/runs")
async def list_runs(task_id: str):
    try:
        return {"runs": await automation_service.list_runs(task_id)}
    except AutomationError as exc:
        _raise_http_error(exc)

