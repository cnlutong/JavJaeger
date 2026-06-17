import re
from datetime import datetime
from typing import Any, Callable

from bs4 import BeautifulSoup, Tag


PAGE_RE = re.compile(r"^[1-9]\d*$")
MAGNET_HASH_RE = re.compile(r"magnet:\?xt=urn:btih:(\w+)", re.IGNORECASE)
FILE_SIZE_RE = re.compile(r"^\s*([\d.]+)\s*([kmgtp]?i?b)\s*$", re.IGNORECASE)


def format_image_url(base_url: str, url: str | None) -> str | None:
    if not url:
        return None
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if not url.startswith("/"):
        url = f"/{url}"
    return f"{base_url.rstrip('/')}{url}"


def parse_movies_page(page_html: str, base_url: str) -> dict[str, Any]:
    doc = BeautifulSoup(page_html, "lxml")
    movies = []
    for item in doc.select("#waterfall #waterfall .item"):
        image = item.select_one(".photo-frame img")
        info = item.select(".photo-info date")
        movie_id = _text(info[0]) if info else ""
        if not movie_id:
            continue
        movies.append(
            {
                "date": _text(info[1]) if len(info) > 1 else None,
                "id": movie_id,
                "img": format_image_url(base_url, image.get("src") if image else None),
                "title": image.get("title", "") if image else "",
                "tags": [_text(tag) for tag in item.select(".item-tag button")],
            }
        )

    current_page = _to_int(_text(doc.select_one(".pagination .active a")), default=1)
    pages = [_to_int(link_text) for link_text in (_text(a) for a in doc.select(".pagination li a")) if PAGE_RE.match(link_text)]
    has_next_page = doc.select_one(".pagination li #next") is not None
    return {
        "movies": movies,
        "pagination": {
            "currentPage": current_page,
            "hasNextPage": has_next_page,
            "nextPage": current_page + 1 if has_next_page else None,
            "pages": pages,
        },
    }


def parse_filter_info(page_html: str, filter_type: str, filter_value: str) -> dict[str, str]:
    doc = BeautifulSoup(page_html, "lxml")
    title = _text(doc.select_one("title"))
    match = re.match(r"^(?:第\d+?頁 - )?(.+?) - ", title)
    return {"name": match.group(1) if match else "", "type": filter_type, "value": filter_value}


def convert_magnets_html(html: str) -> list[dict[str, Any]]:
    doc = BeautifulSoup(html, "lxml")
    magnets = []
    for tr in doc.select("tr"):
        first_anchor = tr.select_one("td a")
        if not first_anchor:
            continue
        tag_anchors = first_anchor.select("a")
        link = first_anchor.get("href", "")
        match = MAGNET_HASH_RE.search(link)
        magnet_id = match.group(1) if match else ""
        is_hd = any("高清" in _text(anchor) for anchor in tag_anchors)
        has_subtitle = any("字幕" in _text(anchor) for anchor in tag_anchors)
        for anchor in tag_anchors:
            anchor.extract()

        title = _text(first_anchor)
        size = _text(tr.select_one("td:nth-of-type(2) a")) or None
        share_date = _text(tr.select_one("td:nth-of-type(3) a")) or None
        if not magnet_id or not link or not title:
            continue
        magnets.append(
            {
                "id": magnet_id,
                "link": link,
                "isHD": is_hd,
                "title": title,
                "size": size,
                "numberSize": parse_size_to_bytes(size),
                "shareDate": share_date,
                "hasSubtitle": has_subtitle,
            }
        )

    magnets.sort(key=lambda item: item["numberSize"] or 0, reverse=True)
    return magnets


def sort_magnets(magnets: list[dict[str, Any]], sort_by: str | None, sort_order: str | None) -> list[dict[str, Any]]:
    if not sort_by or not sort_order:
        return magnets

    reverse = sort_order == "desc"
    if sort_by == "date":
        magnets.sort(key=lambda item: _date_sort_key(item.get("shareDate")), reverse=reverse)
    elif sort_by == "size":
        magnets.sort(key=lambda item: item.get("numberSize") or 0, reverse=reverse)
    return magnets


def parse_movie_detail(page_html: str, base_url: str, movie_id: str) -> dict[str, Any]:
    doc = BeautifulSoup(page_html, "lxml")
    title = _text(doc.select_one(".container h3"))
    image_node = doc.select_one(".container .movie .bigImage img")
    info_nodes = doc.select(".container .movie .info p")

    gid_match = re.search(r"var gid = (\d+);", page_html)
    uc_match = re.search(r"var uc = (\d+);", page_html)

    return {
        "id": movie_id,
        "title": title,
        "img": format_image_url(base_url, image_node.get("src") if image_node else None),
        "imageSize": None,
        "date": _text_info(info_nodes, "發行日期:"),
        "videoLength": _to_int((_text_info(info_nodes, "長度:", "分鐘") or "").strip(), default=None),
        "director": _link_info(info_nodes, "導演:", "director", base_url),
        "producer": _link_info(info_nodes, "製作商:", "studio", base_url),
        "publisher": _link_info(info_nodes, "發行商:", "label", base_url),
        "series": _link_info(info_nodes, "系列:", "series", base_url),
        "genres": _multiple_info(info_nodes, "genre", lambda tag: not tag.has_attr("onmouseover"), lambda tag: tag.select_one("label a"), base_url),
        "stars": _multiple_info(info_nodes, "star", lambda tag: tag.has_attr("onmouseover"), lambda tag: tag.select_one("a"), base_url),
        "samples": _parse_samples(doc, base_url),
        "similarMovies": _parse_similar_movies(doc, base_url),
        "gid": gid_match.group(1) if gid_match else None,
        "uc": uc_match.group(1) if uc_match else None,
    }


def parse_star_info(page_html: str, base_url: str, star_id: str) -> dict[str, Any]:
    doc = BeautifulSoup(page_html, "lxml").select_one("#waterfall .item .avatar-box")
    info_nodes = doc.select(".photo-info p") if doc else []
    avatar_node = doc.select_one(".photo-frame img") if doc else None
    return {
        "avatar": format_image_url(base_url, avatar_node.get("src") if avatar_node else None),
        "id": star_id,
        "name": _text(doc.select_one(".photo-info .pb10")) if doc else "",
        "birthday": _star_info(info_nodes, "生日: "),
        "age": _star_info(info_nodes, "年齡: "),
        "height": _star_info(info_nodes, "身高: "),
        "bust": _star_info(info_nodes, "胸圍: "),
        "waistline": _star_info(info_nodes, "腰圍: "),
        "hipline": _star_info(info_nodes, "臀圍: "),
        "birthplace": _star_info(info_nodes, "出生地: "),
        "hobby": _star_info(info_nodes, "愛好: "),
    }


def parse_size_to_bytes(size: str | None) -> int | None:
    if not size:
        return None
    match = FILE_SIZE_RE.match(size)
    if not match:
        return None
    value = float(match.group(1))
    unit = match.group(2).lower().replace("ib", "b")
    multipliers = {
        "b": 1,
        "kb": 1024,
        "mb": 1024**2,
        "gb": 1024**3,
        "tb": 1024**4,
        "pb": 1024**5,
    }
    return int(value * multipliers.get(unit, 1))


def _parse_samples(doc: BeautifulSoup, base_url: str) -> list[dict[str, Any]]:
    samples = []
    for box in doc.select("#sample-waterfall .sample-box"):
        image = box.select_one(".photo-frame img")
        thumbnail = format_image_url(base_url, image.get("src") if image else None)
        filename = thumbnail.split("/")[-1] if thumbnail else ""
        match = re.match(r"(\S+)\.(jpe?g|png|webp|gif)$", filename, re.IGNORECASE)
        sample_id = match.group(1) if match else ""
        if not sample_id or not thumbnail:
            continue
        samples.append(
            {
                "alt": image.get("title") if image else None,
                "id": sample_id,
                "src": format_image_url(base_url, box.get("href")),
                "thumbnail": thumbnail,
            }
        )
    return samples


def _parse_similar_movies(doc: BeautifulSoup, base_url: str) -> list[dict[str, Any]]:
    similar = []
    for link in doc.select("#related-waterfall a"):
        href = link.get("href", "")
        movie_id = href.rstrip("/").split("/")[-1]
        title = link.get("title")
        if not movie_id or not title:
            continue
        image = link.select_one("img")
        similar.append(
            {
                "id": movie_id,
                "title": title,
                "img": format_image_url(base_url, image.get("src") if image else None),
            }
        )
    return similar


def _text(node: Any) -> str:
    if node is None:
        return ""
    return node.get_text(strip=True) if hasattr(node, "get_text") else str(node).strip()


def _to_int(value: Any, default: int | None = 0) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _text_info(info_nodes: list[Tag], label: str, exclude_text: str | None = None) -> str | None:
    for info in info_nodes:
        header = info.select_one(".header")
        if not header or label not in _text(header):
            continue
        value = info.get_text(" ", strip=True).replace(_text(header), "", 1).strip()
        if exclude_text:
            value = value.replace(exclude_text, "").strip()
        return value or None
    return None


def _link_info(info_nodes: list[Tag], label: str, prefix: str, base_url: str) -> dict[str, str] | None:
    for info in info_nodes:
        header = info.select_one(".header")
        if not header or label not in _text(header):
            continue
        link = info.select_one("a")
        return _property_from_link(link, prefix, base_url)
    return None


def _multiple_info(
    info_nodes: list[Tag],
    info_type: str,
    genre_filter: Callable[[Tag], bool],
    node_getter: Callable[[Tag], Tag | None],
    base_url: str,
) -> list[dict[str, str]]:
    for info in info_nodes:
        genres = [genre for genre in info.select(".genre") if genre_filter(genre)]
        if not genres:
            continue
        properties = []
        for genre in genres:
            prop = _property_from_link(node_getter(genre), info_type, base_url)
            if prop:
                properties.append(prop)
        return properties
    return []


def _property_from_link(link: Tag | None, prefix: str, base_url: str) -> dict[str, str] | None:
    if not link:
        return None
    href = link.get("href", "")
    is_uncensored = "uncensored" in href
    computed_prefix = f"uncensored/{prefix}" if is_uncensored else prefix
    item_id = href.replace(f"{base_url.rstrip('/')}/{computed_prefix}/", "")
    if item_id and is_uncensored:
        item_id = f"uncensored/{item_id}"
    name = _text(link)
    if not item_id or not name:
        return None
    return {"id": item_id, "name": name}


def _star_info(info_nodes: list[Tag], label: str) -> str | None:
    for node in info_nodes:
        text = _text(node)
        if label in text:
            return text.replace(label, "", 1) or None
    return None


def _date_sort_key(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value).timestamp()
    except ValueError:
        return 0.0
