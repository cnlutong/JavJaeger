import asyncio
import logging
import re
from typing import Any

from fastapi import Request

from modules.common.runtime import JAVBUS_API_BASE_URL, api_client
from .schemas import BatchMoviesRequest


logger = logging.getLogger(__name__)


async def get_movie_detail(movie_id: str) -> Any | None:
    movie_url = f"{JAVBUS_API_BASE_URL}/api/movies/{movie_id}"
    return await api_client.get_json(movie_url)


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


async def get_movies_payload(request: Request) -> dict[str, Any]:
    api_url = f"{JAVBUS_API_BASE_URL}/api/movies"
    actor_count_filter = request.query_params.get("actorCountFilter")

    query_params = dict(request.query_params)
    query_params.pop("actorCountFilter", None)
    query_params.pop("hasSubtitle", None)

    data = await api_client.get_json(api_url, query_params)
    if data is None:
        return {"error": "获取影片列表失败", "message": "API请求失败"}

    if actor_count_filter and data.get("movies"):
        semaphore = asyncio.Semaphore(3)

        async def check_movie_filters(movie: dict[str, Any]) -> dict[str, Any] | None:
            try:
                movie_detail = await get_movie_detail(movie["id"])
                if not movie_detail or "stars" not in movie_detail:
                    return None
                if _matches_actor_count_filter(len(movie_detail["stars"]), actor_count_filter):
                    return movie
                return None
            except Exception as exc:
                logger.error("检查影片 %s 筛选条件失败: %s", movie["id"], exc)
                return None

        async def limited_check(movie: dict[str, Any]) -> dict[str, Any] | None:
            async with semaphore:
                return await check_movie_filters(movie)

        results = await asyncio.gather(*[limited_check(movie) for movie in data["movies"]])
        filtered_movies = [movie for movie in results if movie is not None]
        data["movies"] = filtered_movies
        if "pagination" in data:
            data["pagination"]["total"] = len(filtered_movies)

    return data


async def get_all_movies_payload(request: Request) -> dict[str, Any]:
    actor_count_filter = request.query_params.get("actorCountFilter")
    query_params = dict(request.query_params)
    query_params.pop("actorCountFilter", None)
    query_params.pop("hasSubtitle", None)
    query_params.pop("page", None)

    all_movies: list[dict[str, Any]] = []
    current_page = 1
    total_pages = None

    while True:
        api_url = f"{JAVBUS_API_BASE_URL}/api/movies"
        page_params = query_params.copy()
        page_params["page"] = str(current_page)

        data = await api_client.get_json(api_url, page_params)
        if data is None or not data.get("movies"):
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

    if actor_count_filter and all_movies:
        filtered_movies: list[dict[str, Any]] = []
        semaphore = asyncio.Semaphore(5)

        async def check_movie_filters(movie: dict[str, Any]) -> dict[str, Any] | None:
            try:
                movie_detail = await get_movie_detail(movie["id"])
                if not movie_detail or "stars" not in movie_detail:
                    return None
                if _matches_actor_count_filter(len(movie_detail["stars"]), actor_count_filter):
                    return movie
                return None
            except Exception as exc:
                logger.error("检查影片 %s 筛选条件失败: %s", movie["id"], exc)
                return None

        async def limited_check(movie: dict[str, Any]) -> dict[str, Any] | None:
            async with semaphore:
                return await check_movie_filters(movie)

        batch_size = 50
        for index in range(0, len(all_movies), batch_size):
            batch = all_movies[index : index + batch_size]
            results = await asyncio.gather(*[limited_check(movie) for movie in batch])
            filtered_movies.extend([movie for movie in results if movie is not None])

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
