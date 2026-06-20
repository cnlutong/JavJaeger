import asyncio
import base64
import datetime
import json
import logging
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from modules.common.runtime import get_javbus_config
from modules.common.paths import UserPathError, resolve_existing_directory, resolve_existing_file, resolve_user_path
from modules.history.service import local_movie_library_service
from modules.javbus_api import javbus_api_service
from .schemas import LocalScrapeApplyRequest, LocalScrapeDeleteRequest, LocalScrapePreviewRequest


logger = logging.getLogger(__name__)
ProgressCallback = Any


VIDEO_EXTENSIONS = {
    ".mp4",
    ".mkv",
    ".avi",
    ".mov",
    ".wmv",
    ".flv",
    ".webm",
    ".m4v",
    ".mpg",
    ".mpeg",
    ".3gp",
    ".ts",
}
SUBTITLE_EXTENSIONS = {
    ".srt",
    ".ass",
    ".ssa",
    ".vtt",
    ".sub",
    ".idx",
    ".smi",
    ".sup",
}
SKIPPED_DIRECTORY_NAMES = {"behind the scenes", "backdrops"}
TS_MIN_VIDEO_SIZE = 10 * 1024 * 1024
MPEG_TS_PACKET_SIZE = 188
MPEG_TS_SYNC_BYTE = 0x47
IMAGE_DOWNLOAD_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.javbus.com/",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
}
DEFAULT_IMAGE_DOWNLOAD_ATTEMPTS = 3
DEFAULT_IMAGE_DOWNLOAD_BACKOFF_SECONDS = 0.25


DESIGNATION_PATTERNS: list[tuple[re.Pattern[str], int]] = [
    (re.compile(r"(?i)(FC2)-?PPV-?(\d{6,8})"), 100),
    (re.compile(r"(?i)(\d{3}[A-Z]{2,6})-(\d{3,5})"), 95),
    (re.compile(r"(?i)([A-Z]{2,6})-(\d{3,5})"), 90),
    (re.compile(r"(?i)([A-Z]+\d+)-(\d{3,5})"), 85),
    (re.compile(r"(?i)([A-Z]{2,6})(\d{3,5})(?:[^A-Z0-9]|$)"), 80),
    (re.compile(r"(?i)(\d{6})[_-](\d{3,5})"), 70),
]
RESOLUTION_NUMBERS = {"800", "1080", "720", "480", "360"}
INVALID_PATH_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
PART_MARKER_PATTERN = re.compile(r"(?i)(?:^|[._\-\s])(?P<kind>part|pt|cd|disc|disk)[._\-\s]*(?P<number>\d{1,2})(?:[^A-Z0-9]|$)")


@dataclass(frozen=True)
class LocalFileCandidate:
    path: Path
    code: str | None
    recognition_method: str
    recognition_message: str


def recognize_designation(filename: str) -> str | None:
    candidates: list[tuple[str, int, int]] = []
    for pattern, priority in DESIGNATION_PATTERNS:
        for match in pattern.finditer(filename):
            designation = f"{match.group(1)}-{match.group(2)}"
            candidates.append((designation, priority, match.start()))

    candidates.sort(key=lambda item: (item[1], item[2]), reverse=True)
    for designation, _, _ in candidates:
        parts = designation.split("-", 1)
        if len(parts) != 2:
            continue
        prefix, number = parts
        valid_alpha_prefix = 2 <= len(prefix) <= 6
        valid_numeric_brand_prefix = bool(re.fullmatch(r"(?i)\d{3}[A-Z]{2,6}", prefix))
        if not ((valid_alpha_prefix or valid_numeric_brand_prefix) and 3 <= len(number) <= 8):
            continue
        if number in RESOLUTION_NUMBERS:
            continue
        return designation.upper()
    return None


def _is_skipped_directory(path: Path) -> bool:
    return path.name.lower() in SKIPPED_DIRECTORY_NAMES


def _is_mpeg_ts_header(path: Path) -> bool:
    try:
        with path.open("rb") as file:
            data = file.read(MPEG_TS_PACKET_SIZE * 4)
    except OSError:
        return False

    if len(data) < MPEG_TS_PACKET_SIZE * 2:
        return False

    try:
        offset = data[:MPEG_TS_PACKET_SIZE].index(MPEG_TS_SYNC_BYTE)
    except ValueError:
        return False

    for index in range(1, 3):
        pos = offset + index * MPEG_TS_PACKET_SIZE
        if pos >= len(data) or data[pos] != MPEG_TS_SYNC_BYTE:
            return False
    return True


def _should_scan_as_video(path: Path) -> bool:
    suffix = path.suffix.lower()
    if suffix not in VIDEO_EXTENSIONS:
        return False
    if suffix != ".ts":
        return True
    try:
        if path.stat().st_size < TS_MIN_VIDEO_SIZE:
            return False
    except OSError:
        return False
    return _is_mpeg_ts_header(path)


def _emit_progress(progress_callback: ProgressCallback | None, event: dict[str, Any]) -> None:
    if progress_callback is None:
        return
    try:
        progress_callback(event)
    except Exception as exc:
        logger.warning("Local scrape progress callback failed: %s", exc)


def _walk_video_files(root: Path, recursive: bool, max_depth: int | None) -> list[Path]:
    files: list[Path] = []
    root = root.resolve()

    def walk(current: Path, depth: int) -> None:
        try:
            entries = list(current.iterdir())
        except OSError as exc:
            logger.warning("Failed to read local scrape directory %s: %s", current, exc)
            return

        for entry in entries:
            if entry.name.startswith(".") or entry.is_symlink():
                continue
            if entry.is_dir():
                if _is_skipped_directory(entry):
                    continue
                if recursive and (max_depth is None or depth < max_depth):
                    walk(entry, depth + 1)
                continue
            if entry.is_file() and _should_scan_as_video(entry):
                try:
                    if entry.stat().st_size > 0:
                        files.append(entry.resolve())
                except OSError:
                    continue

    walk(root, 0)
    return sorted(files, key=lambda path: str(path).lower())


def _sanitize_path_segment(value: str, fallback: str) -> str:
    cleaned = INVALID_PATH_CHARS.sub("_", value).strip().strip(". ")
    cleaned = re.sub(r"\s+", " ", cleaned)
    if not cleaned:
        cleaned = fallback
    return cleaned[:180].rstrip(". ")


def _name_from_link(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("name") or value.get("title") or value.get("id") or "").strip()
    return str(value or "").strip()


def _list_names(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    names = [_name_from_link(value) for value in values]
    return [name for name in names if name]


def _actor_refs(values: Any) -> list[dict[str, str]]:
    if not isinstance(values, list):
        return []
    refs: list[dict[str, str]] = []
    for value in values:
        if isinstance(value, dict):
            actor_id = str(value.get("id") or "").strip()
            name = str(value.get("name") or value.get("title") or actor_id).strip()
            avatar = str(
                value.get("avatar")
                or value.get("img")
                or value.get("image")
                or value.get("thumbnail")
                or ""
            ).strip()
        else:
            actor_id = ""
            name = str(value or "").strip()
            avatar = ""
        if actor_id or name:
            ref = {"id": actor_id, "name": name}
            if avatar:
                ref["avatar"] = avatar
            refs.append(ref)
    return refs


def _single_name(value: Any) -> str:
    return _name_from_link(value)


def _derive_list_thumbnail_url(image_url: Any) -> str:
    value = str(image_url or "").strip()
    if not value:
        return ""
    if "/pics/thumb/" in value:
        return value
    if "/pics/cover/" not in value:
        return ""
    prefix, filename = value.rsplit("/", 1)
    match = re.match(r"^(.+)_b(\.[a-z0-9]+)$", filename, re.IGNORECASE)
    thumb_filename = f"{match.group(1)}{match.group(2)}" if match else filename
    return f"{prefix.replace('/pics/cover', '/pics/thumb')}/{thumb_filename}"


def _template_context(metadata: dict[str, Any], source_stem: str) -> dict[str, str]:
    code = str(metadata.get("id") or "").strip()
    title = str(metadata.get("title") or "").strip()
    stars = [str(star).strip() for star in metadata.get("stars") or [] if str(star).strip()]
    date = str(metadata.get("date") or "").strip()
    return {
        "code": code or source_stem,
        "title": title or source_stem,
        "original": source_stem,
        "actor": stars[0] if stars else "",
        "actors": " ".join(stars),
        "director": str(metadata.get("director") or "").strip(),
        "studio": str(metadata.get("studio") or "").strip(),
        "maker": str(metadata.get("studio") or "").strip(),
        "publisher": str(metadata.get("publisher") or "").strip(),
        "series": str(metadata.get("series") or "").strip(),
        "date": date,
        "year": date[:4] if date else "",
    }


def _render_template(template: str | None, metadata: dict[str, Any], source_stem: str) -> str:
    context = _template_context(metadata, source_stem)
    code = context["code"]
    title = context["title"]
    active_template = template or "{code} {title}"
    if active_template == "{code} {title}" and code:
        if not title or title.upper() == code.upper():
            return _sanitize_path_segment(code, source_stem)
        if title.upper().startswith(code.upper()):
            remainder = title[len(code):]
            if not remainder or remainder[0].isspace() or remainder[0] in "-_":
                return _sanitize_path_segment(title, code or source_stem)
    rendered = active_template
    for key, value in context.items():
        rendered = rendered.replace(f"{{{key}}}", value)
    return _sanitize_path_segment(rendered, code or source_stem)


def _render_folder_template(template: str | None, metadata: dict[str, Any], source_stem: str) -> Path:
    if template is not None and not str(template).strip():
        return Path()
    active_template = template or "{code} {title}"
    parts = [part for part in re.split(r"[\\/]+", active_template) if part.strip()]
    rendered_parts = [_render_template(part, metadata, source_stem) for part in parts]
    rendered_parts = [part for part in rendered_parts if part and part not in {".", ".."}]
    if not rendered_parts:
        rendered_parts = [_render_template("{code} {title}", metadata, source_stem)]
    return Path(*rendered_parts)


def _build_metadata(movie: dict[str, Any] | None, code: str | None, source_stem: str) -> dict[str, Any]:
    movie = movie or {}
    local_id = str(movie.get("id") or code or "").strip().upper()
    title = str(movie.get("title") or local_id or source_stem).strip()
    genres = _list_names(movie.get("genres"))
    stars = _list_names(movie.get("stars"))
    actor_refs = _actor_refs(movie.get("actor_refs")) or _actor_refs(movie.get("stars"))
    samples = movie.get("samples") if isinstance(movie.get("samples"), list) else []
    cover_url = movie.get("img") or movie.get("cover_url") or ""
    return {
        "id": local_id,
        "title": title,
        "date": movie.get("date") or "",
        "duration_minutes": movie.get("videoLength") or movie.get("duration_minutes"),
        "director": _single_name(movie.get("director")),
        "studio": _single_name(movie.get("producer") or movie.get("studio")),
        "publisher": _single_name(movie.get("publisher")),
        "series": _single_name(movie.get("series")),
        "genres": genres,
        "stars": stars,
        "actor_refs": actor_refs,
        "cover_url": cover_url,
        "list_thumbnail_url": movie.get("list_thumbnail_url") or movie.get("thumbnail_url") or _derive_list_thumbnail_url(cover_url),
        "samples": samples,
        "raw": movie.get("raw") if isinstance(movie.get("raw"), dict) else movie,
    }


def _metadata_full_text(movie_id: str, metadata: dict[str, Any]) -> str:
    parts: list[str] = [movie_id]

    def add(value: Any) -> None:
        if value is None:
            return
        if isinstance(value, list):
            for item in value:
                add(item)
            return
        if isinstance(value, dict):
            for item in value.values():
                add(item)
            return
        text = str(value).strip()
        if text:
            parts.append(text)

    for key in (
        "title",
        "date",
        "director",
        "studio",
        "publisher",
        "series",
        "genres",
        "stars",
        "raw",
    ):
        add(metadata.get(key))
    return "\n".join(parts)


def _build_target_paths(
    source_path: Path,
    metadata: dict[str, Any],
    organize: bool,
    target_directory: str | None,
    naming_template: str,
    folder_template: str | None = None,
) -> tuple[Path, Path, str]:
    folder_path = _render_folder_template(folder_template if folder_template is not None else naming_template, metadata, source_path.stem)
    target_stem = _render_template(naming_template, metadata, source_path.stem)

    if organize:
        root = resolve_user_path(target_directory) if target_directory else source_path.parent
        target_dir = root / folder_path
        part_marker = _source_part_marker(source_path.stem)
        if part_marker and part_marker.lower() not in target_stem.lower():
            target_stem = _sanitize_path_segment(f"{target_stem}-{part_marker}", source_path.stem)
        target_video = target_dir / f"{target_stem}{source_path.suffix}"
    else:
        target_dir = source_path.parent
        target_video = source_path
        target_stem = source_path.stem

    return target_dir, target_video, target_stem


def _source_part_marker(source_stem: str) -> str | None:
    match = PART_MARKER_PATTERN.search(source_stem)
    if not match:
        return None
    kind = match.group("kind").lower()
    number = match.group("number")
    if kind in {"part", "pt"}:
        return f"part{number}"
    if kind in {"disc", "disk"}:
        return f"disc{number}"
    return f"{kind}{number}"


def _subtitle_matches(video_path: Path, candidate: Path) -> bool:
    if candidate.suffix.lower() not in SUBTITLE_EXTENSIONS:
        return False
    if candidate.parent != video_path.parent:
        return False
    stem = candidate.stem.lower()
    video_stem = video_path.stem.lower()
    return stem == video_stem or stem.startswith(f"{video_stem}.") or stem.startswith(f"{video_stem}-") or stem.startswith(f"{video_stem}_")


def _related_subtitles(video_path: Path) -> list[Path]:
    try:
        return [entry for entry in video_path.parent.iterdir() if entry.is_file() and _subtitle_matches(video_path, entry)]
    except OSError:
        return []


def _subtitle_target_path(subtitle_path: Path, source_video_path: Path, target_dir: Path, target_stem: str) -> Path:
    subtitle_stem = subtitle_path.stem
    source_stem = source_video_path.stem
    subtitle_marker = ""
    if subtitle_stem.lower().startswith(source_stem.lower()):
        subtitle_marker = subtitle_stem[len(source_stem):]
    return target_dir / f"{target_stem}{subtitle_marker}{subtitle_path.suffix}"


def _file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0


def _file_mtime(path: Path) -> float:
    try:
        return path.stat().st_mtime
    except OSError:
        return 0.0


def _iso_mtime(path: Path) -> str:
    try:
        return datetime.datetime.fromtimestamp(path.stat().st_mtime).isoformat()
    except OSError:
        return ""


def _int_or_none(value: Any) -> int | None:
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _probe_video_metadata(path: Path) -> dict[str, int]:
    try:
        completed = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height,bit_rate:format=bit_rate",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            check=False,
            text=True,
            timeout=5,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return {}
    if completed.returncode != 0 or not completed.stdout:
        return {}
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return {}

    streams = payload.get("streams") if isinstance(payload, dict) else None
    stream = streams[0] if isinstance(streams, list) and streams and isinstance(streams[0], dict) else {}
    file_format = payload.get("format") if isinstance(payload.get("format"), dict) else {}
    width = _int_or_none(stream.get("width"))
    height = _int_or_none(stream.get("height"))
    bitrate = _int_or_none(stream.get("bit_rate")) or _int_or_none(file_format.get("bit_rate"))
    metadata: dict[str, int] = {}
    if width:
        metadata["width"] = width
    if height:
        metadata["height"] = height
    if width and height:
        metadata["resolution_pixels"] = width * height
    if bitrate:
        metadata["bitrate"] = bitrate
    return metadata


def _file_detail(path: Path, exists: bool | None = None, include_media: bool = False) -> dict[str, Any]:
    try:
        resolved = path.resolve()
    except OSError:
        resolved = path
    actual_exists = resolved.exists() if exists is None else exists
    detail = {
        "path": str(resolved),
        "file_name": resolved.name,
        "exists": actual_exists,
        "size": _file_size(resolved) if actual_exists else 0,
        "modified_at": _iso_mtime(resolved) if actual_exists else "",
        "extension": resolved.suffix.lower(),
    }
    if actual_exists and include_media:
        detail.update(_probe_video_metadata(resolved))
    return detail


def _conflict_skip_result(
    item: Any,
    metadata: dict[str, Any],
    target_video: Path,
    target_dir: Path,
    message: str,
    kept: str | None,
) -> dict[str, Any]:
    return {
        "source_path": item.source_path,
        "success": True,
        "code": metadata.get("id"),
        "target_video_path": str(target_video),
        "target_dir": str(target_dir),
        "skipped": True,
        "kept": kept,
        "message": message,
        "library_recorded": False,
    }


def _choose_conflict_keep_side(source_path: Path, target_path: Path, resolution: str) -> str | None:
    if resolution in {"keep_source"}:
        return "source"
    if resolution in {"skip", "keep_target"}:
        return "target"
    if resolution == "keep_newer":
        source_value = _file_mtime(source_path)
        target_value = _file_mtime(target_path)
    elif resolution == "keep_older":
        source_value = _file_mtime(source_path)
        target_value = _file_mtime(target_path)
        if source_value <= 0 or target_value <= 0 or source_value == target_value:
            return None
        return "source" if source_value < target_value else "target"
    elif resolution == "keep_larger":
        source_value = _file_size(source_path)
        target_value = _file_size(target_path)
    elif resolution == "keep_higher_resolution":
        source_value = _probe_video_metadata(source_path).get("resolution_pixels") or 0
        target_value = _probe_video_metadata(target_path).get("resolution_pixels") or 0
    elif resolution == "keep_higher_bitrate":
        source_value = _probe_video_metadata(source_path).get("bitrate") or 0
        target_value = _probe_video_metadata(target_path).get("bitrate") or 0
    else:
        return None

    if source_value <= 0 or target_value <= 0 or source_value == target_value:
        return None
    return "source" if source_value > target_value else "target"


def _safe_relative_path(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return path.name


def _library_root_for_applied_video(request: LocalScrapeApplyRequest, source_path: Path, current_video: Path) -> Path:
    if request.target_directory:
        return resolve_user_path(request.target_directory)
    if request.organize:
        return source_path.parent.resolve()
    return current_video.parent.resolve()


def _build_library_record_for_applied_video(
    current_video: Path,
    library_root: Path,
    metadata: dict[str, Any],
    scraped_at: str,
) -> dict[str, Any] | None:
    movie_id = str(metadata.get("id") or "").strip().upper()
    if not movie_id:
        return None
    raw = metadata.get("raw")
    scrape_status = "found" if isinstance(raw, dict) and raw.get("id") else "recognized"
    return {
        "movie_id": movie_id,
        "path": str(current_video),
        "relative_path": _safe_relative_path(current_video, library_root),
        "file_name": current_video.name,
        "size": _file_size(current_video),
        "modified_at": _iso_mtime(current_video),
        "extension": current_video.suffix.lower(),
        "part": _source_part_marker(current_video.stem),
        "metadata": metadata,
        "scrape_status": scrape_status,
        "scrape_error": None,
        "scraped_at": scraped_at,
        "full_text": _metadata_full_text(movie_id, metadata),
    }


async def preview_local_scrape(
    request: LocalScrapePreviewRequest,
    progress_callback: ProgressCallback | None = None,
) -> dict[str, Any]:
    try:
        directory = resolve_existing_directory(request.directory)
        if request.target_directory:
            resolve_user_path(request.target_directory)
    except UserPathError as exc:
        return {"success": False, "error": exc.code, "message": exc.message}

    _emit_progress(
        progress_callback,
        {
            "phase": "scan",
            "message": f"开始扫描目录：{directory}",
            "completed": 0,
            "total": 0,
        },
    )
    video_files = _walk_video_files(directory, request.recursive, request.max_depth)
    _emit_progress(
        progress_callback,
        {
            "phase": "scan",
            "message": f"扫描完成，发现 {len(video_files)} 个视频文件",
            "completed": 0,
            "total": len(video_files),
        },
    )
    candidates = [
        LocalFileCandidate(
            path=path,
            code=recognize_designation(path.stem),
            recognition_method="regex",
            recognition_message="recognized" if recognize_designation(path.stem) else "unrecognized",
        )
        for path in video_files
    ]

    semaphore = asyncio.Semaphore(max(1, min(request.concurrent, 5)))
    completed = 0

    async def enrich(candidate: LocalFileCandidate) -> dict[str, Any]:
        nonlocal completed
        movie_detail = None
        scrape_status = "skipped"
        error = None
        _emit_progress(
            progress_callback,
            {
                "phase": "scrape",
                "message": f"处理文件：{candidate.path.name}",
                "completed": completed,
                "total": len(candidates),
                "current": str(candidate.path),
            },
        )
        if candidate.code and request.scrape:
            async with semaphore:
                try:
                    movie_detail = await javbus_api_service.get_movie_detail(candidate.code)
                    scrape_status = "found" if movie_detail and movie_detail.get("id") else "not_found"
                except Exception as exc:
                    logger.warning("Local scrape metadata fetch failed for %s: %s", candidate.code, exc)
                    scrape_status = "failed"
                    error = "metadata_fetch_failed"
        elif candidate.code:
            scrape_status = "recognized"
        else:
            scrape_status = "unrecognized"

        metadata = _build_metadata(movie_detail, candidate.code, candidate.path.stem)
        target_dir, target_video, target_stem = _build_target_paths(
            candidate.path,
            metadata,
            request.organize,
            request.target_directory,
            request.naming_template,
            request.folder_template,
        )

        current_nfo = candidate.path.with_suffix(".nfo")
        current_poster = candidate.path.with_name(f"{candidate.path.stem}-poster.jpg")
        already_scraped = current_nfo.exists() and current_poster.exists()
        conflict = target_video.exists() and target_video.resolve() != candidate.path.resolve()

        item = {
            "source_path": str(candidate.path),
            "relative_path": str(candidate.path.relative_to(directory.resolve())),
            "file_name": candidate.path.name,
            "file_size": _file_size(candidate.path),
            "source_file": _file_detail(candidate.path, True, include_media=conflict),
            "target_file": _file_detail(target_video, target_video.exists(), include_media=True) if conflict else None,
            "code": candidate.code,
            "recognition_method": candidate.recognition_method if candidate.code else "failed",
            "recognition_message": candidate.recognition_message,
            "scrape_status": scrape_status,
            "error": error,
            "already_scraped": already_scraped,
            "metadata": metadata,
            "target_stem": target_stem,
            "target_dir": str(target_dir),
            "target_video_path": str(target_video),
            "target_exists": conflict,
            "will_write_nfo": bool(request.write_nfo and metadata.get("id")),
            "will_download_images": bool(request.download_images and candidate.code and movie_detail),
            "will_download_sample_images": bool(request.download_sample_images and metadata.get("samples")),
            "will_download_actor_images": bool(request.download_actor_images and metadata.get("actor_refs")),
            "will_download_list_thumbnail": bool(request.download_list_thumbnail and metadata.get("list_thumbnail_url")),
            "will_move": str(target_video.resolve()) != str(candidate.path.resolve()),
        }
        completed += 1
        _emit_progress(
            progress_callback,
            {
                "phase": "scrape",
                "message": f"完成 {completed}/{len(candidates)}：{candidate.path.name}",
                "completed": completed,
                "total": len(candidates),
                "current": str(candidate.path),
            },
        )
        return item

    items = await asyncio.gather(*[enrich(candidate) for candidate in candidates])
    target_counts = Counter(str(item.get("target_video_path") or "").lower() for item in items)
    for item in items:
        target_key = str(item.get("target_video_path") or "").lower()
        target_duplicate = bool(target_key and target_counts[target_key] > 1)
        item["target_duplicate"] = target_duplicate
        if target_duplicate:
            item["target_exists"] = True
    payload = {
        "success": True,
        "directory": str(directory.resolve()),
        "total_files": len(video_files),
        "recognized_count": sum(1 for item in items if item.get("code")),
        "found_count": sum(1 for item in items if item.get("scrape_status") == "found"),
        "already_scraped_count": sum(1 for item in items if item.get("already_scraped")),
        "conflict_count": sum(1 for item in items if item.get("target_exists")),
        "items": items,
    }
    _emit_progress(
        progress_callback,
        {
            "phase": "complete",
            "message": f"预览完成：{payload['found_count']}/{payload['total_files']} 个文件匹配成功",
            "completed": len(video_files),
            "total": len(video_files),
        },
    )
    return payload


def _move_file(source: Path, target: Path, overwrite: bool) -> None:
    if source.resolve() == target.resolve():
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if not overwrite:
            raise FileExistsError(f"目标文件已存在: {target}")
        if target.is_file():
            target.unlink()
        else:
            raise FileExistsError(f"目标路径不是文件: {target}")
    try:
        source.rename(target)
    except OSError:
        shutil.copy2(source, target)
        source.unlink()


def _write_nfo(video_path: Path, metadata: dict[str, Any], poster_name: str | None, sample_names: list[str]) -> Path:
    root = ET.Element("movie")

    def add(tag: str, value: Any) -> None:
        text = "" if value is None else str(value).strip()
        ET.SubElement(root, tag).text = text

    add("title", metadata.get("title"))
    add("originaltitle", metadata.get("title"))
    add("sorttitle", metadata.get("title"))
    add("num", metadata.get("id"))
    unique = ET.SubElement(root, "uniqueid", {"type": "local", "default": "true"})
    unique.text = str(metadata.get("id") or "")
    add("premiered", metadata.get("date"))
    add("releasedate", metadata.get("date"))
    add("release", metadata.get("date"))
    add("year", str(metadata.get("date") or "")[:4] if metadata.get("date") else "")
    add("runtime", metadata.get("duration_minutes") or "")
    add("studio", metadata.get("studio"))
    add("maker", metadata.get("studio"))
    add("publisher", metadata.get("publisher"))
    add("director", metadata.get("director"))

    if metadata.get("series"):
        series = ET.SubElement(root, "set")
        ET.SubElement(series, "name").text = str(metadata.get("series"))

    if metadata.get("cover_url"):
        add("poster", metadata.get("cover_url"))
        add("cover", metadata.get("cover_url"))
    if poster_name:
        thumb = ET.SubElement(root, "thumb", {"aspect": "poster"})
        thumb.text = poster_name
    for sample_name in sample_names:
        ET.SubElement(root, "thumb").text = sample_name

    for actor in metadata.get("stars") or []:
        actor_node = ET.SubElement(root, "actor")
        ET.SubElement(actor_node, "name").text = actor
        ET.SubElement(actor_node, "type").text = "Actor"
    for genre in metadata.get("genres") or []:
        ET.SubElement(root, "genre").text = genre
        ET.SubElement(root, "tag").text = genre

    xml = ET.tostring(root, encoding="utf-8")
    nfo_path = video_path.with_suffix(".nfo")
    nfo_path.write_bytes(b'\xef\xbb\xbf<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xml)
    return nfo_path


async def _download_image(url: str, target: Path, overwrite: bool) -> str | None:
    if not url:
        return None
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and not overwrite:
        return target.name
    if url.startswith("data:"):
        _, _, payload = url.partition(",")
        target.write_bytes(base64.b64decode(payload))
        return target.name
    javbus_config = get_javbus_config()
    client_kwargs: dict[str, Any] = {"timeout": 20.0, "follow_redirects": True}
    proxy = javbus_config.get("proxy")
    if proxy:
        client_kwargs["proxy"] = proxy
    retry_attempts_value = javbus_config.get("image_retry_attempts")
    try:
        retry_attempts = int(
            DEFAULT_IMAGE_DOWNLOAD_ATTEMPTS if retry_attempts_value in (None, "") else retry_attempts_value
        )
    except (TypeError, ValueError):
        retry_attempts = DEFAULT_IMAGE_DOWNLOAD_ATTEMPTS
    retry_attempts = max(1, min(retry_attempts, 10))
    retry_backoff_value = javbus_config.get("image_retry_backoff_seconds")
    try:
        retry_backoff = float(
            DEFAULT_IMAGE_DOWNLOAD_BACKOFF_SECONDS if retry_backoff_value in (None, "") else retry_backoff_value
        )
    except (TypeError, ValueError):
        retry_backoff = DEFAULT_IMAGE_DOWNLOAD_BACKOFF_SECONDS
    retry_backoff = max(0.0, min(retry_backoff, 10.0))
    last_exc: Exception | None = None
    for attempt in range(1, retry_attempts + 1):
        try:
            async with httpx.AsyncClient(**client_kwargs) as client:
                response = await client.get(url, headers=IMAGE_DOWNLOAD_HEADERS)
                response.raise_for_status()
                target.write_bytes(response.content)
            return target.name
        except Exception as exc:
            last_exc = exc
            if attempt < retry_attempts and retry_backoff > 0:
                await asyncio.sleep(retry_backoff * attempt)
    if last_exc:
        raise last_exc
    return target.name


async def _download_image_or_warn(url: str, target: Path, overwrite: bool) -> str | None:
    try:
        return await _download_image(url, target, overwrite)
    except Exception as exc:
        logger.warning("Local scrape image download failed for %s: %r", url, exc)
        return None


async def _write_images(
    video_path: Path,
    metadata: dict[str, Any],
    overwrite: bool,
    include_samples: bool = False,
) -> tuple[str | None, list[str]]:
    stem = video_path.stem
    poster_name = None
    sample_names: list[str] = []
    if metadata.get("cover_url"):
        poster_name = await _download_image_or_warn(
            str(metadata.get("cover_url")),
            video_path.with_name(f"{stem}-poster.jpg"),
            overwrite,
        )

    samples = metadata.get("samples") or []
    if samples:
        fanart_dir = video_path.parent / "extrafanart"
        if include_samples:
            for index, sample in enumerate(samples, start=1):
                url = sample.get("src") or sample.get("thumbnail") if isinstance(sample, dict) else None
                if not url:
                    continue
                name = await _download_image_or_warn(str(url), fanart_dir / f"fanart{index}.jpg", overwrite)
                if name:
                    sample_names.append(str(Path("extrafanart") / name))
    return poster_name, sample_names


async def _write_actor_images(video_path: Path, metadata: dict[str, Any], overwrite: bool) -> list[str]:
    actor_names: list[str] = []
    actor_dir = video_path.parent / "actors"
    used_names: set[str] = set()
    for index, actor in enumerate(metadata.get("actor_refs") or [], start=1):
        if not isinstance(actor, dict):
            continue
        actor_id = str(actor.get("id") or "").strip()
        avatar_url = str(
            actor.get("avatar")
            or actor.get("img")
            or actor.get("image")
            or actor.get("thumbnail")
            or ""
        ).strip()
        if not avatar_url and actor_id:
            try:
                star_info = await javbus_api_service.get_star_info(actor_id)
            except Exception as exc:
                logger.warning("Local scrape actor info fetch failed for %s: %r", actor_id, exc)
                continue
            avatar_url = str(star_info.get("avatar") or "").strip() if isinstance(star_info, dict) else ""
        if not avatar_url:
            continue
        file_stem = _sanitize_path_segment(str(actor.get("name") or actor_id or f"actor{index}"), f"actor{index}")
        if file_stem.lower() in used_names:
            file_stem = _sanitize_path_segment(f"{file_stem}-{index}", f"actor{index}")
        used_names.add(file_stem.lower())
        name = await _download_image_or_warn(str(avatar_url), actor_dir / f"{file_stem}.jpg", overwrite)
        if name:
            actor_names.append(str(Path("actors") / name))
    return actor_names


async def _write_list_thumbnail(video_path: Path, metadata: dict[str, Any], overwrite: bool) -> str | None:
    thumbnail_url = metadata.get("list_thumbnail_url") or _derive_list_thumbnail_url(metadata.get("cover_url"))
    if not thumbnail_url:
        return None
    return await _download_image_or_warn(
        str(thumbnail_url),
        video_path.with_name(f"{video_path.stem}-thumb.jpg"),
        overwrite,
    )


async def apply_local_scrape(
    request: LocalScrapeApplyRequest,
    progress_callback: ProgressCallback | None = None,
) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    library_records_by_root: dict[str, list[dict[str, Any]]] = defaultdict(list)
    success_count = 0
    total_items = len(request.items)

    _emit_progress(
        progress_callback,
        {
            "phase": "apply",
            "message": f"开始执行刮削：{total_items} 个文件",
            "completed": 0,
            "total": total_items,
        },
    )

    if request.target_directory:
        try:
            resolve_user_path(request.target_directory)
        except UserPathError as exc:
            return {
                "success": False,
                "error": exc.code,
                "message": exc.message,
                "success_count": 0,
                "failed_count": len(request.items),
                "library_recorded_count": 0,
                "library_failed_count": 0,
                "library_updates": [],
                "results": [],
            }

    for index, item in enumerate(request.items, start=1):
        _emit_progress(
            progress_callback,
            {
                "phase": "apply",
                "message": f"执行 {index}/{total_items}：{item.source_path}",
                "completed": index - 1,
                "total": total_items,
                "current": item.source_path,
            },
        )
        try:
            source_path = resolve_existing_file(item.source_path)
        except UserPathError as exc:
            results.append({"source_path": item.source_path, "success": False, "error": exc.code, "message": exc.message})
            _emit_progress(
                progress_callback,
                {
                    "phase": "apply",
                    "message": f"跳过 {index}/{total_items}：{exc.message}",
                    "completed": index,
                    "total": total_items,
                    "current": item.source_path,
                },
            )
            continue

        metadata = _build_metadata(item.metadata, item.code, source_path.stem)
        if not metadata.get("id") and item.code:
            metadata["id"] = item.code

        target_dir, target_video, target_stem = _build_target_paths(
            source_path,
            metadata,
            request.organize,
            request.target_directory,
            request.naming_template,
            request.folder_template,
        )

        try:
            target_dir.mkdir(parents=True, exist_ok=True)
            current_video = source_path
            moved_assets: list[str] = []

            subtitles = _related_subtitles(source_path)
            conflict = target_video.exists() and target_video.resolve() != source_path.resolve()
            conflict_resolution = str(item.conflict_resolution or "").strip()
            keep_side = _choose_conflict_keep_side(source_path, target_video, conflict_resolution) if conflict else None
            if conflict and not request.overwrite_existing and not conflict_resolution:
                results.append(
                    {
                        "source_path": item.source_path,
                        "success": False,
                        "error": "conflict_resolution_required",
                        "target_video_path": str(target_video),
                        "target_dir": str(target_dir),
                    }
                )
                _emit_progress(
                    progress_callback,
                    {
                        "phase": "apply",
                        "message": f"冲突未选择策略 {index}/{total_items}：{target_video.name}",
                        "completed": index,
                        "total": total_items,
                        "current": str(target_video),
                    },
                )
                continue
            if conflict and not request.overwrite_existing and keep_side is None:
                results.append(
                    {
                        "source_path": item.source_path,
                        "success": False,
                        "error": "conflict_resolution_unresolved",
                        "target_video_path": str(target_video),
                        "target_dir": str(target_dir),
                    }
                )
                _emit_progress(
                    progress_callback,
                    {
                        "phase": "apply",
                        "message": f"冲突策略无法判断 {index}/{total_items}：{target_video.name}",
                        "completed": index,
                        "total": total_items,
                        "current": str(target_video),
                    },
                )
                continue
            overwrite_target = request.overwrite_existing or keep_side == "source"
            if conflict and not request.overwrite_existing and keep_side != "source":
                success_count += 1
                message = "skipped_conflict" if conflict_resolution == "skip" else "kept_existing_target"
                kept = "target" if keep_side == "target" else None
                results.append(
                    _conflict_skip_result(item, metadata, target_video, target_dir, message, kept)
                )
                _emit_progress(
                    progress_callback,
                    {
                        "phase": "apply",
                        "message": f"跳过冲突 {index}/{total_items}：{target_video.name}"
                        if conflict_resolution == "skip"
                        else f"保留目标 {index}/{total_items}：{target_video.name}",
                        "completed": index,
                        "total": total_items,
                        "current": str(target_video),
                    },
                )
                continue

            _move_file(source_path, target_video, overwrite_target)
            current_video = target_video

            for subtitle in subtitles:
                subtitle_target = _subtitle_target_path(subtitle, source_path, target_dir, target_stem)
                _move_file(subtitle, subtitle_target, overwrite_target)
                moved_assets.append(str(subtitle_target))

            poster_name = None
            sample_names: list[str] = []
            actor_image_names: list[str] = []
            list_thumbnail_name = None
            image_error = None
            if request.download_images and metadata.get("id"):
                try:
                    poster_name, sample_names = await _write_images(
                        current_video,
                        metadata,
                        request.overwrite_existing,
                        include_samples=request.download_sample_images,
                    )
                except Exception as exc:
                    image_error = "image_download_failed"
                    logger.warning("Local scrape image download failed for %s: %s", metadata.get("id"), exc)
            if request.download_actor_images and metadata.get("id"):
                actor_image_names = await _write_actor_images(current_video, metadata, request.overwrite_existing)
            if request.download_list_thumbnail and metadata.get("id"):
                list_thumbnail_name = await _write_list_thumbnail(current_video, metadata, request.overwrite_existing)

            nfo_path = None
            if request.write_nfo and metadata.get("id"):
                nfo_path = _write_nfo(current_video, metadata, poster_name, sample_names)

            library_recorded = False
            library_root = _library_root_for_applied_video(request, source_path, current_video)
            library_record = _build_library_record_for_applied_video(
                current_video,
                library_root,
                metadata,
                datetime.datetime.now().isoformat(),
            )
            if library_record:
                library_records_by_root[str(library_root)].append(library_record)
                library_recorded = True

            success_count += 1
            results.append(
                {
                    "source_path": item.source_path,
                    "success": True,
                    "code": metadata.get("id"),
                    "target_video_path": str(current_video),
                    "target_dir": str(target_dir),
                    "kept": "source" if conflict and keep_side == "source" else None,
                    "nfo_path": str(nfo_path) if nfo_path else None,
                    "poster": poster_name,
                    "samples": sample_names,
                    "actor_images": actor_image_names,
                    "list_thumbnail": list_thumbnail_name,
                    "image_error": image_error,
                    "moved_assets": moved_assets,
                    "library_recorded": library_recorded,
                }
            )
            _emit_progress(
                progress_callback,
                {
                    "phase": "apply",
                    "message": f"完成 {index}/{total_items}：{current_video.name}",
                    "completed": index,
                    "total": total_items,
                    "current": str(current_video),
                },
            )
        except Exception as exc:
            logger.error("Local scrape apply failed for %s: %s", source_path, exc)
            results.append({"source_path": item.source_path, "success": False, "error": "apply_failed"})
            _emit_progress(
                progress_callback,
                {
                    "phase": "apply",
                    "message": f"失败 {index}/{total_items}：{item.source_path}",
                    "completed": index,
                    "total": total_items,
                    "current": item.source_path,
                },
            )

    library_updates: list[dict[str, Any]] = []
    for root, records in library_records_by_root.items():
        try:
            update_result = await local_movie_library_service.update_from_scan(
                root,
                records,
                remove_missing=False,
            )
            library_updates.append(update_result)
        except Exception as exc:
            logger.error("Local scrape library update failed for %s: %s", root, exc)
            library_updates.append({"success": False, "scan_root": root, "error": "library_update_failed", "message": "本地影片库更新失败"})

    library_recorded_count = sum(len(records) for records in library_records_by_root.values())
    library_failed_count = sum(1 for update in library_updates if not update.get("success"))

    payload = {
        "success": success_count == len(request.items) and library_failed_count == 0,
        "success_count": success_count,
        "failed_count": len(request.items) - success_count,
        "library_recorded_count": library_recorded_count,
        "library_failed_count": library_failed_count,
        "library_updates": library_updates,
        "results": results,
    }
    _emit_progress(
        progress_callback,
        {
            "phase": "complete",
            "message": f"执行完成：成功 {payload['success_count']}，失败 {payload['failed_count']}，入库 {payload['library_recorded_count']}",
            "completed": total_items,
            "total": total_items,
        },
    )
    return payload


async def delete_local_scrape_files(request: LocalScrapeDeleteRequest) -> dict[str, Any]:
    try:
        directory = resolve_existing_directory(request.directory)
    except UserPathError as exc:
        return {
            "success": False,
            "error": exc.code,
            "message": exc.message,
            "deleted_count": 0,
            "failed_count": len(request.source_paths),
            "results": [],
        }

    root = directory.resolve()
    results: list[dict[str, Any]] = []
    deleted_count = 0

    for source_path in request.source_paths:
        try:
            path = resolve_existing_file(source_path)
        except UserPathError as exc:
            results.append({"source_path": source_path, "success": False, "error": exc.code, "message": exc.message})
            continue

        try:
            path.relative_to(root)
        except ValueError:
            results.append({"source_path": source_path, "success": False, "error": "path_outside_directory"})
            continue

        if not _should_scan_as_video(path):
            results.append({"source_path": source_path, "success": False, "error": "not_video_file"})
            continue

        try:
            path.unlink()
            deleted_count += 1
            results.append({"source_path": source_path, "success": True})
        except OSError as exc:
            logger.error("Local scrape delete failed for %s: %s", path, exc)
            results.append({"source_path": source_path, "success": False, "error": "delete_failed"})

    failed_count = len(results) - deleted_count
    return {
        "success": failed_count == 0,
        "deleted_count": deleted_count,
        "failed_count": failed_count,
        "results": results,
    }
