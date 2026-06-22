import asyncio
import json
import re
import logging
import os
import time
from datetime import datetime
from typing import Any
from urllib.parse import quote, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from modules.common import runtime
from modules.javbus_api import javbus_api_service


logger = logging.getLogger(__name__)

SUPPORTED_SCRAPER_PROVIDERS = tuple(runtime.SCRAPER_PROVIDER_NAMES)
IMPLEMENTED_SCRAPER_PROVIDERS = set(runtime.IMPLEMENTED_SCRAPER_PROVIDER_NAMES)
DEFAULT_SCRAPER_TIMEOUT_SECONDS = 20.0
DEFAULT_SCRAPER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

R18_BASE_URL = "https://r18.dev"
LIBREDMM_BASE_URL = "https://www.libredmm.com"
JAVLIBRARY_BASE_URL = "https://www.javlibrary.com"
JAVDB_BASE_URL = "https://javdb.com"
JAV321_BASE_URL = "https://jp.jav321.com"
MGSTAGE_BASE_URL = "https://www.mgstage.com"
TOKYOHOT_BASE_URL = "https://www.tokyo-hot.com"
AVENTERTAINMENT_BASE_URL = "https://www.aventertainments.com"
DLGETCHU_BASE_URL = "http://dl.getchu.com"
CARIBBEANCOM_BASE_URL = "https://www.caribbeancom.com"
FC2_BASE_URL = "https://adult.contents.fc2.com"
DMM_BASE_URL = "https://www.dmm.co.jp"
DMM_VIDEO_BASE_URL = "https://video.dmm.co.jp"
JAVSTASH_BASE_URL = "https://javstash.org/graphql"
R18_DMM_PREFIX_RE = re.compile(r"^(\d+)([a-zA-Z].*)$")
R18_CONTENT_ID_RE = re.compile(r"^(\d*)([a-z]+)(\d+)(.*)$")
MOVIE_ID_RE = re.compile(r"([A-Za-z]+[-_]?\d+[A-Za-z]?)")
FC2_ID_RE = re.compile(r"(?i)(?:fc2[\s_-]*ppv[\s_-]*|ppv[\s_-]*)?(\d{5,10})")
CARIBBEAN_ID_RE = re.compile(r"(?i)(?:^|[^0-9])(\d{6})[-_](\d{2,3})(?:[^0-9]|$)")
DMM_CID_RE = re.compile(r"(?i)cid=([^/?&]+)")


def _scraper_log(provider: str, message: str, level: str = "info") -> dict[str, str]:
    return {
        "provider": provider,
        "level": level,
        "message": message,
    }


async def _sleep_for_provider_delay(provider_config: dict[str, Any]) -> None:
    try:
        delay_ms = int(float(provider_config.get("request_delay") or 0))
    except (TypeError, ValueError):
        delay_ms = 0
    if delay_ms > 0:
        await asyncio.sleep(delay_ms / 1000)


def _scraper_timeout(provider_config: dict[str, Any]) -> float:
    for key in ("timeout_seconds", "timeout"):
        value = provider_config.get(key)
        if value in (None, ""):
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return DEFAULT_SCRAPER_TIMEOUT_SECONDS


def _scraper_headers(accept: str = "application/json, text/html, */*") -> dict[str, str]:
    return {
        "User-Agent": DEFAULT_SCRAPER_USER_AGENT,
        "Accept": accept,
        "Accept-Language": "ja,en-US;q=0.8,en;q=0.6",
    }


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _first_string(values: Any) -> str:
    if isinstance(values, list):
        for value in values:
            cleaned = _clean_text(value)
            if cleaned:
                return cleaned
    return _clean_text(values)


def _date_only(value: Any) -> str:
    text = _clean_text(value)
    if not text:
        return ""
    match = re.search(r"\d{4}-\d{2}-\d{2}", text)
    if match:
        return match.group(0)
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return text


def _property(name: Any, item_id: Any = "") -> dict[str, str] | None:
    cleaned = _clean_text(name)
    cleaned_id = _clean_text(item_id)
    if not cleaned and not cleaned_id:
        return None
    return {"id": cleaned_id, "name": cleaned or cleaned_id}


def _properties(names: Any) -> list[dict[str, str]]:
    if not isinstance(names, list):
        names = [names] if names else []
    results: list[dict[str, str]] = []
    seen: set[str] = set()
    for name in names:
        prop = _property(name)
        if not prop or prop["name"] in seen:
            continue
        seen.add(prop["name"])
        results.append(prop)
    return results


def _to_https(value: str) -> str:
    if value.startswith("http://"):
        return f"https://{value.removeprefix('http://')}"
    return value


def _resolve_url(base_url: str, value: Any) -> str:
    raw = _clean_text(value)
    if not raw:
        return ""
    return _to_https(urljoin(f"{base_url.rstrip('/')}/", raw))


def _sample_id_from_url(url: str) -> str:
    filename = url.rstrip("/").rsplit("/", 1)[-1]
    stem = filename.rsplit(".", 1)[0] if "." in filename else filename
    return stem or filename


def _samples_from_urls(base_url: str, values: Any) -> list[dict[str, str]]:
    if not isinstance(values, list):
        return []
    samples: list[dict[str, str]] = []
    seen: set[str] = set()
    for value in values:
        url = _resolve_url(base_url, value)
        if not url or url in seen:
            continue
        seen.add(url)
        samples.append({"id": _sample_id_from_url(url), "src": url, "thumbnail": url})
    return samples


def _dedupe_strings(values: Any) -> list[str]:
    if not isinstance(values, list):
        values = [values] if values else []
    results: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = _clean_text(value)
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        results.append(cleaned)
    return results


def _normalize_compare(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", _clean_text(value).lower())


def _extract_movie_id(value: Any) -> str:
    text = _clean_text(value)
    match = MOVIE_ID_RE.search(text)
    if not match:
        return ""
    return match.group(1).replace("_", "-").upper()


def _strip_title_noise(title: str, movie_id: str, provider_names: list[str]) -> str:
    cleaned = _clean_text(title)
    for separator in ("|", " - "):
        parts = cleaned.split(separator)
        if len(parts) > 1 and any(name.lower() in parts[-1].lower() for name in provider_names):
            cleaned = separator.join(parts[:-1]).strip()
    if movie_id:
        cleaned = re.sub(re.escape(movie_id), "", cleaned, flags=re.IGNORECASE).strip(" -_:|")
    return _clean_text(cleaned)


def _parse_runtime_minutes(value: Any) -> int | None:
    text = _clean_text(value)
    if not text:
        return None
    match = re.search(r"(\d{1,2}):(\d{2})(?::(\d{2}))?", text)
    if match:
        first = int(match.group(1))
        second = int(match.group(2))
        third = int(match.group(3) or 0)
        if match.group(3) is None:
            return first + (1 if second >= 30 else 0)
        return first * 60 + second + (1 if third >= 30 else 0)
    iso = re.search(r"T(?:(\d{1,2})H)?(?:(\d{1,2})M)?(?:(\d{1,2})S)?", text, re.IGNORECASE)
    if iso and any(iso.groups()):
        hours = int(iso.group(1) or 0)
        minutes = int(iso.group(2) or 0)
        seconds = int(iso.group(3) or 0)
        return hours * 60 + minutes + (1 if seconds >= 30 else 0)
    match = re.search(r"(\d{1,4})\s*(?:minutes?|mins?|min|分|分钟|分鐘|分間|m\b)", text, re.IGNORECASE)
    if match:
        return int(match.group(1))
    return None


def _parse_date_value(value: Any) -> str:
    text = _clean_text(value)
    if not text:
        return ""
    match = re.search(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})", text)
    if match:
        return f"{int(match.group(1)):04d}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"
    match = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", text)
    if match:
        return f"{int(match.group(3)):04d}-{int(match.group(1)):02d}-{int(match.group(2)):02d}"
    return _date_only(text)


def _html_doc(html: str) -> BeautifulSoup:
    return BeautifulSoup(html or "", "html.parser")


def _response_text(response: Any) -> str:
    text = getattr(response, "text", None)
    if text is not None:
        return str(text)
    content = getattr(response, "content", b"")
    if isinstance(content, bytes):
        return content.decode("utf-8", errors="replace")
    return str(content or "")


def _raise_for_scraper_status(provider: str, response: Any, html: str = "") -> bool:
    status_code = int(getattr(response, "status_code", 0) or 0)
    if status_code == 404:
        return False
    if status_code != 200:
        raise RuntimeError(f"{provider} returned status code {status_code}")
    lowered = html.lower()
    if "cf-browser-verification" in lowered or "just a moment" in lowered and "cloudflare" in lowered:
        raise RuntimeError(f"{provider} returned a Cloudflare challenge page")
    return True


def _meta_content(doc: BeautifulSoup, *selectors: str) -> str:
    for selector in selectors:
        node = doc.select_one(selector)
        if node:
            value = _clean_text(node.get("content") or node.get("value"))
            if value:
                return value
    return ""


def _first_text(doc: BeautifulSoup, selectors: list[str]) -> str:
    for selector in selectors:
        node = doc.select_one(selector)
        if node:
            value = _clean_text(node.get_text(" "))
            if value:
                return value
    return ""


def _first_attr(doc: BeautifulSoup, base_url: str, candidates: list[tuple[str, str]]) -> str:
    for selector, attr in candidates:
        node = doc.select_one(selector)
        if node:
            value = _resolve_url(base_url, node.get(attr))
            if value:
                return value
    return ""


def _all_attrs(doc: BeautifulSoup, base_url: str, candidates: list[tuple[str, str]]) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    for selector, attr in candidates:
        for node in doc.select(selector):
            url = _resolve_url(base_url, node.get(attr))
            if not url or url in seen:
                continue
            seen.add(url)
            urls.append(url)
    return urls


def _link_texts(doc: BeautifulSoup, selectors: list[str]) -> list[str]:
    values: list[str] = []
    for selector in selectors:
        for node in doc.select(selector):
            values.append(node.get_text(" "))
    return _dedupe_strings(values)


def _field_value(doc: BeautifulSoup, labels: list[str]) -> str:
    needles = [_normalize_compare(label) for label in labels if _clean_text(label)]
    if not needles:
        return ""

    def label_matches(value: str) -> bool:
        normalized = _normalize_compare(value)
        return any(needle and needle in normalized for needle in needles)

    row_selectors = [
        "tr",
        "dl.info",
        ".panel-block",
        ".single-info",
        "li.movie-spec",
        "li.movie-detail__spec",
        ".movie-info li",
        ".items_article_softDevice p",
        "p",
    ]
    for selector in row_selectors:
        for row in doc.select(selector):
            text = _clean_text(row.get_text(" "))
            if not label_matches(text):
                continue
            for value_selector in (".value", ".text", "span.spec-content", "dd", "td:last-child", "a"):
                value_node = row.select_one(value_selector)
                if value_node:
                    value = _clean_text(value_node.get_text(" "))
                    if value and not label_matches(value):
                        return value
            for label in labels:
                pattern = re.compile(re.escape(label), flags=re.IGNORECASE)
                value = _clean_text(pattern.sub("", text, count=1).lstrip(" :：#-"))
                if value and not label_matches(value):
                    return value
    return ""


def _metadata_payload(
    *,
    movie_id: str,
    title: str,
    source_url: str,
    image_url: str = "",
    date: Any = "",
    runtime: Any = None,
    director: Any = "",
    producer: Any = "",
    publisher: Any = "",
    series: Any = "",
    genres: Any = None,
    stars: Any = None,
    sample_urls: Any = None,
    raw: Any = None,
) -> dict[str, Any]:
    resolved_id = _clean_text(movie_id).upper()
    if not resolved_id:
        resolved_id = _extract_movie_id(title).upper()
    runtime_minutes = runtime if isinstance(runtime, int) else _parse_runtime_minutes(runtime)
    return {
        "id": resolved_id,
        "title": _clean_text(title) or resolved_id,
        "img": _to_https(_clean_text(image_url)),
        "date": _parse_date_value(date),
        "videoLength": runtime_minutes,
        "director": _property(director),
        "producer": _property(producer),
        "publisher": _property(publisher),
        "series": _property(series),
        "genres": _properties(_dedupe_strings(genres or [])),
        "stars": _properties(_dedupe_strings(stars or [])),
        "samples": _samples_from_urls(source_url, sample_urls or []),
        "source_url": source_url,
        "raw": raw or {},
    }


async def _fetch_text(
    provider: str,
    url: str,
    provider_config: dict[str, Any],
    *,
    method: str = "GET",
    data: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    cookies: dict[str, str] | None = None,
) -> tuple[str, str]:
    await _sleep_for_provider_delay(provider_config)
    merged_headers = _scraper_headers("text/html,application/json,*/*")
    if headers:
        merged_headers.update(headers)
    async with httpx.AsyncClient(
        timeout=_scraper_timeout(provider_config),
        follow_redirects=True,
        headers=merged_headers,
        cookies=cookies,
    ) as client:
        if method.upper() == "POST":
            if json_body is not None:
                response = await client.post(url, json=json_body, headers=headers)
            else:
                response = await client.post(url, data=data)
        else:
            response = await client.get(url)
    html = _response_text(response)
    if not _raise_for_scraper_status(provider, response, html):
        return "", url
    final_url = str(getattr(response, "url", "") or url)
    return html, final_url


def _first_matching_link(doc: BeautifulSoup, base_url: str, selectors: list[str], movie_id: str = "") -> str:
    target = _normalize_compare(movie_id)
    candidates: list[str] = []
    for selector in selectors:
        for node in doc.select(selector):
            href = _clean_text(node.get("href"))
            if not href:
                continue
            url = _resolve_url(base_url, href)
            if not url:
                continue
            candidates.append(url)
            text = _clean_text(node.get_text(" ") or href)
            if target and target in _normalize_compare(f"{text} {href}"):
                return url
    return candidates[0] if len(candidates) == 1 else ""


def _actor_name_from_r18(actor: dict[str, Any], language: str) -> str:
    if language == "ja":
        return _clean_text(actor.get("name_kanji") or actor.get("name_romaji"))
    return _clean_text(actor.get("name_romaji") or actor.get("name_kanji"))


def _normalize_r18_id(movie_id: str, strip_dmm_prefix: bool = False) -> str:
    normalized = re.sub(r"\s+", "", movie_id or "").replace("-", "").lower()
    if strip_dmm_prefix:
        match = R18_DMM_PREFIX_RE.match(normalized)
        if match:
            return match.group(2)
    return normalized


def _r18_content_id_to_movie_id(content_id: str) -> str:
    lowered = str(content_id or "").lower()
    match = R18_CONTENT_ID_RE.match(lowered)
    if not match:
        return str(content_id or "").upper()
    prefix = match.group(2).upper()
    number = match.group(3)
    suffix = match.group(4).upper()
    try:
        number = f"{int(number):03d}"
    except ValueError:
        pass
    return f"{prefix}-{number}{suffix}"


def _r18_localized(language: str, english: Any, japanese: Any) -> str:
    if language == "ja":
        return _clean_text(japanese or english)
    return _clean_text(english or japanese)


def _map_r18_payload(payload: dict[str, Any], movie_id: str, source_url: str, provider_config: dict[str, Any]) -> dict[str, Any]:
    language = _clean_text(provider_config.get("language") or "en").lower()
    if language not in {"en", "ja"}:
        language = "en"

    resolved_id = _clean_text(payload.get("dvd_id")) or _r18_content_id_to_movie_id(_clean_text(payload.get("content_id")))
    actresses = []
    for actor in payload.get("actresses") or []:
        if not isinstance(actor, dict):
            continue
        name = _actor_name_from_r18(actor, language)
        if not name:
            continue
        ref = {"id": str(actor.get("id") or ""), "name": name}
        image_url = _clean_text(actor.get("image_url"))
        if image_url and not image_url.startswith(("http://", "https://")):
            image_url = f"https://pics.dmm.co.jp/mono/actjpgs/{image_url}"
        if image_url:
            ref["avatar"] = _to_https(image_url)
        actresses.append(ref)

    categories = []
    for category in payload.get("categories") or []:
        if not isinstance(category, dict):
            continue
        name = _r18_localized(language, category.get("name_en"), category.get("name_ja") or category.get("name"))
        if name:
            categories.append({"id": str(category.get("id") or ""), "name": name})

    directors = payload.get("directors") or []
    director_name = ""
    if directors and isinstance(directors[0], dict):
        director_name = _r18_localized(language, directors[0].get("name_romaji"), directors[0].get("name_kanji"))
    director = _property(director_name or _r18_localized(language, payload.get("director_en"), payload.get("director")))

    cover_url = (
        _clean_text(payload.get("jacket_full_url"))
        or _clean_text((payload.get("images") or {}).get("jacket_image", {}).get("large2"))
        or _clean_text((payload.get("images") or {}).get("jacket_image", {}).get("large"))
    )
    sample_urls = [item.get("image_full") for item in payload.get("gallery") or [] if isinstance(item, dict) and item.get("image_full")]
    if not sample_urls:
        sample_urls = (payload.get("images") or {}).get("sample_images") or []

    return {
        "id": resolved_id or movie_id.upper(),
        "title": _r18_localized(language, payload.get("title_en"), payload.get("title_ja")) or movie_id.upper(),
        "img": _to_https(cover_url),
        "date": _date_only(payload.get("release_date")),
        "videoLength": payload.get("runtime_mins") or payload.get("runtime"),
        "director": director,
        "producer": _property(_r18_localized(language, payload.get("maker_name_en"), payload.get("maker_name_ja") or (payload.get("maker") or {}).get("name"))),
        "publisher": _property(_r18_localized(language, payload.get("label_name_en"), payload.get("label_name_ja") or (payload.get("label") or {}).get("name"))),
        "series": _property(_r18_localized(language, payload.get("series_name_en"), payload.get("series_name_ja") or (payload.get("series") or {}).get("name"))),
        "genres": categories,
        "stars": actresses,
        "samples": _samples_from_urls(R18_BASE_URL, sample_urls),
        "source_url": source_url,
        "raw": payload,
    }


def _map_libredmm_payload(payload: dict[str, Any], movie_id: str, source_url: str, base_url: str) -> dict[str, Any]:
    if _clean_text(payload.get("err")):
        raise RuntimeError(f"LibreDMM returned error: {_clean_text(payload.get('err'))}")

    source = _clean_text(payload.get("url")) or source_url
    resolved_id = _clean_text(payload.get("normalized_id")) or movie_id.upper()
    volume = payload.get("volume")
    try:
        video_length = int(volume) // 60 if int(volume) > 0 else None
    except (TypeError, ValueError):
        video_length = None

    stars = []
    for actor in payload.get("actresses") or []:
        if not isinstance(actor, dict):
            continue
        name = _clean_text(actor.get("name"))
        if not name:
            continue
        ref = {"id": "", "name": name}
        avatar = _resolve_url(base_url, actor.get("image_url"))
        if avatar:
            ref["avatar"] = avatar
        stars.append(ref)

    return {
        "id": resolved_id,
        "title": _clean_text(payload.get("title")) or resolved_id,
        "img": _resolve_url(base_url, payload.get("cover_image_url") or payload.get("thumbnail_image_url")),
        "date": _date_only(payload.get("date")),
        "videoLength": video_length,
        "director": _property(_first_string(payload.get("directors"))),
        "producer": _property(_first_string(payload.get("makers"))),
        "publisher": _property(_first_string(payload.get("labels"))),
        "series": None,
        "genres": _properties(payload.get("genres")),
        "stars": stars,
        "samples": _samples_from_urls(base_url, payload.get("sample_image_urls")),
        "source_url": source,
        "raw": payload,
    }


async def fetch_libredmm_movie_detail(movie_id: str, provider_config: dict[str, Any]) -> dict[str, Any] | None:
    base_url = _clean_text(provider_config.get("base_url")) or LIBREDMM_BASE_URL
    base_url = base_url.rstrip("/")
    await _sleep_for_provider_delay(provider_config)
    search_url = f"{base_url}/search?q={quote(movie_id)}&format=json"
    async with httpx.AsyncClient(
        timeout=_scraper_timeout(provider_config),
        follow_redirects=True,
        headers=_scraper_headers(),
    ) as client:
        response = await client.get(search_url)

    if response.status_code == 404:
        return None
    if response.status_code != 200:
        raise RuntimeError(f"LibreDMM returned status code {response.status_code}")
    payload = response.json()
    if not isinstance(payload, dict):
        return None
    return _map_libredmm_payload(payload, movie_id, search_url, base_url)


async def _get_r18_json(client: httpx.AsyncClient, url: str) -> tuple[int, dict[str, Any] | None, str]:
    response = await client.get(url)
    content_type = response.headers.get("content-type", "")
    if response.status_code != 200 or "text/html" in content_type:
        return response.status_code, None, content_type
    payload = response.json()
    return response.status_code, payload if isinstance(payload, dict) else None, content_type


async def fetch_r18dev_movie_detail(movie_id: str, provider_config: dict[str, Any]) -> dict[str, Any] | None:
    base_url = _clean_text(provider_config.get("base_url")) or R18_BASE_URL
    base_url = base_url.rstrip("/")
    normalized_values = []
    for value in (_normalize_r18_id(movie_id), _normalize_r18_id(movie_id, strip_dmm_prefix=True)):
        if value and value not in normalized_values:
            normalized_values.append(value)

    await _sleep_for_provider_delay(provider_config)
    async with httpx.AsyncClient(
        timeout=_scraper_timeout(provider_config),
        follow_redirects=True,
        headers=_scraper_headers(),
    ) as client:
        candidate_urls: list[str] = []
        for normalized in normalized_values:
            candidate_urls.append(f"{base_url}/videos/vod/movies/detail/-/dvd_id={quote(normalized)}/json")
        for normalized in normalized_values:
            candidate_urls.append(f"{base_url}/videos/vod/movies/detail/-/combined={quote(normalized)}/json")

        for url in candidate_urls:
            status, payload, content_type = await _get_r18_json(client, url)
            if status == 404:
                continue
            if status != 200:
                raise RuntimeError(f"R18.dev returned status code {status}")
            if not payload:
                if "text/html" in content_type:
                    continue
                return None
            if payload.get("content_id") and not (payload.get("title_en") or payload.get("title_ja")):
                combined_url = f"{base_url}/videos/vod/movies/detail/-/combined={quote(str(payload['content_id']))}/json"
                combined_status, combined_payload, _ = await _get_r18_json(client, combined_url)
                if combined_status == 200 and combined_payload:
                    return _map_r18_payload(combined_payload, movie_id, combined_url, provider_config)
                continue
            return _map_r18_payload(payload, movie_id, url, provider_config)
    return None


def _parse_javlibrary_detail(html: str, source_url: str, movie_id: str) -> dict[str, Any] | None:
    doc = _html_doc(html)
    resolved_id = _first_text(doc, ["#video_id .text", "#video_id"]) or movie_id
    title = _first_text(doc, ["title"]) or _meta_content(doc, "meta[property='og:title']")
    title = _strip_title_noise(title, resolved_id, ["JAVLibrary"])
    image_url = _first_attr(doc, source_url, [("#video_jacket_img", "src"), ("#video_jacket", "href"), ("meta[property='og:image']", "content")])
    sample_urls = _all_attrs(doc, source_url, [("a[href*='sample']", "href"), ("img[src*='sample']", "src")])
    return _metadata_payload(
        movie_id=_extract_movie_id(resolved_id) or movie_id,
        title=title,
        image_url=image_url,
        date=_first_text(doc, ["#video_date .text", "#video_date"]),
        runtime=_first_text(doc, ["#video_length .text", "#video_length"]),
        director=_first_text(doc, ["#video_director a", "#video_director .text"]),
        producer=_first_text(doc, ["#video_maker a", "#video_maker .text"]),
        publisher=_first_text(doc, ["#video_label a", "#video_label .text"]),
        series=_first_text(doc, ["#video_series a", "#video_series .text"]),
        genres=_link_texts(doc, [".genre a", "a[href*='genre']"]),
        stars=_link_texts(doc, [".star a", "a[href*='star']"]),
        sample_urls=sample_urls,
        source_url=source_url,
        raw={"provider": "javlibrary"},
    )


async def fetch_javlibrary_movie_detail(movie_id: str, provider_config: dict[str, Any]) -> dict[str, Any] | None:
    base_url = (_clean_text(provider_config.get("base_url")) or JAVLIBRARY_BASE_URL).rstrip("/")
    language = _clean_text(provider_config.get("language") or "cn").lower()
    if language not in {"cn", "en", "ja", "tw"}:
        language = "cn"
    if movie_id.startswith(("http://", "https://")):
        detail_url = movie_id
    else:
        search_url = f"{base_url}/{language}/vl_searchbyid.php?keyword={quote(movie_id)}"
        search_html, _ = await _fetch_text("JAVLibrary", search_url, provider_config)
        search_doc = _html_doc(search_html)
        detail_url = _first_matching_link(search_doc, f"{base_url}/{language}/", ["a[href*='?v=']", "a[href*='/vl_searchbyid.php?']"], movie_id)
        if not detail_url and "?v=" in search_html:
            detail_url = search_url
        if not detail_url:
            return None
    html, final_url = await _fetch_text("JAVLibrary", detail_url, provider_config)
    return _parse_javlibrary_detail(html, final_url, movie_id)


def _parse_javdb_detail(html: str, source_url: str, movie_id: str) -> dict[str, Any] | None:
    doc = _html_doc(html)
    resolved_id = _first_text(doc, [".title.is-4 strong", ".movie-panel-info strong"]) or movie_id
    title = _first_text(doc, [".title.is-4", "h1", "title"]) or _meta_content(doc, "meta[property='og:title']")
    title = _strip_title_noise(title, resolved_id, ["JAVDB"])
    image_url = _first_attr(doc, source_url, [(".column-video-cover img.video-cover", "src"), (".column-video-cover img", "src"), ("meta[property='og:image']", "content")])
    return _metadata_payload(
        movie_id=_extract_movie_id(resolved_id) or movie_id,
        title=title,
        image_url=image_url,
        date=_field_value(doc, ["Release Date", "Date", "發行日期", "日期"]),
        runtime=_field_value(doc, ["Runtime", "Length", "時長", "片長"]),
        director=_field_value(doc, ["Director", "導演"]),
        producer=_field_value(doc, ["Maker", "Studio", "片商", "製作商"]),
        publisher=_field_value(doc, ["Publisher", "Label", "發行商", "系列"]),
        series=_field_value(doc, ["Series", "系列"]),
        genres=_link_texts(doc, [".movie-panel-info a[href*='tags']", ".panel-block a[href*='tags']", "a[href*='/tags']"]),
        stars=_link_texts(doc, [".movie-panel-info a[href*='actors']", ".panel-block a[href*='actors']", "a[href*='/actors']"]),
        sample_urls=_all_attrs(doc, source_url, [(".tile-images.preview-images a[href]", "href"), (".tile-images.preview-images img[src]", "src"), ("a[href*='sample']", "href")]),
        source_url=source_url,
        raw={"provider": "javdb"},
    )


async def fetch_javdb_movie_detail(movie_id: str, provider_config: dict[str, Any]) -> dict[str, Any] | None:
    base_url = (_clean_text(provider_config.get("base_url")) or JAVDB_BASE_URL).rstrip("/")
    if movie_id.startswith(("http://", "https://")):
        detail_url = movie_id
    else:
        search_url = f"{base_url}/search?q={quote(movie_id)}&f=all"
        search_html, _ = await _fetch_text("JavDB", search_url, provider_config)
        search_doc = _html_doc(search_html)
        detail_url = _first_matching_link(search_doc, base_url, [".movie-list .item a[href*='/v/']", "a[href*='/v/']"], movie_id)
        if not detail_url:
            return None
    html, final_url = await _fetch_text("JavDB", detail_url, provider_config)
    return _parse_javdb_detail(html, final_url, movie_id)


def _parse_jav321_detail(html: str, source_url: str, movie_id: str) -> dict[str, Any] | None:
    doc = _html_doc(html)
    title = _first_text(doc, [".panel-heading h3", "meta[property='og:title']", "title"])
    resolved_id = _field_value(doc, ["ID", "品番", "識別碼"]) or _extract_movie_id(title) or movie_id
    title = _strip_title_noise(title, resolved_id, ["JAV321"])
    return _metadata_payload(
        movie_id=_extract_movie_id(resolved_id) or movie_id,
        title=title,
        image_url=_first_attr(doc, source_url, [("a[href*='/snapshot/'] img[src]", "src"), ("meta[property='og:image']", "content"), ("img[src*='snapshot']", "src")]),
        date=_field_value(doc, ["date", "發行日", "配信開始日", "日期"]),
        runtime=_field_value(doc, ["length", "runtime", "長度", "片長"]),
        producer=_field_value(doc, ["maker", "studio", "片商"]),
        series=_field_value(doc, ["series", "系列"]),
        genres=_link_texts(doc, ["a[href*='/genre/']"]),
        stars=_link_texts(doc, ["a[href*='/star/']", "a[href*='/actress/']"]),
        sample_urls=_all_attrs(doc, source_url, [("a[href*='/snapshot/']", "href"), ("a[href*='/snapshot/'] img[src]", "src")]),
        source_url=source_url,
        raw={"provider": "jav321"},
    )


async def fetch_jav321_movie_detail(movie_id: str, provider_config: dict[str, Any]) -> dict[str, Any] | None:
    base_url = (_clean_text(provider_config.get("base_url")) or JAV321_BASE_URL).rstrip("/")
    if movie_id.startswith(("http://", "https://")):
        detail_url = movie_id
    else:
        search_url = f"{base_url}/search"
        search_html, final_url = await _fetch_text("Jav321", search_url, provider_config, method="POST", data={"sn": movie_id})
        if "/video/" in final_url:
            detail_url = final_url
        else:
            search_doc = _html_doc(search_html)
            detail_url = _first_matching_link(search_doc, base_url, ["a[href*='/video/']"], movie_id)
        if not detail_url:
            return None
    html, final_url = await _fetch_text("Jav321", detail_url, provider_config)
    return _parse_jav321_detail(html, final_url, movie_id)


def _parse_generic_html_detail(
    provider: str,
    html: str,
    source_url: str,
    movie_id: str,
    *,
    title_selectors: list[str],
    cover_selectors: list[tuple[str, str]],
    genre_selectors: list[str],
    star_selectors: list[str],
    sample_selectors: list[tuple[str, str]],
    provider_names: list[str],
) -> dict[str, Any] | None:
    doc = _html_doc(html)
    title = _first_text(doc, title_selectors) or _meta_content(doc, "meta[property='og:title']", "meta[name='twitter:title']")
    resolved_id = _extract_movie_id(_field_value(doc, ["Product ID", "品番", "商品番号", "ID"])) or _extract_movie_id(source_url) or movie_id
    title = _strip_title_noise(title, resolved_id, provider_names)
    return _metadata_payload(
        movie_id=resolved_id,
        title=title,
        image_url=_first_attr(doc, source_url, cover_selectors),
        date=_field_value(doc, ["Release", "Release Date", "Date", "配信日", "発売日", "公開日"]),
        runtime=_field_value(doc, ["Runtime", "Length", "Duration", "収録時間", "再生時間"]),
        director=_field_value(doc, ["Director", "監督"]),
        producer=_field_value(doc, ["Maker", "Studio", "メーカー", "スタジオ"]),
        publisher=_field_value(doc, ["Label", "Publisher", "レーベル"]),
        series=_field_value(doc, ["Series", "シリーズ"]),
        genres=_link_texts(doc, genre_selectors),
        stars=_link_texts(doc, star_selectors),
        sample_urls=_all_attrs(doc, source_url, sample_selectors),
        source_url=source_url,
        raw={"provider": provider},
    )


async def fetch_mgstage_movie_detail(movie_id: str, provider_config: dict[str, Any]) -> dict[str, Any] | None:
    base_url = (_clean_text(provider_config.get("base_url")) or MGSTAGE_BASE_URL).rstrip("/")
    if movie_id.startswith(("http://", "https://")):
        detail_url = movie_id
    else:
        search_url = f"{base_url}/search/cSearch.php?search_word={quote(movie_id)}&type=top&page=1&list_cnt=120"
        search_html, _ = await _fetch_text("MGStage", search_url, provider_config, cookies={"adc": "1"})
        search_doc = _html_doc(search_html)
        detail_url = _first_matching_link(search_doc, base_url, ["a[href*='/product/product_detail/']"], movie_id)
        if not detail_url:
            detail_url = f"{base_url}/product/product_detail/{quote(movie_id)}/"
    html, final_url = await _fetch_text("MGStage", detail_url, provider_config, cookies={"adc": "1"})
    if "404" in html[:1000].lower():
        return None
    return _parse_generic_html_detail(
        "mgstage",
        html,
        final_url,
        movie_id,
        title_selectors=["h1", "title", "meta[property='og:title']"],
        cover_selectors=[("a.link_magnify", "href"), ("a[href*='jacket']", "href"), ("img[src*='jacket']", "src"), ("meta[property='og:image']", "content")],
        genre_selectors=["a[href*='genre']", "a[href*='category']"],
        star_selectors=["a[href*='actor']", "a[href*='actress']"],
        sample_selectors=[("a.sample_image", "href"), ("a[href*='sample']", "href"), ("img[src*='sample']", "src")],
        provider_names=["MGStage", "MGS"],
    )


async def fetch_tokyohot_movie_detail(movie_id: str, provider_config: dict[str, Any]) -> dict[str, Any] | None:
    base_url = (_clean_text(provider_config.get("base_url")) or TOKYOHOT_BASE_URL).rstrip("/")
    language = _clean_text(provider_config.get("language") or "en").lower()
    lang = {"ja": "ja", "zh": "zh-TW"}.get(language, "en")
    if movie_id.startswith(("http://", "https://")):
        detail_url = movie_id
    else:
        search_url = f"{base_url}/product/?q={quote(movie_id)}"
        search_html, _ = await _fetch_text("TokyoHot", search_url, provider_config)
        search_doc = _html_doc(search_html)
        detail_url = _first_matching_link(search_doc, base_url, ["a[href*='/product/']"], movie_id)
        if not detail_url:
            return None
    separator = "&" if "?" in detail_url else "?"
    detail_url = f"{detail_url}{separator}lang={quote(lang)}"
    html, final_url = await _fetch_text("TokyoHot", detail_url, provider_config)
    return _parse_generic_html_detail(
        "tokyohot",
        html,
        final_url,
        movie_id,
        title_selectors=["h1", "title", "meta[property='og:title']"],
        cover_selectors=[("img[src*='jacket']", "src"), ("img[src*='list_image']", "src"), ("video[poster]", "poster"), ("meta[property='og:image']", "content")],
        genre_selectors=["dl.info a[href*='genre']", "dl.info a[href*='type=genre']"],
        star_selectors=["dl.info a[href*='actress']", "dl.info a[href*='model']"],
        sample_selectors=[("div.scap a[href]", "href"), ("a[rel='cap'][href]", "href"), ("img[src*='vcap'][src*='.jpg']", "src")],
        provider_names=["TokyoHot", "Tokyo Hot", "東京熱"],
    )


async def fetch_aventertainment_movie_detail(movie_id: str, provider_config: dict[str, Any]) -> dict[str, Any] | None:
    base_url = (_clean_text(provider_config.get("base_url")) or AVENTERTAINMENT_BASE_URL).rstrip("/")
    if movie_id.startswith(("http://", "https://")):
        detail_url = movie_id
    else:
        detail_url = ""
        for endpoint in (f"/ppv/search?keyword={quote(movie_id)}&searchby=keyword", f"/ppv/search?keyword={quote(movie_id)}"):
            search_html, _ = await _fetch_text("AVEntertainment", base_url + endpoint, provider_config)
            search_doc = _html_doc(search_html)
            detail_url = _first_matching_link(search_doc, base_url, ["a[href*='/ppv/detail']", "a[href*='new_detail']", "a[href*='product_lists']"], movie_id)
            if detail_url:
                break
        if not detail_url:
            return None
    html, final_url = await _fetch_text("AVEntertainment", detail_url, provider_config)
    return _parse_generic_html_detail(
        "aventertainment",
        html,
        final_url,
        movie_id,
        title_selectors=[".section-title h1", ".section-title h2", ".section-title h3", "title", "meta[property='og:title']"],
        cover_selectors=[("#PlayerCover img", "src"), ("a.lightbox[href*='/vodimages/gallery/large/']", "href"), ("meta[property='og:image']", "content"), ("img[src*='vodimages']", "src")],
        genre_selectors=[".value-category a", "a[href*='cat_id']", "a[href*='dept']"],
        star_selectors=["a[href*='ppv_actressdetail']", "a[href*='ppv_ActressDetail']", "a[href*='/ppv/idoldetail']"],
        sample_selectors=[("a.lightbox[href*='/vodimages/screenshot/']", "href"), ("a[href*='/vodimages/gallery/large/']", "href")],
        provider_names=["AV Entertainment", "AVEntertainment"],
    )


async def fetch_dlgetchu_movie_detail(movie_id: str, provider_config: dict[str, Any]) -> dict[str, Any] | None:
    base_url = (_clean_text(provider_config.get("base_url")) or DLGETCHU_BASE_URL).rstrip("/")
    numeric = re.search(r"(\d{4,})", movie_id)
    if movie_id.startswith(("http://", "https://")):
        detail_url = movie_id
    elif numeric:
        detail_url = f"{base_url}/i/item{numeric.group(1)}"
    else:
        detail_url = ""
        for search_url in (f"{base_url}/?search_keyword={quote(movie_id)}", f"{base_url}/gcosin/?search_keyword={quote(movie_id)}", f"{base_url}/gcosl/?search_keyword={quote(movie_id)}"):
            search_html, _ = await _fetch_text("DLGetchu", search_url, provider_config)
            match = re.search(r"(?i)(https?://dl\.getchu\.com/i/item\d+|/i/item\d+)", search_html)
            if match:
                detail_url = _resolve_url(base_url, match.group(1))
                break
        if not detail_url:
            return None
    html, final_url = await _fetch_text("DLGetchu", detail_url, provider_config)
    doc = _html_doc(html)
    numeric_id = (re.search(r"(\d{4,})", final_url) or re.search(r"(\d{4,})", movie_id))
    sample_urls = re.findall(r"(?i)(/data/item_img/[^\"']+\.(?:jpg|jpeg|webp))", html)
    image_match = re.search(r"(?i)(/data/item_img/[^\"']+/\d+top\.jpg)", html)
    return _metadata_payload(
        movie_id=numeric_id.group(1) if numeric_id else movie_id,
        title=_first_text(doc, ["meta[property='og:title']", "title"]) or movie_id,
        image_url=_resolve_url(final_url, image_match.group(1)) if image_match else _first_attr(doc, final_url, [("meta[property='og:image']", "content")]),
        date=_parse_date_value(html),
        runtime=html,
        producer=_field_value(doc, ["メーカー", "サークル", "Maker", "Circle"]),
        genres=_link_texts(doc, ["a[href*='genre_id']"]),
        sample_urls=sample_urls,
        source_url=final_url,
        raw={"provider": "dlgetchu"},
    )


def _normalize_caribbean_id(movie_id: str) -> str:
    match = CARIBBEAN_ID_RE.search(_clean_text(movie_id).lower())
    if not match:
        return ""
    suffix = match.group(2)
    if len(suffix) == 2:
        suffix = f"0{suffix}"
    return f"{match.group(1)}-{suffix}"


async def fetch_caribbeancom_movie_detail(movie_id: str, provider_config: dict[str, Any]) -> dict[str, Any] | None:
    base_url = (_clean_text(provider_config.get("base_url")) or CARIBBEANCOM_BASE_URL).rstrip("/")
    language = _clean_text(provider_config.get("language") or "ja").lower()
    if movie_id.startswith(("http://", "https://")):
        detail_url = movie_id
    else:
        normalized = _normalize_caribbean_id(movie_id)
        if not normalized:
            return None
        host = "https://en.caribbeancom.com/eng" if language == "en" else base_url
        detail_url = f"{host}/moviepages/{normalized}/index.html"
    html, final_url = await _fetch_text("Caribbeancom", detail_url, provider_config)
    if "movie = null" in html.lower() or "error404" in html.lower():
        return None
    return _parse_generic_html_detail(
        "caribbeancom",
        html,
        final_url,
        _normalize_caribbean_id(movie_id) or movie_id,
        title_selectors=["h1[itemprop='name']", "meta[property='og:title']", "title"],
        cover_selectors=[("meta[property='og:image']", "content"), ("img[src*='/moviepages/'][src*='l_l.jpg']", "src"), ("img[src*='l.jpg']", "src")],
        genre_selectors=["li.movie-spec a[href*='tag']", "li.movie-detail__spec a[href*='tag']", "a.spec__tag"],
        star_selectors=["a[itemprop='actor'] span[itemprop='name']", "a.spec__tag span[itemprop='name']", "a[href*='actor']"],
        sample_selectors=[("a.fancy-gallery[href]", "href"), ("a.gallery-item[href]", "href"), ("a.gallery-image-wrap[href]", "href")],
        provider_names=["Caribbeancom", "Caribbean"],
    )


def _extract_fc2_article_id(movie_id: str) -> str:
    parsed = urlparse(_clean_text(movie_id))
    if parsed.netloc and "/article/" in parsed.path:
        match = re.search(r"/article/(\d{5,10})", parsed.path)
        if match:
            return match.group(1)
    match = FC2_ID_RE.search(_clean_text(movie_id))
    return match.group(1) if match else ""


async def fetch_fc2_movie_detail(movie_id: str, provider_config: dict[str, Any]) -> dict[str, Any] | None:
    base_url = (_clean_text(provider_config.get("base_url")) or FC2_BASE_URL).rstrip("/")
    article_id = _extract_fc2_article_id(movie_id)
    if not article_id:
        return None
    detail_url = movie_id if movie_id.startswith(("http://", "https://")) else f"{base_url}/article/{article_id}/"
    html, final_url = await _fetch_text("FC2", detail_url, provider_config)
    if "this page may have been deleted" in html.lower():
        return None
    doc = _html_doc(html)
    title = _meta_content(doc, "meta[property='og:title']") or _first_text(doc, ["title"])
    title = re.sub(r"(?i)^FC2\s*PPV\s*\d+\s*[-:：]?\s*", "", title)
    title = _strip_title_noise(title, f"FC2-PPV-{article_id}", ["FC2"])
    runtime_raw = _first_text(doc, [".items_article_MainitemThumb .items_article_info"]) or html
    return _metadata_payload(
        movie_id=f"FC2-PPV-{article_id}",
        title=title,
        image_url=_first_attr(doc, final_url, [("meta[property='og:image']", "content"), (".items_article_MainitemThumb img", "src")]),
        date=_field_value(doc, ["Release", "発売日", "販売日"]) or _parse_date_value(html),
        runtime=runtime_raw,
        producer=_first_text(doc, [".items_article_headerInfo a[href*='/users/']"]),
        genres=_link_texts(doc, [".items_article_TagArea a.tagTag"]),
        sample_urls=_all_attrs(doc, final_url, [(".items_article_SampleImagesArea a[href]", "href"), (".items_article_SampleImages a[href]", "href")]),
        source_url=final_url,
        raw={"provider": "fc2"},
    )


def _dmm_content_id_variants(movie_id: str) -> list[str]:
    if movie_id.startswith(("http://", "https://")):
        match = DMM_CID_RE.search(movie_id)
        return [match.group(1)] if match else []
    compact = re.sub(r"[^a-zA-Z0-9]", "", movie_id).lower()
    variants = _dedupe_strings([compact])
    match = re.match(r"([a-z]+)(\d+)(.*)", compact)
    if match:
        prefix, number, suffix = match.groups()
        variants.extend(_dedupe_strings([f"{prefix}{int(number):05d}{suffix}", f"{prefix}{int(number):03d}{suffix}"]))
    return _dedupe_strings(variants)


def _parse_dmm_detail(html: str, source_url: str, movie_id: str) -> dict[str, Any] | None:
    doc = _html_doc(html)
    jsonld: dict[str, Any] = {}
    for node in doc.select("script[type='application/ld+json']"):
        try:
            payload = json.loads(node.get_text() or "{}")
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict) and payload.get("@type") == "Product":
            jsonld = payload
            break
    cid_match = DMM_CID_RE.search(source_url)
    content_id = cid_match.group(1) if cid_match else (_clean_text(jsonld.get("sku")) if jsonld else "")
    normalized_id = _r18_content_id_to_movie_id(content_id) if content_id else movie_id
    subject = jsonld.get("subjectOf") if isinstance(jsonld.get("subjectOf"), dict) else {}
    images = jsonld.get("image") if jsonld else []
    if isinstance(images, str):
        images = [images]
    if not isinstance(images, list):
        images = []
    return _metadata_payload(
        movie_id=normalized_id,
        title=_clean_text(jsonld.get("name")) or _first_text(doc, ["h1#title.item", "h1", "meta[property='og:title']", "title"]),
        image_url=_resolve_url(source_url, images[0]) if images else _first_attr(doc, source_url, [("meta[property='og:image']", "content"), ("img[src*='pics.dmm.co.jp']", "src")]),
        date=(subject or {}).get("uploadDate") or _parse_date_value(_clean_text(doc.get_text(" "))),
        runtime=_clean_text(doc.get_text(" ")),
        director=_field_value(doc, ["Director", "監督"]),
        producer=_clean_text(((jsonld.get("brand") or {}) if isinstance(jsonld.get("brand"), dict) else {}).get("name")) or _field_value(doc, ["Maker", "メーカー"]),
        publisher=_field_value(doc, ["Label", "レーベル"]),
        series=_field_value(doc, ["Series", "シリーズ"]),
        genres=(subject or {}).get("genre") or _link_texts(doc, ["a[href*='genre']", "a[href*='article=keyword']"]),
        stars=_link_texts(doc, ["a[href*='actress=']", "a[href*='article=actress']"]),
        sample_urls=images[1:] or _all_attrs(doc, source_url, [("a[name='sample-image'] img", "data-lazy"), ("a[name='sample-image'] img", "src")]),
        source_url=source_url,
        raw={"provider": "dmm", "content_id": content_id},
    )


async def fetch_dmm_movie_detail(movie_id: str, provider_config: dict[str, Any]) -> dict[str, Any] | None:
    if movie_id.startswith(("http://", "https://")):
        html, final_url = await _fetch_text("DMM", movie_id, provider_config)
        return _parse_dmm_detail(html, final_url, movie_id)

    base_url = (_clean_text(provider_config.get("base_url")) or DMM_BASE_URL).rstrip("/")
    variants = _dmm_content_id_variants(movie_id)
    async with httpx.AsyncClient(
        timeout=_scraper_timeout(provider_config),
        follow_redirects=True,
        headers=_scraper_headers("text/html,*/*"),
    ) as client:
        for query in _dedupe_strings([movie_id, re.sub(r"[^A-Za-z0-9]", "", movie_id)]):
            await _sleep_for_provider_delay(provider_config)
            response = await client.get(f"{base_url}/search/=/searchstr={quote(query)}/")
            if response.status_code != 200:
                continue
            search_doc = _html_doc(_response_text(response))
            detail_url = _first_matching_link(search_doc, base_url, ["a[href*='cid=']", "a[href*='video.dmm.co.jp'][href*='id=']"], movie_id)
            if detail_url:
                html_response = await client.get(detail_url)
                html = _response_text(html_response)
                if _raise_for_scraper_status("DMM", html_response, html):
                    return _parse_dmm_detail(html, str(getattr(html_response, "url", "") or detail_url), movie_id)
        for cid in variants:
            for candidate in (
                f"{base_url}/mono/dvd/-/detail/=/cid={quote(cid)}/",
                f"{base_url}/digital/videoa/-/detail/=/cid={quote(cid)}/",
                f"{DMM_VIDEO_BASE_URL}/av/content/?id={quote(cid)}",
                f"{DMM_VIDEO_BASE_URL}/amateur/content/?id={quote(cid)}",
            ):
                await _sleep_for_provider_delay(provider_config)
                response = await client.get(candidate)
                if response.status_code == 404:
                    continue
                html = _response_text(response)
                if not _raise_for_scraper_status("DMM", response, html):
                    continue
                return _parse_dmm_detail(html, str(getattr(response, "url", "") or candidate), movie_id)
    return None


async def fetch_javstash_movie_detail(movie_id: str, provider_config: dict[str, Any]) -> dict[str, Any] | None:
    base_url = (_clean_text(provider_config.get("base_url")) or JAVSTASH_BASE_URL).rstrip("/")
    api_key = _clean_text(provider_config.get("api_key")) or _clean_text(os.getenv("JAVSTASH_API_KEY"))
    if not api_key:
        raise RuntimeError("JavStash api_key is required")
    query = """query searchScene($term: String!, $limit: Int) {
        searchScene(term: $term, limit: $limit) {
            id
            code
            title
            release_date
            duration
            director
            details
            studio { id name }
            performers { performer { id name } }
            tags { id name }
            images { id url }
            urls { url }
        }
    }"""
    await _sleep_for_provider_delay(provider_config)
    async with httpx.AsyncClient(
        timeout=_scraper_timeout(provider_config),
        follow_redirects=True,
        headers=_scraper_headers("application/json,*/*"),
    ) as client:
        response = await client.post(
            base_url,
            json={"query": query, "variables": {"term": movie_id, "limit": 5}},
            headers={"ApiKey": api_key, "Content-Type": "application/json"},
        )
    if response.status_code == 401:
        raise RuntimeError("JavStash api_key is invalid")
    if response.status_code != 200:
        raise RuntimeError(f"JavStash returned status code {response.status_code}")
    payload = response.json()
    if not isinstance(payload, dict):
        return None
    errors = payload.get("errors") or []
    if errors:
        message = _clean_text(errors[0].get("message") if isinstance(errors[0], dict) else errors[0])
        raise RuntimeError(f"JavStash GraphQL error: {message}")
    scenes = ((payload.get("data") or {}).get("searchScene") or [])
    if not scenes:
        return None
    scene = scenes[0]
    if not isinstance(scene, dict):
        return None
    studio = scene.get("studio") if isinstance(scene.get("studio"), dict) else {}
    stars = []
    for item in scene.get("performers") or []:
        if not isinstance(item, dict):
            continue
        performer = item.get("performer") if isinstance(item.get("performer"), dict) else {}
        name = _clean_text(performer.get("name"))
        if name:
            stars.append({"id": _clean_text(performer.get("id")), "name": name})
    genres = []
    for tag in scene.get("tags") or []:
        if isinstance(tag, dict) and _clean_text(tag.get("name")):
            genres.append({"id": _clean_text(tag.get("id")), "name": _clean_text(tag.get("name"))})
    images = [item.get("url") for item in scene.get("images") or [] if isinstance(item, dict) and item.get("url")]
    source_url = f"{base_url.removesuffix('/graphql')}/scenes/{scene.get('id')}"
    for item in scene.get("urls") or []:
        if isinstance(item, dict) and _clean_text(item.get("url")):
            source_url = _clean_text(item.get("url"))
            break
    metadata = _metadata_payload(
        movie_id=movie_id,
        title=scene.get("title"),
        image_url=images[0] if images else "",
        date=scene.get("release_date"),
        runtime=(int(scene.get("duration") or 0) // 60) if scene.get("duration") else None,
        director=scene.get("director"),
        producer="",
        genres=[],
        stars=[],
        sample_urls=images[1:],
        source_url=source_url,
        raw=scene,
    )
    metadata["producer"] = _property(studio.get("name"), studio.get("id"))
    metadata["genres"] = genres
    metadata["stars"] = stars
    return metadata


PROVIDER_FETCHERS = {
    "r18dev": "fetch_r18dev_movie_detail",
    "dmm": "fetch_dmm_movie_detail",
    "libredmm": "fetch_libredmm_movie_detail",
    "javlibrary": "fetch_javlibrary_movie_detail",
    "javdb": "fetch_javdb_movie_detail",
    "jav321": "fetch_jav321_movie_detail",
    "mgstage": "fetch_mgstage_movie_detail",
    "tokyohot": "fetch_tokyohot_movie_detail",
    "aventertainment": "fetch_aventertainment_movie_detail",
    "dlgetchu": "fetch_dlgetchu_movie_detail",
    "caribbeancom": "fetch_caribbeancom_movie_detail",
    "fc2": "fetch_fc2_movie_detail",
    "javstash": "fetch_javstash_movie_detail",
}

SCRAPER_TEST_MOVIE_IDS = {
    "javbus": "ABP-123",
    "r18dev": "ABP-123",
    "dmm": "ABP-123",
    "libredmm": "ABP-123",
    "javlibrary": "ABP-123",
    "javdb": "ABP-123",
    "jav321": "ABP-123",
    "mgstage": "SIRO-5615",
    "tokyohot": "N1012",
    "aventertainment": "1pon_020326_001",
    "dlgetchu": "1031683",
    "caribbeancom": "050419-844",
    "fc2": "FC2-PPV-4847718",
    "javstash": "ABP-123",
}


def _metadata_test_result(
    provider: str,
    movie_id: str,
    status: str,
    *,
    metadata: dict[str, Any] | None = None,
    error_message: str = "",
    duration_ms: int = 0,
) -> dict[str, Any]:
    return {
        "provider": provider,
        "movie_id": movie_id,
        "success": status == "success",
        "status": status,
        "id": _clean_text((metadata or {}).get("id")),
        "title": _clean_text((metadata or {}).get("title")),
        "source_url": _clean_text((metadata or {}).get("source_url")),
        "error_message": error_message,
        "duration_ms": duration_ms,
    }


def _selected_test_providers(values: Any) -> list[str]:
    if not values:
        return list(SUPPORTED_SCRAPER_PROVIDERS)
    if not isinstance(values, list):
        raise ValueError("providers must be a list")
    selected: list[str] = []
    for value in values:
        provider = str(value or "").strip().lower()
        if provider not in SUPPORTED_SCRAPER_PROVIDERS:
            raise ValueError(f"unknown scraper provider: {provider}")
        if provider not in selected:
            selected.append(provider)
    return selected


async def test_metadata_scraper_provider(provider: str, movie_id: str, provider_config: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        if provider == "javbus":
            metadata = await javbus_api_service.get_movie_detail(movie_id)
        else:
            fetcher = globals()[PROVIDER_FETCHERS[provider]]
            metadata = await fetcher(movie_id, provider_config)
    except Exception as exc:
        message = str(exc) or exc.__class__.__name__
        status = "config_required" if "api_key is required" in message.lower() else "error"
        return _metadata_test_result(
            provider,
            movie_id,
            status,
            error_message=message,
            duration_ms=int((time.perf_counter() - started) * 1000),
        )

    if metadata and metadata.get("id"):
        return _metadata_test_result(
            provider,
            movie_id,
            "success",
            metadata=metadata,
            duration_ms=int((time.perf_counter() - started) * 1000),
        )
    return _metadata_test_result(
        provider,
        movie_id,
        "no_match",
        error_message="no metadata returned",
        duration_ms=int((time.perf_counter() - started) * 1000),
    )


def apply_metadata_scraper_test_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    applied: list[dict[str, Any]] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        provider = str(item.get("provider") or "").strip().lower()
        if provider not in SUPPORTED_SCRAPER_PROVIDERS:
            continue
        enabled = bool(item.get("success"))
        updates[provider] = {"enabled": enabled}
        applied.append({"provider": provider, "enabled": enabled})

    if updates:
        runtime.update_config_section("scrapers", updates)

    return {
        "success": True,
        "applied": applied,
        "scrapers": runtime.get_scrapers_config(),
    }


async def test_metadata_scraper_providers(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}
    providers = _selected_test_providers(payload.get("providers"))
    movie_ids = payload.get("movie_ids") if isinstance(payload.get("movie_ids"), dict) else {}
    try:
        concurrent = int(payload.get("concurrent") or 3)
    except (TypeError, ValueError):
        concurrent = 3
    concurrent = max(1, min(concurrent, 6))

    config = runtime.get_scrapers_config()
    semaphore = asyncio.Semaphore(concurrent)

    async def run(provider: str) -> dict[str, Any]:
        movie_id = _clean_text(movie_ids.get(provider)) or SCRAPER_TEST_MOVIE_IDS.get(provider) or "ABP-123"
        provider_config = config.get(provider) if isinstance(config.get(provider), dict) else {}
        provider_config = {**provider_config, "enabled": True}
        async with semaphore:
            return await test_metadata_scraper_provider(provider, movie_id, provider_config)

    results = await asyncio.gather(*(run(provider) for provider in providers))
    summary = {
        "total": len(results),
        "success": sum(1 for item in results if item.get("success")),
        "failed": sum(1 for item in results if not item.get("success")),
        "config_required": sum(1 for item in results if item.get("status") == "config_required"),
    }
    response: dict[str, Any] = {
        "success": True,
        "applied": False,
        "results": results,
        "summary": summary,
    }
    if bool(payload.get("apply_results")):
        response["apply"] = apply_metadata_scraper_test_results(results)
        response["applied"] = True
    return response


class MetadataScraperService:
    async def get_movie_detail(self, movie_id: str) -> dict[str, Any]:
        config = runtime.get_scrapers_config()
        priority = config.get("priority")
        if not isinstance(priority, list) or not priority:
            priority = list(SUPPORTED_SCRAPER_PROVIDERS)

        logs: list[dict[str, str]] = []
        seen: set[str] = set()
        had_error = False
        last_error_message = ""
        for raw_provider in priority:
            provider = str(raw_provider or "").strip().lower()
            if provider in seen or provider not in SUPPORTED_SCRAPER_PROVIDERS:
                continue
            seen.add(provider)

            provider_config = config.get(provider)
            if not isinstance(provider_config, dict):
                provider_config = {}
            if not bool(provider_config.get("enabled")):
                logs.append(_scraper_log(provider, f"{provider} is disabled", "debug"))
                continue

            if provider not in IMPLEMENTED_SCRAPER_PROVIDERS:
                logs.append(
                    _scraper_log(
                        provider,
                        f"{provider} is configured but not implemented in JavJaeger yet",
                        "warning",
                    )
                )
                continue

            try:
                if provider == "javbus":
                    metadata = await javbus_api_service.get_movie_detail(movie_id)
                else:
                    fetcher = globals()[PROVIDER_FETCHERS[provider]]
                    metadata = await fetcher(movie_id, provider_config)
            except Exception as exc:
                had_error = True
                last_error_message = str(exc)
                logger.warning("Metadata scraper %s failed for %s: %s", provider, movie_id, exc)
                logs.append(_scraper_log(provider, f"{provider} failed: {exc}", "error"))
                continue

            if metadata and metadata.get("id"):
                logs.append(_scraper_log(provider, f"{provider} matched {movie_id}"))
                return {
                    "metadata": metadata,
                    "source": provider,
                    "logs": logs,
                }

            logs.append(_scraper_log(provider, f"{provider} did not match {movie_id}", "warning"))

        return {
            "metadata": None,
            "source": None,
            "logs": logs,
            "error": "metadata_fetch_failed" if had_error else None,
            "error_message": last_error_message,
        }


metadata_scraper_service = MetadataScraperService()
