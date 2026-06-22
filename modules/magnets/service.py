import asyncio
import copy
import logging
import re
from typing import Any
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from cilisousuo_cli import (
    _has_chinese_subtitle,
    filter_4k_results as cilisousuo_filter_4k_results,
    filter_results_by_subtitle as cilisousuo_filter_results_by_subtitle,
    is_4k_resource,
    parse_size_to_bytes,
    search_cilisousuo,
    select_best_result as cilisousuo_select_best_result,
)

from modules.common import runtime
from modules.history.service import download_history_service, local_movie_library_service
from modules.javbus_api import javbus_api_service
from modules.movies.service import get_movie_detail


logger = logging.getLogger(__name__)

YHG007_BASE_URL = "https://yhg007.com"
DIRECT_SEARCH_MAGNET_SOURCES = {"cilisousuo", "yhg007"}
MAGNET_HEALTH_SEEDER_KEYS = ("seeders", "seeder", "seeds", "seed", "numSeeders")
MAGNET_HEALTH_PEER_KEYS = ("peers", "peer", "leechers", "leeches", "connections")
MAGNET_HEALTH_AVAILABILITY_KEYS = ("availability", "available")
MAGNET_HEALTH_SCORE_KEYS = ("health_score", "score", "hot", "heat")


def _candidate_identity(magnet: dict[str, Any]) -> tuple[str, str]:
    return (str(magnet.get("link") or ""), str(magnet.get("id") or ""))


def _parse_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return float(int(value))
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _first_numeric_value(magnet: dict[str, Any], keys: tuple[str, ...]) -> float | None:
    for key in keys:
        value = _parse_float(magnet.get(key))
        if value is not None:
            return value
    return None


def _extract_health_metrics(magnet: dict[str, Any]) -> dict[str, float]:
    metrics: dict[str, float] = {}
    seeders = _first_numeric_value(magnet, MAGNET_HEALTH_SEEDER_KEYS)
    peers = _first_numeric_value(magnet, MAGNET_HEALTH_PEER_KEYS)
    availability = _first_numeric_value(magnet, MAGNET_HEALTH_AVAILABILITY_KEYS)
    score = _first_numeric_value(magnet, MAGNET_HEALTH_SCORE_KEYS)
    if seeders is not None:
        metrics["seeders"] = seeders
    if peers is not None:
        metrics["peers"] = peers
    if availability is not None:
        metrics["availability"] = availability
    if score is not None:
        metrics["score"] = score
    return metrics


def _merge_health_metrics(base: dict[str, float], override: dict[str, float]) -> dict[str, float]:
    merged = dict(base)
    for key, value in override.items():
        if value is not None:
            merged[key] = value
    return merged


def _computed_health_score(metrics: dict[str, float]) -> float | None:
    if "score" in metrics:
        return metrics["score"]
    if not metrics:
        return None
    seeders = metrics.get("seeders", 0)
    peers = metrics.get("peers", 0)
    availability = metrics.get("availability", 0)
    return float(seeders) + min(float(peers) * 0.25, 10.0) + max(float(availability) - 1.0, 0.0)


def _health_decision(metrics: dict[str, float], config: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
    if not metrics:
        acceptable = bool(config.get("allow_unknown", True))
        return acceptable, {
            "status": "unknown",
            "reason": "no_health_metrics",
            "score": None,
        }

    score = _computed_health_score(metrics)
    health = {
        "status": "healthy",
        "score": score,
        "seeders": int(metrics["seeders"]) if "seeders" in metrics else None,
        "peers": int(metrics["peers"]) if "peers" in metrics else None,
        "availability": metrics.get("availability"),
    }

    min_seeders = int(config.get("min_seeders") or 0)
    min_peers = int(config.get("min_peers") or 0)
    min_availability = float(config.get("min_availability") or 0)
    min_score = float(config.get("min_score") or 0)

    failures: list[str] = []
    if "seeders" in metrics and metrics["seeders"] < min_seeders:
        failures.append("seeders_below_threshold")
    if "peers" in metrics and metrics["peers"] < min_peers:
        failures.append("peers_below_threshold")
    if "availability" in metrics and metrics["availability"] < min_availability:
        failures.append("availability_below_threshold")
    if score is not None and score < min_score:
        failures.append("score_below_threshold")

    if failures:
        health["status"] = "low"
        health["reason"] = failures[0]
        return False, health
    return True, health


async def _aria2_rpc(client: httpx.AsyncClient, rpc_url: str, secret: str, method: str, params: list[Any] | None = None) -> Any:
    rpc_params: list[Any] = []
    if secret:
        rpc_params.append(f"token:{secret}")
    rpc_params.extend(params or [])
    response = await client.post(
        rpc_url,
        json={"jsonrpc": "2.0", "id": "magnet-health", "method": f"aria2.{method}", "params": rpc_params},
    )
    response.raise_for_status()
    payload = response.json()
    if "error" in payload:
        raise RuntimeError(payload["error"].get("message") or payload["error"])
    return payload.get("result")


async def _remove_aria2_probe(client: httpx.AsyncClient, rpc_url: str, secret: str, gid: str) -> None:
    for method in ("forceRemove", "removeDownloadResult"):
        try:
            await _aria2_rpc(client, rpc_url, secret, method, [gid])
        except Exception:
            continue


async def _probe_magnet_health_with_aria2(magnet_link: str, config: dict[str, Any]) -> dict[str, float]:
    aria2_config = runtime.get_aria2_config()
    if not aria2_config.get("enabled") or not aria2_config.get("url"):
        return {}

    rpc_url = str(aria2_config.get("url") or "")
    secret = str(aria2_config.get("secret") or "")
    timeout_seconds = float(config.get("probe_timeout_seconds") or 20.0)
    gid = ""
    followed_by: list[str] = []
    metrics: dict[str, float] = {}
    async with httpx.AsyncClient(timeout=max(timeout_seconds + 5.0, 10.0)) as client:
        try:
            gid = await _aria2_rpc(
                client,
                rpc_url,
                secret,
                "addUri",
                [
                    [magnet_link],
                    {
                        "bt-metadata-only": "true",
                        "bt-save-metadata": "false",
                        "bt-stop-timeout": str(int(timeout_seconds)),
                        "seed-time": "0",
                    },
                ],
            )
            deadline = asyncio.get_running_loop().time() + timeout_seconds
            while asyncio.get_running_loop().time() < deadline:
                status = await _aria2_rpc(
                    client,
                    rpc_url,
                    secret,
                    "tellStatus",
                    [
                        gid,
                        ["gid", "status", "numSeeders", "connections", "followedBy", "errorCode", "errorMessage"],
                    ],
                )
                if isinstance(status, dict):
                    seeders = _parse_float(status.get("numSeeders"))
                    peers = _parse_float(status.get("connections"))
                    if seeders is not None:
                        metrics["seeders"] = seeders
                    if peers is not None:
                        metrics["peers"] = peers
                    if isinstance(status.get("followedBy"), list):
                        followed_by = [str(item) for item in status["followedBy"] if item]
                    if status.get("status") in {"complete", "error", "removed"}:
                        break
                await asyncio.sleep(1.0)
        except Exception as exc:
            logger.warning("Aria2 magnet health probe failed: %s", exc)
            return metrics
        finally:
            cleanup_ids = [gid, *followed_by]
            for cleanup_gid in cleanup_ids:
                if cleanup_gid:
                    await _remove_aria2_probe(client, rpc_url, secret, cleanup_gid)
    return metrics


async def assess_magnet_health(magnet: dict[str, Any], config: dict[str, Any] | None = None) -> tuple[bool, dict[str, Any]]:
    health_config = config or runtime.get_magnet_health_config()
    if not health_config.get("enabled"):
        return True, {"status": "disabled"}

    metrics = _extract_health_metrics(magnet)
    if health_config.get("probe_with_aria2") and magnet.get("link"):
        probed_metrics = await _probe_magnet_health_with_aria2(str(magnet["link"]), health_config)
        metrics = _merge_health_metrics(metrics, probed_metrics)
    return _health_decision(metrics, health_config)


async def select_healthy_best_magnet(
    candidates: list[dict[str, Any]],
    select_best,
    health_config: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    remaining = list(candidates or [])
    active_config = health_config or runtime.get_magnet_health_config()
    while remaining:
        selected = select_best(remaining)
        if not selected:
            return None
        acceptable, health = await assess_magnet_health(selected, active_config)
        result = copy.deepcopy(selected)
        if active_config.get("enabled"):
            result["health"] = health
        if acceptable:
            return result

        selected_identity = _candidate_identity(selected)
        next_remaining = [
            candidate
            for candidate in remaining
            if candidate is not selected and _candidate_identity(candidate) != selected_identity
        ]
        if len(next_remaining) == len(remaining):
            next_remaining = remaining[1:]
        remaining = next_remaining
    return None


def _filter_javbus_magnet_candidates(
    magnet_data: list[dict[str, Any]] | None,
    has_subtitle_filter: str | None = None,
    exclude_4k: bool = False,
) -> list[dict[str, Any]]:
    if not magnet_data:
        return []

    candidates = list(magnet_data)
    if exclude_4k:
        filtered_data = [magnet for magnet in candidates if not is_4k_resource(magnet.get("title", ""))]
        if filtered_data:
            candidates = filtered_data
            logger.info("排除4K后剩余 %s 个磁力链接", len(candidates))
        else:
            logger.warning("排除4K后没有可用的磁力链接，将使用原始列表")

    if not has_subtitle_filter:
        return candidates

    filtered_magnets: list[dict[str, Any]] = []
    for magnet in candidates:
        magnet_has_subtitle = magnet.get("hasSubtitle", False)
        if not magnet_has_subtitle and _has_chinese_subtitle(magnet.get("title", "")):
            magnet_has_subtitle = True

        if has_subtitle_filter == "true" and magnet_has_subtitle:
            filtered_magnets.append(magnet)
        elif has_subtitle_filter == "false" and not magnet_has_subtitle:
            filtered_magnets.append(magnet)
    return filtered_magnets


def select_best_magnet_with_subtitle_filter(
    magnet_data: list[dict[str, Any]] | None,
    has_subtitle_filter: str | None = None,
    exclude_4k: bool = False,
) -> dict[str, Any] | None:
    candidates = _filter_javbus_magnet_candidates(magnet_data, has_subtitle_filter, exclude_4k)
    return candidates[0] if candidates else None


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


def _magnet_source_requires_javbus_movie_params(magnet_source: str) -> bool:
    return magnet_source not in DIRECT_SEARCH_MAGNET_SOURCES


def has_valid_javbus_movie_params(movie_data: dict[str, Any] | None) -> bool:
    return bool(movie_data and movie_data.get("gid") and movie_data.get("uc") is not None)


async def fetch_javbus_magnet_data(movie_id: str, movie_data: dict[str, Any]) -> Any | None:
    if not has_valid_javbus_movie_params(movie_data):
        return None

    return await javbus_api_service.get_movie_magnets(
        movie_id,
        str(movie_data["gid"]),
        str(movie_data["uc"]),
        sort_by="size",
        sort_order="desc",
    )


async def get_cilisousuo_best_magnet_payload(
    movie_id: str,
    has_subtitle_filter: str | None = None,
    exclude_4k: bool = False,
) -> dict[str, Any] | None:
    results = await search_cilisousuo(movie_id, resolve_detail=True, allow_chinese_subtitles=has_subtitle_filter != "false")
    results = cilisousuo_filter_results_by_subtitle(results, has_subtitle_filter)
    if exclude_4k:
        filtered_results = cilisousuo_filter_4k_results(results)
        if filtered_results:
            results = filtered_results
    if not results:
        return None

    def to_payload(result: Any) -> dict[str, Any]:
        has_subtitle = _has_chinese_subtitle(result.title) or _has_chinese_subtitle(result.filename)
        title = result.title or result.filename or f"{movie_id} - 最佳资源"
        return {
            "link": result.magnet,
            "title": title,
            "filename": result.filename,
            "size": result.size or "未知",
            "date": "未知",
            "hasSubtitle": has_subtitle,
            "source": "cilisousuo",
        }

    candidates = [to_payload(result) for result in results if getattr(result, "magnet", None)]
    payload_by_link = {payload["link"]: payload for payload in candidates}

    def select_best_payload(remaining: list[dict[str, Any]]) -> dict[str, Any] | None:
        remaining_links = {item.get("link") for item in remaining}
        source_remaining = [result for result in results if getattr(result, "magnet", None) in remaining_links]
        selected = cilisousuo_select_best_result(source_remaining, exclude_4k=False)
        if selected and selected.magnet:
            return payload_by_link.get(selected.magnet)
        return remaining[0] if remaining else None

    return await select_healthy_best_magnet(
        candidates,
        select_best_payload,
    )


def _build_yhg007_headers() -> dict[str, str]:
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }


def _normalize_yhg007_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _parse_yhg007_sbar(item: Any) -> dict[str, str]:
    fields: dict[str, str] = {}
    sbar = item.find("div", class_="sbar")
    if not sbar:
        return fields

    for span in sbar.find_all("span"):
        text = _normalize_yhg007_text(span.get_text(" ", strip=True))
        if text.startswith("添加时间:"):
            fields["date"] = text.split(":", 1)[1].strip()
        elif text.startswith("大小:"):
            fields["size"] = text.split(":", 1)[1].strip()
        elif text.startswith("热度:"):
            fields["hot"] = text.split(":", 1)[1].strip()
    return fields


def parse_yhg007_search_results(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    results: list[dict[str, Any]] = []
    for item in soup.select(".ssbox"):
        magnet_anchor = item.find("a", href=lambda href: isinstance(href, str) and href.startswith("magnet:"))
        if not magnet_anchor:
            continue

        title_node = item.select_one(".title h3")
        title = _normalize_yhg007_text(title_node.get_text(" ", strip=True) if title_node else "")
        file_names = [
            _normalize_yhg007_text(li.get_text(" ", strip=True))
            for li in item.select(".slist li")
            if _normalize_yhg007_text(li.get_text(" ", strip=True))
        ]
        filename_text = " ".join(file_names)
        sbar_fields = _parse_yhg007_sbar(item)
        size = sbar_fields.get("size") or ""
        date = sbar_fields.get("date") or ""
        combined_text = f"{title} {filename_text}"

        results.append(
            {
                "link": magnet_anchor.get("href"),
                "title": title or filename_text,
                "filename": filename_text,
                "size": size or "未知",
                "date": date or "未知",
                "shareDate": date or "",
                "hasSubtitle": _has_chinese_subtitle(combined_text),
                "source": "yhg007",
                "hot": sbar_fields.get("hot") or "",
            }
        )
    return results


def _filter_yhg007_results(
    results: list[dict[str, Any]],
    has_subtitle_filter: str | None = None,
    exclude_4k: bool = False,
) -> list[dict[str, Any]]:
    filtered = results
    if exclude_4k:
        filtered = [
            result
            for result in filtered
            if not is_4k_resource(result.get("title", ""), result.get("filename", ""))
        ]

    if has_subtitle_filter in ("true", "false"):
        expected = has_subtitle_filter == "true"
        filtered = [result for result in filtered if bool(result.get("hasSubtitle")) == expected]

    return filtered


def _sort_yhg007_results(
    results: list[dict[str, Any]],
    sort_by: str | None = "size",
    sort_order: str | None = "desc",
) -> list[dict[str, Any]]:
    reverse = sort_order != "asc"
    if sort_by == "date":
        return sorted(results, key=lambda result: result.get("date") or "", reverse=reverse)
    if sort_by == "size":
        return sorted(results, key=lambda result: parse_size_to_bytes(result.get("size", "")) or -1, reverse=reverse)
    return results


def _parse_yhg007_hot(value: Any) -> int:
    try:
        return int(str(value or "").replace(",", "").strip() or "0")
    except ValueError:
        return 0


def select_yhg007_best_magnet(results: list[dict[str, Any]]) -> dict[str, Any] | None:
    sized_results: list[tuple[dict[str, Any], float]] = []
    for result in results:
        if not result.get("link"):
            continue
        size_bytes = parse_size_to_bytes(result.get("size", ""))
        if size_bytes is None:
            continue
        sized_results.append((result, size_bytes))

    if not sized_results:
        return next((result for result in results if result.get("link")), None)

    largest_size = max(size_bytes for _result, size_bytes in sized_results)
    minimum_size = largest_size * 0.8
    candidates = [
        (result, size_bytes)
        for result, size_bytes in sized_results
        if size_bytes >= minimum_size
    ]
    if not candidates:
        candidates = sized_results

    best_result, _best_size = max(
        candidates,
        key=lambda item: (_parse_yhg007_hot(item[0].get("hot")), item[1]),
    )
    return best_result


async def fetch_yhg007_magnet_data(
    movie_id: str,
    has_subtitle_filter: str | None = None,
    exclude_4k: bool = False,
    sort_by: str | None = "size",
    sort_order: str | None = "desc",
) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, headers=_build_yhg007_headers()) as client:
        index_response = await client.get(YHG007_BASE_URL)
        index_response.raise_for_status()
        soup = BeautifulSoup(index_response.text, "html.parser")
        token_node = soup.find("input", {"name": "csrf_token"})
        form_payload = {"search": movie_id}
        if token_node and token_node.get("value"):
            form_payload["csrf_token"] = token_node["value"]

        search_response = await client.post(urljoin(YHG007_BASE_URL, "/search"), data=form_payload)
        search_response.raise_for_status()

    results = parse_yhg007_search_results(search_response.text)
    results = _filter_yhg007_results(results, has_subtitle_filter=has_subtitle_filter, exclude_4k=exclude_4k)
    return _sort_yhg007_results(results, sort_by=sort_by, sort_order=sort_order)


async def get_yhg007_best_magnet_payload(
    movie_id: str,
    has_subtitle_filter: str | None = None,
    exclude_4k: bool = False,
) -> dict[str, Any] | None:
    results = await fetch_yhg007_magnet_data(
        movie_id,
        has_subtitle_filter=has_subtitle_filter,
        exclude_4k=exclude_4k,
        sort_by="size",
        sort_order="desc",
    )
    return await select_healthy_best_magnet(results, select_yhg007_best_magnet)


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
    if magnet_source == "yhg007":
        return await get_yhg007_best_magnet_payload(
            movie_id,
            has_subtitle_filter=effective_has_subtitle_filter,
            exclude_4k=exclude_4k,
        )

    if movie_data is None:
        movie_data = await get_movie_detail(movie_id)
    if not has_valid_javbus_movie_params(movie_data):
        return None

    magnet_data = await fetch_javbus_magnet_data(movie_id, movie_data)
    candidates = _filter_javbus_magnet_candidates(magnet_data, effective_has_subtitle_filter, exclude_4k)
    return await select_healthy_best_magnet(candidates, lambda remaining: remaining[0])


async def build_movie_with_best_magnet_result(
    movie_id: str,
    magnet_source: str = "javbus",
    has_subtitle_filter: str | None = None,
    exclude_4k: bool = False,
    allow_chinese_subtitles: bool | None = None,
    allow_param_present: bool = False,
) -> dict[str, Any]:
    movie_data = await get_movie_detail(movie_id)
    if _magnet_source_requires_javbus_movie_params(magnet_source) and not has_valid_javbus_movie_params(movie_data):
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

    in_local_library = await local_movie_library_service.is_movie_present(movie_id)
    return {
        "movie_id": movie_id,
        "success": True,
        "title": movie_data.get("title", movie_id) if movie_data else movie_id,
        "date": movie_data.get("date", "未知") if movie_data else "未知",
        "is_downloaded": await download_history_service.is_movie_downloaded(movie_id) or in_local_library,
        "in_local_library": in_local_library,
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
    if magnet_source == "yhg007":
        results = await fetch_yhg007_magnet_data(
            movie_id,
            has_subtitle_filter=has_subtitle_filter,
            exclude_4k=exclude_4k,
            sort_by=request_query.get("sortBy") or "size",
            sort_order=request_query.get("sortOrder") or "desc",
        )
        if runtime.get_magnet_health_config().get("enabled"):
            best_magnet = await select_healthy_best_magnet(results, select_yhg007_best_magnet)
            return [best_magnet] if best_magnet else []
        return results

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

    data = await javbus_api_service.get_movie_magnets(
        movie_id,
        str(query_params.get("gid") or ""),
        str(query_params.get("uc") or ""),
        sort_by=query_params.get("sortBy"),
        sort_order=query_params.get("sortOrder"),
    )
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

        data = filtered_data

    if runtime.get_magnet_health_config().get("enabled"):
        candidates = _filter_javbus_magnet_candidates(data, None, False)
        best_magnet = await select_healthy_best_magnet(candidates, lambda remaining: remaining[0])
        return [best_magnet] if best_magnet else []

    return data
