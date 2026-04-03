from fastapi import APIRouter, Request

from modules.common.runtime import JAVBUS_API_BASE_URL, api_client


router = APIRouter(tags=["proxy"])


@router.get("/api/{path:path}")
async def proxy_api(path: str, request: Request):
    api_url = f"{JAVBUS_API_BASE_URL}/api/{path}"
    query_params = dict(request.query_params)
    data = await api_client.get_json(api_url, query_params)
    if data is None:
        return {"error": "请求JavBus API失败", "message": "API请求失败"}
    return data
