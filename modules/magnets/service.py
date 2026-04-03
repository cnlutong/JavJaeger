import logging
from typing import Any

from cilisousuo_cli import _has_chinese_subtitle, get_best_result as cilisousuo_get_best_result, is_4k_resource

from modules.common.runtime import JAVBUS_API_BASE_URL, api_client
from modules.history.service import download_history_service
from modules.movies.service import get_movie_detail


logger = logging.getLogger(__name__)


def select_best_magnet_with_subtitle_filter(
    magnet_data: list[dict[str, Any]] | None,
    has_subtitle_filter: str | None = None,
    exclude_4k: bool = False,
) -> dict[str, Any] | None:
    if not magnet_data:
        return None

    if exclude_4k:
        filtered_data = [magnet for magnet in magnet_data if not is_4k_resource(magnet.get("title", ""))]
        if filtered_data:
            magnet_data = filtered_data
            logger.info("排除4K后剩余 %s 个磁力链接", len(magnet_data))
        else:
            logger.warning("排除4K后没有可用的磁力链接，将使用原始列表")

    if not has_subtitle_filter:
        return magnet_data[0]

    filtered_magnets: list[dict[str, Any]] = []
    for magnet in magnet_data:
        magnet_has_subtitle = magnet.get("hasSubtitle", False)
        if not magnet_has_subtitle and _has_chinese_subtitle(magnet.get("title", "")):
            magnet_has_subtitle = True

        if has_subtitle_filter == "true" and magnet_has_subtitle:
            filtered_magnets.append(magnet)
        elif has_subtitle_filter == "false" and not magnet_has_subtitle:
            filtered_magnets.append(magnet)

    if filtered_magnets:
        return filtered_magnets[0]
    return None


def normalize_cilisousuo_subtitle_filter(
    has_subtitle_filter: str | None = None,
    allow_chinese_subtitles: bool | None = None,
    allow_param_present: bool = False,
) -> str | None:
    if has_subtitle_filter in ("true", "false"):
        return has_subtitle_filter
    if allow_param_present:
        return None if allow_chinese_subtitles else "false"
    return None


def normalize_subtitle_filter_for_source(
    magnet_source: str = "javbus",
    has_subtitle_filter: str | None = None,
    allow_chinese_subtitles: bool | None = None,
    allow_param_present: bool = False,
) -> str | None:
    if magnet_source == "cilisousuo":
        return normalize_cilisousuo_subtitle_filter(
            has_subtitle_filter=has_subtitle_filter,
            allow_chinese_subtitles=allow_chinese_subtitles,
            allow_param_present=allow_param_present,
        )

    if has_subtitle_filter in ("true", "false"):
        return has_subtitle_filter
    return None


def has_valid_javbus_movie_params(movie_data: dict[str, Any] | None) -> bool:
    return bool(movie_data and movie_data.get("gid") and movie_data.get("uc") is not None)


async def fetch_javbus_magnet_data(movie_id: str, movie_data: dict[str, Any]) -> Any | None:
    if not has_valid_javbus_movie_params(movie_data):
        return None

    magnet_url = f"{JAVBUS_API_BASE_URL}/api/magnets/{movie_id}"
    magnet_params = {
        "gid": movie_data["gid"],
        "uc": movie_data["uc"],
        "sortBy": "size",
        "sortOrder": "desc",
    }
    return await api_client.get_json(magnet_url, magnet_params)


async def get_cilisousuo_best_magnet_payload(
    movie_id: str,
    has_subtitle_filter: str | None = None,
    exclude_4k: bool = False,
) -> dict[str, Any] | None:
    best_result = await cilisousuo_get_best_result(
        movie_id,
        has_subtitle_filter=has_subtitle_filter,
        exclude_4k=exclude_4k,
    )
    if not best_result or not best_result.magnet:
        return None

    has_subtitle = _has_chinese_subtitle(best_result.title) or _has_chinese_subtitle(best_result.filename)
    title = best_result.title or best_result.filename or f"{movie_id} - 最佳资源"
    return {
        "link": best_result.magnet,
        "title": title,
        "size": best_result.size or "未知",
        "date": "未知",
        "hasSubtitle": has_subtitle,
    }


async def get_best_magnet_payload(
    movie_id: str,
    magnet_source: str = "javbus",
    has_subtitle_filter: str | None = None,
    exclude_4k: bool = False,
    allow_chinese_subtitles: bool | None = None,
    allow_param_present: bool = False,
    movie_data: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    effective_has_subtitle_filter = normalize_subtitle_filter_for_source(
        magnet_source=magnet_source,
        has_subtitle_filter=has_subtitle_filter,
        allow_chinese_subtitles=allow_chinese_subtitles,
        allow_param_present=allow_param_present,
    )

    if magnet_source == "cilisousuo":
        return await get_cilisousuo_best_magnet_payload(
            movie_id,
            has_subtitle_filter=effective_has_subtitle_filter,
            exclude_4k=exclude_4k,
        )

    if movie_data is None:
        movie_data = await get_movie_detail(movie_id)
    if not has_valid_javbus_movie_params(movie_data):
        return None

    magnet_data = await fetch_javbus_magnet_data(movie_id, movie_data)
    return select_best_magnet_with_subtitle_filter(magnet_data, effective_has_subtitle_filter, exclude_4k)


async def build_movie_with_best_magnet_result(
    movie_id: str,
    magnet_source: str = "javbus",
    has_subtitle_filter: str | None = None,
    exclude_4k: bool = False,
    allow_chinese_subtitles: bool | None = None,
    allow_param_present: bool = False,
) -> dict[str, Any]:
    movie_data = await get_movie_detail(movie_id)
    if magnet_source != "cilisousuo" and not has_valid_javbus_movie_params(movie_data):
        return {"movie_id": movie_id, "success": False, "error": "影片不存在或无法获取参数"}

    best_magnet = await get_best_magnet_payload(
        movie_id,
        magnet_source=magnet_source,
        has_subtitle_filter=has_subtitle_filter,
        exclude_4k=exclude_4k,
        allow_chinese_subtitles=allow_chinese_subtitles,
        allow_param_present=allow_param_present,
        movie_data=movie_data,
    )

    return {
        "movie_id": movie_id,
        "success": True,
        "title": movie_data.get("title", movie_id) if movie_data else movie_id,
        "date": movie_data.get("date", "未知") if movie_data else "未知",
        "is_downloaded": await download_history_service.is_movie_downloaded(movie_id),
        "best_magnet": best_magnet,
    }


async def get_magnets_payload(movie_id: str, request_query: dict[str, str]) -> Any:
    magnet_source = request_query.get("source", "javbus")
    allow_chinese_subtitles = request_query.get("allowChineseSubtitles", "false").lower() == "true"
    has_subtitle_filter = request_query.get("hasSubtitle")
    exclude_4k = request_query.get("exclude4k", "false").lower() == "true"

    if magnet_source == "cilisousuo":
        best_magnet = await get_best_magnet_payload(
            movie_id,
            magnet_source=magnet_source,
            has_subtitle_filter=has_subtitle_filter,
            exclude_4k=exclude_4k,
            allow_chinese_subtitles=allow_chinese_subtitles,
            allow_param_present="allowChineseSubtitles" in request_query,
        )
        return [best_magnet] if best_magnet else []

    api_url = f"{JAVBUS_API_BASE_URL}/api/magnets/{movie_id}"
    query_params = dict(request_query)
    query_params.pop("hasSubtitle", None)
    query_params.pop("source", None)
    query_params.pop("exclude4k", None)

    if "gid" not in query_params or "uc" not in query_params:
        movie_data = await get_movie_detail(movie_id)
        if movie_data and "gid" in movie_data and "uc" in movie_data:
            query_params["gid"] = str(movie_data["gid"])
            query_params["uc"] = str(movie_data["uc"])
        else:
            logger.warning("无法从影片详情获取必需的 gid/uc 参数: %s", movie_id)

    data = await api_client.get_json(api_url, query_params)
    if data is None:
        return {"error": "获取磁力链接失败", "message": "API请求失败"}

    if exclude_4k and data:
        filtered_data = [magnet for magnet in data if not is_4k_resource(magnet.get("title", ""))]
        if filtered_data:
            logger.info("排除4K后剩余 %s 个磁力链接", len(filtered_data))
            data = filtered_data
        else:
            logger.warning("排除4K后没有可用的磁力链接，将返回原始列表")

    if has_subtitle_filter and data:
        filtered_data: list[dict[str, Any]] = []
        for magnet in data:
            magnet_has_subtitle = magnet.get("hasSubtitle", False)
            if not magnet_has_subtitle and _has_chinese_subtitle(magnet.get("title", "")):
                magnet_has_subtitle = True

            if has_subtitle_filter == "true" and magnet_has_subtitle:
                filtered_data.append(magnet)
            elif has_subtitle_filter == "false" and not magnet_has_subtitle:
                filtered_data.append(magnet)

        return filtered_data

    return data
