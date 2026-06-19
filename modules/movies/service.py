import asyncio
import json
import logging
import re
from typing import Any

from fastapi import Request

from modules.javbus_api import javbus_api_service
from .schemas import BatchMoviesRequest


logger = logging.getLogger(__name__)

FILTER_DETAIL_FIELDS = {
    "star": ("stars",),
    "genre": ("genres",),
    "director": ("director",),
    "studio": ("producer", "studio"),
    "label": ("publisher", "label"),
    "series": ("series",),
}


async def get_movie_detail(movie_id: str) -> Any | None:
    try:
        return await javbus_api_service.get_movie_detail(movie_id)
    except Exception as exc:
        logger.error("Failed to get movie detail %s: %s", movie_id, exc)
        return None


def _matches_actor_count_filter(actor_count: int, actor_count_filter: str) -> bool:
    if actor_count_filter == "1":
        return actor_count == 1
    if actor_count_filter == "2":
        return actor_count == 2
    if actor_count_filter == "3":
        return actor_count == 3
    if actor_count_filter == "<=2":
        return actor_count <= 2
    if actor_count_filter == "<=3":
        return actor_count <= 3
    if actor_count_filter == ">=3":
        return actor_count >= 3
    if actor_count_filter == ">=4":
        return actor_count >= 4
    return True


def _normalize_filter_value(value: Any) -> str:
    return str(value or "").strip().lower()


def _iter_detail_values(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        values: list[str] = []
        for item in value:
            values.extend(_iter_detail_values(item))
        return values
    if isinstance(value, dict):
        values = []
        for key in ("id", "name"):
            normalized = _normalize_filter_value(value.get(key))
            if normalized:
                values.append(normalized)
                if "/" in normalized:
                    values.append(normalized.rsplit("/", 1)[-1])
        return values
    normalized = _normalize_filter_value(value)
    return [normalized] if normalized else []


def _parse_filter_conditions(query_params: Any) -> list[dict[str, str]]:
    conditions: list[dict[str, str]] = []
    raw_filters = query_params.get("filters")
    if raw_filters:
        try:
            decoded = json.loads(raw_filters)
        except json.JSONDecodeError:
            decoded = []
        if isinstance(decoded, list):
            for item in decoded:
                if not isinstance(item, dict):
                    continue
                filter_type = str(item.get("type") or "").strip()
                filter_value = str(item.get("value") or "").strip()
                if filter_type in FILTER_DETAIL_FIELDS and filter_value:
                    conditions.append(
                        {
                            "type": filter_type,
                            "value": filter_value,
                            "label": str(item.get("label") or "").strip(),
                        }
                    )

    if not conditions:
        filter_type = str(query_params.get("filterType") or "").strip()
        filter_value = str(query_params.get("filterValue") or "").strip()
        if filter_type in FILTER_DETAIL_FIELDS and filter_value:
            conditions.append({"type": filter_type, "value": filter_value, "label": ""})

    deduped: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for condition in conditions:
        key = (condition["type"], condition["value"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(condition)
    return deduped


def _build_list_query_params(query_params: Any, filter_conditions: list[dict[str, str]]) -> dict[str, Any]:
    list_query_params = dict(query_params)
    list_query_params.pop("actorCountFilter", None)
    list_query_params.pop("hasSubtitle", None)
    list_query_params.pop("filters", None)

    if filter_conditions:
        seed_filter = filter_conditions[0]
        list_query_params["filterType"] = seed_filter["type"]
        list_query_params["filterValue"] = seed_filter["value"]

    return list_query_params


def _movie_detail_matches_filter(movie_detail: dict[str, Any], condition: dict[str, str]) -> bool:
    expected_values = {
        _normalize_filter_value(condition.get("value")),
        _normalize_filter_value(condition.get("label")),
    }
    expected_values = {value for value in expected_values if value}
    if not expected_values:
        return True

    detail_values: set[str] = set()
    for field_name in FILTER_DETAIL_FIELDS[condition["type"]]:
        detail_values.update(_iter_detail_values(movie_detail.get(field_name)))

    return bool(detail_values.intersection(expected_values))


async def _filter_movies_by_detail(
    movies: list[dict[str, Any]],
    filter_conditions: list[dict[str, str]],
    actor_count_filter: str | None,
    semaphore_size: int,
) -> list[dict[str, Any]]:
    if not movies or (len(filter_conditions) <= 1 and not actor_count_filter):
        return movies

    semaphore = asyncio.Semaphore(semaphore_size)

    async def check_movie_filters(movie: dict[str, Any]) -> dict[str, Any] | None:
        try:
            movie_detail = await get_movie_detail(movie["id"])
            if not movie_detail:
                return None
            if actor_count_filter and not _matches_actor_count_filter(len(movie_detail.get("stars") or []), actor_count_filter):
                return None
            if filter_conditions and not all(
                _movie_detail_matches_filter(movie_detail, condition) for condition in filter_conditions
            ):
                return None
            return movie
        except Exception as exc:
            logger.error("检查影片 %s 筛选条件失败: %s", movie.get("id"), exc)
            return None

    async def limited_check(movie: dict[str, Any]) -> dict[str, Any] | None:
        async with semaphore:
            return await check_movie_filters(movie)

    results = await asyncio.gather(*[limited_check(movie) for movie in movies])
    return [movie for movie in results if movie is not None]


async def get_movies_payload(request: Request) -> dict[str, Any]:
    actor_count_filter = request.query_params.get("actorCountFilter")
    filter_conditions = _parse_filter_conditions(request.query_params)

    query_params = _build_list_query_params(request.query_params, filter_conditions)

    data = await javbus_api_service.get_movies_by_page(query_params)
    if data is None:
        return {"error": "获取影片列表失败", "message": "API请求失败"}

    if data.get("movies"):
        filtered_movies = await _filter_movies_by_detail(data["movies"], filter_conditions, actor_count_filter, 3)
        data["movies"] = filtered_movies
        if "pagination" in data:
            data["pagination"]["total"] = len(filtered_movies)

    return data


async def get_all_movies_payload(request: Request) -> dict[str, Any]:
    actor_count_filter = request.query_params.get("actorCountFilter")
    filter_conditions = _parse_filter_conditions(request.query_params)
    query_params = _build_list_query_params(request.query_params, filter_conditions)
    query_params.pop("page", None)

    all_movies: list[dict[str, Any]] = []
    current_page = 1
    total_pages = None

    while True:
        page_params = query_params.copy()
        page_params["page"] = str(current_page)

        data = await javbus_api_service.get_movies_by_page(page_params)
        if not data.get("movies"):
            break

        all_movies.extend(data["movies"])
        if total_pages is None and data.get("pagination"):
            total_pages = data["pagination"].get("totalPages")
            if total_pages is None:
                pages = data["pagination"].get("pages", [])
                if pages:
                    total_pages = max(pages)

        if total_pages and current_page >= total_pages:
            break
        if not total_pages and len(data["movies"]) < 30:
            break

        current_page += 1
        if current_page > 100:
            logger.warning("达到最大页数限制(100页)，停止获取")
            break

    if all_movies:
        filtered_movies: list[dict[str, Any]] = []

        batch_size = 50
        for index in range(0, len(all_movies), batch_size):
            batch = all_movies[index : index + batch_size]
            filtered_movies.extend(await _filter_movies_by_detail(batch, filter_conditions, actor_count_filter, 5))

        all_movies = filtered_movies

    return {
        "movies": all_movies,
        "total_count": len(all_movies),
        "total_pages": current_page - 1,
        "is_all_pages": True,
        "pagination": {
            "currentPage": "all",
            "totalPages": current_page - 1,
            "total": len(all_movies),
        },
    }


async def get_movies_search_payload(request: Request) -> dict[str, Any]:
    keyword = (request.query_params.get("keyword") or "").strip()
    page = request.query_params.get("page") or "1"
    magnet = request.query_params.get("magnet") or "exist"
    movie_type = request.query_params.get("type")
    if not keyword:
        return {"error": "`keyword` is required", "messages": ["`keyword` is required"]}

    try:
        return await javbus_api_service.get_movies_by_keyword_and_page(keyword, page, magnet, movie_type)
    except Exception as exc:
        if "404" in str(exc):
            return {
                "movies": [],
                "pagination": {
                    "currentPage": int(page),
                    "hasNextPage": False,
                    "nextPage": None,
                    "pages": [],
                },
                "keyword": keyword,
            }
        logger.error("Failed to search movies by keyword %s: %s", keyword, exc)
        return {"error": "Failed to search movies", "message": "JavBus request failed"}


def parse_movie_codes(movie_codes_input: str) -> list[str]:
    if not movie_codes_input or not movie_codes_input.strip():
        return []

    cleaned_input = movie_codes_input.strip().upper()
    movie_codes = re.split(r"[,，\s\n\r\t;；]+", cleaned_input)
    movie_codes = [code.strip() for code in movie_codes if code.strip()]

    valid_codes: list[str] = []
    for code in movie_codes:
        if re.match(r"^[A-Z0-9\-]+$", code) and len(code) >= 3:
            valid_codes.append(code)
        else:
            logger.warning("跳过无效番号格式: %s", code)

    logger.info("解析到 %s 个有效番号: %s", len(valid_codes), valid_codes)
    return valid_codes


def parse_movies_from_html(html_content: str) -> list[dict[str, Any]]:
    movies: list[dict[str, Any]] = []
    try:
        videothumblist_match = re.search(
            r'<div class="videothumblist">(.*?)</div><!-- end of videothumblist -->',
            html_content,
            re.DOTALL,
        )
        if not videothumblist_match:
            logger.warning("未找到videothumblist区域")
            return movies

        video_pattern = r'<div class="video"[^>]*?>(.*?)<div class="toolbar".*?</div>\s*</div>'
        video_matches = re.findall(video_pattern, html_content, re.DOTALL)
        logger.info("找到 %s 个影片匹配项", len(video_matches))

        for index, video_content in enumerate(video_matches):
            title_match = re.search(r'title="([^"]+)"', video_content)
            id_match = re.search(r'<div class="id">([^<]+)</div>', video_content)
            if not title_match or not id_match:
                continue

            full_title = title_match.group(1).strip()
            movie_id = id_match.group(1).strip()
            title_parts = full_title.split(" ", 1)
            title = title_parts[1] if len(title_parts) > 1 else full_title

            movies.append(
                {
                    "id": movie_id,
                    "title": title,
                    "full_title": full_title,
                    "rank": index + 1,
                }
            )

        logger.info("总共解析到 %s 部影片", len(movies))
    except Exception as exc:
        logger.error("解析HTML内容失败: %s", exc)

    return movies


async def parse_batch_movies_request(request: Request) -> BatchMoviesRequest:
    body = await request.json()
    if isinstance(body, list):
        return BatchMoviesRequest(movie_ids=body)

    if not isinstance(body, dict):
        raise ValueError("请求体必须是 JSON 对象或字符串列表")

    payload: dict[str, Any] = {
        "movie_ids": body.get("movie_ids", []),
        "has_subtitle_filter": body.get("has_subtitle_filter"),
        "magnet_source": body.get("magnet_source", "javbus"),
        "exclude_4k": body.get("exclude_4k", False),
    }
    if "allow_chinese_subtitles" in body:
        payload["allow_chinese_subtitles"] = body.get("allow_chinese_subtitles")

    return BatchMoviesRequest(**payload)
