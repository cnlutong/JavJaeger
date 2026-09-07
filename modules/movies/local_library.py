import asyncio
import datetime
import hashlib
import json
import logging
import os
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from modules.common import runtime
from modules.common.paths import UserPathError, resolve_existing_directory
from modules.history.service import (
    LOCAL_LIBRARY_INFORMATION_FIELDS,
    local_movie_library_service,
    normalize_local_library_information_fields,
)
from .local_scrape import (
    ProgressCallback,
    _build_metadata,
    _emit_progress,
    _file_size,
    _metadata_full_text,
    _probe_video_metadata,
    _source_part_marker,
    _walk_video_files,
    _write_actor_images,
    _write_images,
    _write_list_thumbnail,
    _write_nfo,
    recognize_designation,
    scrape_movie_metadata_map,
)
from .schemas import LocalLibraryInformationDownloadRequest, LocalLibraryScanRequest, LocalLibrarySettingsRequest
from .service import movie_detail_is_vr


logger = logging.getLogger(__name__)
ACTOR_AVATAR_EXTENSIONS = {".jpg", ".jpeg"}
HASH_BLOCK_SIZE = 1024 * 1024
LOCAL_LIBRARY_SUBTITLE_EXTENSIONS = {".ass", ".idx", ".srt", ".ssa", ".sub", ".sup", ".vtt"}
LOCAL_LIBRARY_IMAGE_EXTENSIONS = {".jpeg", ".jpg", ".png", ".webp"}
LOCAL_LIBRARY_IMAGE_ROLES = {"banner", "fanart", "landscape", "poster", "thumb", "thumbnail"}
LOCAL_LIBRARY_FOLDER_ASSET_STEMS = {"cover", "fanart", "folder", "poster", "thumb", "thumbnail"}


def _iso_mtime(path: Path) -> str:
    try:
        return datetime.datetime.fromtimestamp(path.stat().st_mtime).isoformat()
    except OSError:
        return ""


def _read_nfo_record(video_path: Path, fallback_code: str | None) -> dict[str, Any]:
    nfo_path = video_path.with_suffix(".nfo")
    try:
        root = ET.parse(nfo_path).getroot()
    except FileNotFoundError:
        return {}
    except (OSError, ET.ParseError) as exc:
        logger.warning("Local library NFO read failed for %s: %s", nfo_path, exc)
        return {}

    def first(*paths: str) -> str:
        for path in paths:
            value = root.findtext(path)
            if value and value.strip():
                return value.strip()
        return ""

    embedded_metadata = None
    embedded_text = first("javjaeger/metadata")
    if embedded_text:
        try:
            value = json.loads(embedded_text)
            if isinstance(value, dict):
                embedded_metadata = value
        except json.JSONDecodeError as exc:
            logger.warning("Local library embedded NFO metadata read failed for %s: %s", nfo_path, exc)

    raw_id = str((embedded_metadata or {}).get("id") or first("num", "uniqueid", "id")).strip()
    movie_id = recognize_designation(raw_id) or raw_id.upper() or fallback_code
    if not movie_id:
        return {}

    genres = list(dict.fromkeys(
        value
        for tag in ("genre", "tag")
        for node in root.findall(tag)
        if (value := str(node.text or "").strip())
    ))
    stars = [
        value
        for node in root.findall("actor")
        if (value := str(node.findtext("name") or node.text or "").strip())
    ]
    metadata = embedded_metadata or _build_metadata(
        {
            "id": movie_id,
            "title": first("title", "originaltitle", "sorttitle"),
            "date": first("premiered", "releasedate", "release", "date"),
            "videoLength": first("runtime"),
            "producer": first("studio", "maker"),
            "publisher": first("publisher"),
            "director": first("director"),
            "series": first("set/name", "set"),
            "genres": genres,
            "stars": stars,
            "img": first("poster", "cover"),
            "raw": {"id": movie_id, "source": "nfo", "path": str(nfo_path)},
        },
        movie_id,
        video_path.stem,
    )
    record = {
        "movie_id": movie_id,
        "metadata": metadata,
        "full_text": _metadata_full_text(movie_id, metadata),
        "scrape_status": "found",
        "scrape_error": None,
        "scraped_at": _iso_mtime(nfo_path),
    }

    video = root.find("./fileinfo/streamdetails/video")
    if video is not None:
        for tag, key in (("codec", "codec"), ("container", "container")):
            value = str(video.findtext(tag) or "").strip()
            if value:
                record[key] = value
        for tag, key in (
            ("width", "width"),
            ("height", "height"),
            ("bitrate", "bitrate"),
            ("durationinseconds", "duration_seconds"),
        ):
            try:
                value = int(float(str(video.findtext(tag) or "").strip()))
            except (ValueError, OverflowError):
                continue
            if value > 0:
                record[key] = value
        if record.get("width") and record.get("height"):
            record["resolution_pixels"] = record["width"] * record["height"]
    return record


def _build_library_file_record(path: Path, root: Path, probe_media: bool = False, previous: dict[str, Any] | None = None) -> dict[str, Any]:
    code = recognize_designation(path.stem)
    relative_path = path.relative_to(root)
    record = {
        "movie_id": code,
        "path": str(path),
        "relative_path": str(relative_path),
        "is_vr": root.name.casefold() == "vr" or any(part.casefold() == "vr" for part in relative_path.parts[:-1]),
        "file_name": path.name,
        "size": _file_size(path),
        "modified_at": _iso_mtime(path),
        "extension": path.suffix.lower(),
        "part": _source_part_marker(path.stem),
    }
    record.update(_read_nfo_record(path, code))
    record["is_vr"] = bool(record["is_vr"] or (record.get("metadata") or {}).get("is_vr"))
    # ponytail: size/mtime reuse detects normal edits; content integrity needs an explicit check.
    unchanged = bool(previous and record["modified_at"] and record["size"] == previous.get("size")
                     and record["modified_at"] == previous.get("modified_at"))
    if unchanged:
        for key in ("width", "height", "resolution_pixels", "bitrate", "codec", "container", "duration_seconds"):
            if previous.get(key) not in (None, "", 0):
                record.setdefault(key, previous[key])
    if probe_media and not (unchanged and _has_readable_video_media(previous)):
        record.update(_probe_video_metadata(path))
    return record


def _has_readable_video_media(media_info: dict[str, Any]) -> bool:
    if not isinstance(media_info, dict):
        return False
    width = int(media_info.get("width") or 0)
    height = int(media_info.get("height") or 0)
    resolution = int(media_info.get("resolution_pixels") or 0)
    bitrate = int(media_info.get("bitrate") or 0)
    codec = str(media_info.get("codec") or "").strip()
    container = str(media_info.get("container") or "").strip()
    return bool((width > 0 and height > 0) or resolution > 0 or bitrate > 0 or codec or container)


async def _scrape_metadata(movie_ids: list[str], concurrent: int) -> dict[str, dict[str, Any]]:
    return await scrape_movie_metadata_map(movie_ids, concurrent)


def _normalize_path_values(values: str | list[str] | tuple[str, ...] | None) -> list[str]:
    raw_values = [values] if isinstance(values, str) else list(values or [])
    normalized: list[str] = []
    seen: set[str] = set()
    for value in raw_values:
        path_value = str(value or "").strip()
        if not path_value or path_value in seen:
            continue
        seen.add(path_value)
        normalized.append(path_value)
    return normalized


def get_local_library_settings() -> dict[str, Any]:
    config = runtime.get_local_library_config()
    return {
        "success": True,
        "directories": _normalize_path_values(config.get("directories")),
        "ignored_paths": _normalize_path_values(config.get("ignored_paths")),
    }


def update_local_library_settings(request: LocalLibrarySettingsRequest) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    if request.directories is not None:
        updates["directories"] = _normalize_path_values(request.directories)
    if request.ignored_paths is not None:
        updates["ignored_paths"] = _normalize_path_values(request.ignored_paths)

    if updates:
        runtime.update_config_section("local_library", updates)
    return get_local_library_settings()


def _scan_directories_from_request(request: LocalLibraryScanRequest) -> list[str]:
    directories: list[str] = []
    if request.directory:
        directories.append(request.directory)
    if request.directories:
        directories.extend(request.directories)

    normalized = _normalize_path_values(directories)
    if not normalized and request.directory is None and request.directories is None:
        return get_local_library_settings()["directories"]
    return normalized


def _scan_ignored_paths_from_request(request: LocalLibraryScanRequest) -> list[str]:
    if request.ignored_paths is not None:
        return _normalize_path_values(request.ignored_paths)
    return get_local_library_settings()["ignored_paths"]


def _resolve_ignored_paths(root: Path, ignored_paths: list[str]) -> list[Path]:
    resolved_paths: list[Path] = []
    for ignored_path in ignored_paths:
        candidate = Path(ignored_path).expanduser()
        if not candidate.is_absolute():
            candidate = root / candidate
        try:
            resolved_paths.append(candidate.resolve(strict=False))
        except OSError:
            resolved_paths.append(Path(os.path.abspath(str(candidate))))
    return resolved_paths


def _is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def _filter_ignored_video_files(video_files: list[Path], ignored_paths: list[Path]) -> list[Path]:
    if not ignored_paths:
        return video_files

    filtered: list[Path] = []
    for video_file in video_files:
        try:
            resolved_video = video_file.resolve(strict=False)
        except OSError:
            resolved_video = Path(os.path.abspath(str(video_file)))
        if any(resolved_video == ignored_path or _is_relative_to(resolved_video, ignored_path) for ignored_path in ignored_paths):
            continue
        filtered.append(video_file)
    return filtered


def _file_sha256(path: Path) -> str | None:
    try:
        digest = hashlib.sha256()
        with open(path, "rb") as file:
            for chunk in iter(lambda: file.read(HASH_BLOCK_SIZE), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except OSError:
        return None


def _same_file_content(left: Path, right: Path) -> bool:
    if _file_size(left) != _file_size(right):
        return False
    left_digest = _file_sha256(left)
    return bool(left_digest and left_digest == _file_sha256(right))


def _delete_duplicate_video_files(records: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    candidate_keys: dict[tuple[str, int], int] = {}
    for record in records:
        movie_id = str(record.get("movie_id") or "").strip().upper()
        size = int(record.get("size") or 0)
        if movie_id and size > 0:
            candidate_keys[(movie_id, size)] = candidate_keys.get((movie_id, size), 0) + 1

    seen: dict[tuple[str, int, str], Path] = {}
    deleted_paths: set[str] = set()
    deleted_files: list[dict[str, str]] = []
    failed_files: list[dict[str, str]] = []

    for record in sorted(records, key=lambda item: str(item.get("path") or "").lower()):
        movie_id = str(record.get("movie_id") or "").strip().upper()
        size = int(record.get("size") or 0)
        path = Path(str(record.get("path") or ""))
        if candidate_keys.get((movie_id, size), 0) < 2 or not path.name or not path.exists() or not path.is_file():
            continue

        digest = _file_sha256(path)
        if digest is None:
            continue
        key = (movie_id, size, digest)
        if key not in seen:
            seen[key] = path
            continue

        kept_path = seen[key]
        try:
            path.unlink()
        except OSError as exc:
            failed_files.append({"path": str(path), "error": str(exc)})
            continue
        deleted_paths.add(os.path.abspath(str(path)))
        deleted_files.append({"path": str(path), "kept_path": str(kept_path)})

    kept_records = [
        record for record in records
        if os.path.abspath(str(record.get("path") or "")) not in deleted_paths
    ]
    return kept_records, {
        "deleted_duplicate_file_count": len(deleted_files),
        "regularization_failed_count": len(failed_files),
        "deleted_duplicate_files": deleted_files[:100],
        "regularization_failed_files": failed_files[:100],
    }


def _move_actor_avatar_files(records: list[dict[str, Any]]) -> dict[str, Any]:
    actor_service = getattr(local_movie_library_service, "actor_library_service", None)
    if actor_service is None:
        return {"regularized_actor_avatar_count": 0, "deleted_duplicate_actor_avatar_count": 0}

    moved: list[dict[str, str]] = []
    deleted_duplicates: list[dict[str, str]] = []
    failed: list[dict[str, str]] = []
    seen_sources: set[str] = set()

    for record in sorted(records, key=lambda item: str(item.get("path") or "").lower()):
        video_path = Path(str(record.get("path") or ""))
        actor_dir = video_path.parent / "actors"
        try:
            sources = sorted(
                [entry for entry in actor_dir.iterdir() if entry.is_file() and entry.suffix.lower() in ACTOR_AVATAR_EXTENSIONS],
                key=lambda path: str(path).lower(),
            )
        except OSError:
            continue

        for source in sources:
            try:
                resolved_source = source.resolve()
            except OSError as exc:
                failed.append({"path": str(source), "error": str(exc)})
                continue
            source_key = str(resolved_source).lower()
            if source_key in seen_sources:
                continue
            seen_sources.add(source_key)

            actor_key = actor_service.actor_key_for({"id": "", "name": source.stem})
            target = actor_service.avatar_target_for(actor_key)
            try:
                if resolved_source == target.resolve(strict=False):
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                if target.exists():
                    if _same_file_content(resolved_source, target):
                        resolved_source.unlink()
                        deleted_duplicates.append({"path": str(resolved_source), "kept_path": str(target)})
                    continue
                shutil.move(str(resolved_source), str(target))
            except OSError as exc:
                failed.append({"path": str(resolved_source), "error": str(exc)})
                continue
            moved.append({"source": str(resolved_source), "target": str(target)})

    return {
        "regularized_actor_avatar_count": len(moved),
        "deleted_duplicate_actor_avatar_count": len(deleted_duplicates),
        "regularization_failed_count": len(failed),
        "regularized_actor_avatars": moved[:100],
        "deleted_duplicate_actor_avatars": deleted_duplicates[:100],
        "regularization_failed_files": failed[:100],
    }


def _regularize_scan_files(records: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    avatar_result = _move_actor_avatar_files(records)
    kept_records, duplicate_result = _delete_duplicate_video_files(records)
    failed_files = [
        *duplicate_result.get("regularization_failed_files", []),
        *avatar_result.get("regularization_failed_files", []),
    ]
    return kept_records, {
        **duplicate_result,
        **avatar_result,
        "regularization_failed_count": int(duplicate_result.get("regularization_failed_count") or 0)
        + int(avatar_result.get("regularization_failed_count") or 0),
        "regularization_failed_files": failed_files[:100],
    }


def _collect_library_scan_records(root: Path, request: LocalLibraryScanRequest, ignored_paths: list[Path], previous: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    video_files = _filter_ignored_video_files(_walk_video_files(root, request.recursive, request.max_depth), ignored_paths)
    return [_build_library_file_record(path, root, request.probe_media, previous.get(os.path.normcase(os.path.abspath(path)))) for path in video_files]


async def _scan_local_library_directory(directory: str, request: LocalLibraryScanRequest) -> dict[str, Any]:
    try:
        root = resolve_existing_directory(directory)
    except UserPathError as exc:
        return {"success": False, "error": exc.code, "message": exc.message}

    ignored_paths = _resolve_ignored_paths(root, _scan_ignored_paths_from_request(request))
    previous = {os.path.normcase(os.path.abspath(file["path"])): dict(file)
                for record in await local_movie_library_service.get_all() for file in record.get("files", []) if file.get("path")}
    records = await asyncio.to_thread(_collect_library_scan_records, root, request, ignored_paths, previous)
    movie_ids = sorted({str(record["movie_id"]).upper() for record in records if record.get("movie_id")})
    metadata_map = await _scrape_metadata(movie_ids, request.concurrent) if request.scrape else {}
    scan_time = datetime.datetime.now().isoformat()

    for record in records:
        movie_id = record.get("movie_id")
        if not movie_id:
            continue
        scraped = metadata_map.get(str(movie_id).upper())
        if scraped:
            record.update(scraped)
            record["scraped_at"] = scan_time
        elif record.get("metadata"):
            continue
        else:
            metadata = _build_metadata(None, str(movie_id), str(movie_id))
            record["metadata"] = metadata
            record["scrape_status"] = "skipped"
            record["scrape_error"] = None
            record["full_text"] = _metadata_full_text(str(movie_id), metadata)
            record["scraped_at"] = ""
        record["is_vr"] = bool(record.get("is_vr") or (record.get("metadata") or {}).get("is_vr"))

    regularize_result = {
        "regularized_actor_avatar_count": 0,
        "deleted_duplicate_file_count": 0,
        "deleted_duplicate_actor_avatar_count": 0,
        "regularization_failed_count": 0,
    }
    if request.regularize_files:
        records, regularize_result = await asyncio.to_thread(_regularize_scan_files, records)

    result = await local_movie_library_service.update_from_scan(
        str(root),
        records,
        remove_missing=request.remove_missing,
    )
    result["directory"] = str(root)
    result["ignored_path_count"] = len(ignored_paths)
    result["scraped_movie_count"] = len(metadata_map)
    result.update(regularize_result)
    return result


def _aggregate_scan_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    successful_results = [result for result in results if result.get("success")]
    failed_results = [result for result in results if not result.get("success")]
    latest_success = successful_results[-1] if successful_results else {}
    scanned_files = sum(int(result.get("scanned_files") or 0) for result in successful_results)
    recognized_files = sum(int(result.get("recognized_files") or 0) for result in successful_results)
    unrecognized_files = sum(int(result.get("unrecognized_files") or 0) for result in successful_results)
    scraped_movie_count = sum(int(result.get("scraped_movie_count") or 0) for result in successful_results)
    removed_file_count = sum(int(result.get("removed_file_count") or 0) for result in successful_results)
    regularized_actor_avatar_count = sum(int(result.get("regularized_actor_avatar_count") or 0) for result in successful_results)
    deleted_duplicate_file_count = sum(int(result.get("deleted_duplicate_file_count") or 0) for result in successful_results)
    deleted_duplicate_actor_avatar_count = sum(int(result.get("deleted_duplicate_actor_avatar_count") or 0) for result in successful_results)
    regularization_failed_count = sum(int(result.get("regularization_failed_count") or 0) for result in successful_results)
    new_movie_count = sum(int(result.get("new_movie_count") or 0) for result in successful_results)
    updated_movie_count = sum(int(result.get("updated_movie_count") or 0) for result in successful_results)

    return {
        "success": len(successful_results) > 0 and len(failed_results) == 0,
        "scan_count": len(successful_results),
        "failed_count": len(failed_results),
        "directories": [str(result.get("directory") or result.get("scan_root") or "") for result in successful_results],
        "scans": results,
        "scanned_files": scanned_files,
        "recognized_files": recognized_files,
        "unrecognized_files": unrecognized_files,
        "scraped_movie_count": scraped_movie_count,
        "removed_file_count": removed_file_count,
        "regularized_actor_avatar_count": regularized_actor_avatar_count,
        "deleted_duplicate_file_count": deleted_duplicate_file_count,
        "deleted_duplicate_actor_avatar_count": deleted_duplicate_actor_avatar_count,
        "regularization_failed_count": regularization_failed_count,
        "new_movie_count": new_movie_count,
        "updated_movie_count": updated_movie_count,
        "total_movies": int(latest_success.get("total_movies") or 0),
        "total_files": int(latest_success.get("total_files") or 0),
        "actor_count": int(latest_success.get("actor_count") or 0),
        "message": f"已扫描 {len(successful_results)} 个目录，失败 {len(failed_results)} 个",
    }


async def scan_local_library(request: LocalLibraryScanRequest) -> dict[str, Any]:
    directories = _scan_directories_from_request(request)
    if not directories:
        return {"success": False, "error": "directory_required", "message": "请至少选择一个本地影视库路径"}

    if len(directories) == 1:
        return await _scan_local_library_directory(directories[0], request)

    results = []
    for directory in directories:
        results.append(await _scan_local_library_directory(directory, request))
    return _aggregate_scan_results(results)


async def get_local_library_payload(compact: bool = False) -> dict[str, Any]:
    payload = await local_movie_library_service.get_summary(compact=compact)
    for record in payload.get("records", []):
        record["is_vr"] = bool(record.get("is_vr") or movie_detail_is_vr(record.get("metadata") or record))
    return payload


def parse_information_check_fields(fields: str | list[str] | tuple[str, ...] | None) -> tuple[str, ...]:
    if isinstance(fields, str):
        raw_fields = [field.strip() for field in fields.split(",")]
    else:
        raw_fields = list(fields or [])
    return normalize_local_library_information_fields(raw_fields)


async def get_local_library_information_check(fields: str | list[str] | tuple[str, ...] | None = None, refresh_files: bool = False) -> dict[str, Any]:
    return await local_movie_library_service.get_information_check(parse_information_check_fields(fields), refresh_files=refresh_files)


async def clean_invalid_local_library_files() -> dict[str, Any]:
    if shutil.which("ffprobe") is None:
        return {
            "success": False,
            "error": "ffprobe_unavailable",
            "message": "ffprobe 不可用，无法安全清洗无效视频文件",
            "checked_file_count": 0,
            "invalid_file_count": 0,
            "deleted_file_count": 0,
            "deletion_failed_count": 0,
            "removed_movie_count": 0,
        }

    records = await local_movie_library_service.get_all()
    checked_file_count = 0
    invalid_file_count = 0
    probe_failed_count = 0
    deleted_files: list[dict[str, Any]] = []
    failed_files: list[dict[str, Any]] = []
    invalid_paths_by_movie: dict[str, list[str]] = {}
    media_by_movie: dict[str, dict[str, dict[str, Any]]] = {}

    for record in records:
        movie_id = str(record.get("movie_id") or "").strip().upper()
        if not movie_id:
            continue
        for file_record in record.get("files", []):
            video_path = Path(str(file_record.get("path") or ""))
            if not video_path.name:
                continue
            try:
                resolved = video_path.resolve()
            except OSError as exc:
                failed_files.append({
                    "movie_id": movie_id,
                    "path": str(video_path),
                    "error": "path_resolve_failed",
                    "message": str(exc),
                })
                continue
            if not resolved.exists() or not resolved.is_file():
                continue

            checked_file_count += 1
            try:
                before = resolved.stat()
                media_info = await asyncio.to_thread(_probe_video_metadata, resolved)
                after = resolved.stat()
                scan_root = Path(str(file_record.get("scan_root") or ""))
                within_root = scan_root.is_absolute() and _path_is_within(resolved, scan_root.resolve())
            except OSError:
                probe_failed_count += 1
                failed_files.append({"movie_id": movie_id, "path": str(resolved), "error": "file_unavailable", "message": "文件状态无法读取，已保留"})
                continue
            if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
                probe_failed_count += 1
                failed_files.append({"movie_id": movie_id, "path": str(resolved), "error": "file_changed", "message": "探测期间文件发生变化，已保留"})
                continue
            if _has_readable_video_media(media_info):
                media_by_movie.setdefault(movie_id, {})[os.path.abspath(str(resolved))] = media_info
                continue

            if media_info.get("probe_status") != "no_video" and after.st_size != 0:
                probe_failed_count += 1
                failed_files.append({"movie_id": movie_id, "path": str(resolved), "error": "probe_inconclusive", "message": "无法确认媒体无效，已保留文件"})
                continue
            if not within_root:
                failed_files.append({"movie_id": movie_id, "path": str(resolved), "error": "unsafe_path", "message": "文件不在索引扫描范围内，已保留"})
                continue
            invalid_file_count += 1
            try:
                resolved.unlink()
            except OSError as exc:
                failed_files.append({
                    "movie_id": movie_id,
                    "path": str(resolved),
                    "error": "delete_failed",
                    "message": str(exc),
                })
                continue

            deleted_files.append({
                "movie_id": movie_id,
                "path": str(resolved),
                "file_name": file_record.get("file_name") or resolved.name,
                "size": int(file_record.get("size") or 0),
            })
            invalid_paths_by_movie.setdefault(movie_id, []).append(os.path.abspath(str(resolved)))

    prune_result = await local_movie_library_service.clean_file_records(
        invalid_paths_by_movie,
        media_by_movie,
    )
    return {
        "success": True,
        "checked_file_count": checked_file_count,
        "invalid_file_count": invalid_file_count,
        "probe_failed_count": probe_failed_count,
        "deleted_file_count": len(deleted_files),
        "deletion_failed_count": sum(item["error"] == "delete_failed" for item in failed_files),
        "removed_file_count": prune_result.get("removed_file_count", 0),
        "removed_movie_count": prune_result.get("removed_movie_count", 0),
        "updated_media_file_count": prune_result.get("updated_media_file_count", 0),
        "total_movies": prune_result.get("total_movies", 0),
        "total_files": prune_result.get("total_files", 0),
        "deleted_files": deleted_files[:100],
        "failed_files": failed_files[:100],
        "message": f"已清洗 {len(deleted_files)} 个无效文件；{len(failed_files)} 个文件无法安全处理，已保留",
    }


async def download_missing_local_library_information(
    request: LocalLibraryInformationDownloadRequest, progress_callback: ProgressCallback | None = None,
) -> dict[str, Any]:
    selected_fields = parse_information_check_fields(request.fields)
    _emit_progress(progress_callback, {"phase": "check", "message": "正在核验待补全影片"})
    await local_movie_library_service.refresh_file_states(request.movie_ids or None)
    check = await local_movie_library_service.get_information_check(selected_fields)
    all_records = check.get("records", [])
    requested_ids = {
        str(movie_id or "").strip().upper()
        for movie_id in (request.movie_ids or [])
        if str(movie_id or "").strip()
    }

    candidate_records = []
    for record in all_records:
        movie_id = str(record.get("movie_id") or "").strip().upper()
        if not movie_id:
            continue
        if requested_ids and movie_id not in requested_ids:
            continue
        if request.only_missing and record.get("info_complete"):
            continue
        candidate_records.append(record)

    metadata_field_names = set(LOCAL_LIBRARY_INFORMATION_FIELDS)
    refresh_movie_ids = [
        str(record.get("movie_id") or "").strip().upper()
        for record in candidate_records
        if (
            not request.only_missing
            or any(field in metadata_field_names for field in (record.get("missing_fields") or []))
        )
    ]
    _emit_progress(progress_callback, {"phase": "scrape", "total": len(candidate_records),
                                      "message": f"正在联网获取 {len(refresh_movie_ids)} 部影片的资料"})
    metadata_map = await _scrape_metadata(refresh_movie_ids, request.concurrent) if refresh_movie_ids else {}
    scraped_at = datetime.datetime.now().isoformat()
    results: list[dict[str, Any]] = []
    updated_count = 0
    failed_count = 0

    for index, candidate in enumerate(candidate_records):
        movie_id = str(candidate.get("movie_id") or "").strip().upper()
        _emit_progress(progress_callback, {"phase": "download", "completed": index, "total": len(candidate_records),
                                          "current": movie_id, "message": f"正在补全 {movie_id}（{index + 1}/{len(candidate_records)}）"})
        status = await local_movie_library_service.get_status(movie_id)
        record = status.get("record") if isinstance(status, dict) else None
        existing_metadata = record.get("metadata") if isinstance(record, dict) and isinstance(record.get("metadata"), dict) else {}
        scraped = metadata_map.get(movie_id)
        needs_metadata_refresh = movie_id in set(refresh_movie_ids)
        if needs_metadata_refresh and not scraped:
            failed_count += 1
            results.append(
                {
                    "movie_id": movie_id,
                    "success": False,
                    "scrape_status": "failed",
                    "error": "metadata_fetch_missing",
                }
            )
            continue

        metadata = scraped["metadata"] if scraped else existing_metadata
        if not metadata:
            failed_count += 1
            results.append(
                {
                    "movie_id": movie_id,
                    "success": False,
                    "scrape_status": "failed",
                    "error": "metadata_missing",
                }
            )
            continue

        if scraped:
            saved = await local_movie_library_service.update_information(
                movie_id,
                metadata,
                scraped["scrape_status"],
                scraped["scrape_error"],
                scraped["full_text"],
                scraped_at,
            )
            scrape_status = scraped["scrape_status"]
        else:
            saved = bool(record)
            scrape_status = record.get("scrape_status") if isinstance(record, dict) else ""
        asset_result = await _write_local_library_information_assets(movie_id, metadata, request) if saved else {}
        result_success = bool(saved and not asset_result.get("asset_error") and not asset_result.get("image_error"))
        if result_success:
            updated_count += 1
        else:
            failed_count += 1
        results.append({
            "movie_id": movie_id,
            "success": result_success,
            "scrape_status": scrape_status,
            "error": asset_result.get("asset_error") if saved else "movie_not_in_local_library",
            **asset_result,
        })

    await local_movie_library_service.refresh_file_states([candidate["movie_id"] for candidate in candidate_records])
    next_check = await local_movie_library_service.get_information_check(selected_fields)
    message = f"资料补全完成：{updated_count} 成功，{failed_count} 失败，剩余 {next_check['incomplete_count']} 部待补全"
    _emit_progress(progress_callback, {"phase": "complete", "completed": len(candidate_records),
                                      "total": len(candidate_records), "message": message})
    return {
        "success": True,
        "message": message,
        "candidate_count": len(candidate_records),
        "updated_count": updated_count,
        "failed_count": failed_count,
        "results": results,
        "information_check": next_check,
    }


async def _write_local_library_information_assets(
    movie_id: str,
    metadata: dict[str, Any],
    request: LocalLibraryInformationDownloadRequest,
) -> dict[str, Any]:
    status = await local_movie_library_service.get_status(movie_id)
    record = status.get("record") if isinstance(status, dict) else None
    files = record.get("files", []) if isinstance(record, dict) else []
    video_paths: list[Path] = []
    for file_record in files:
        video_path = Path(str(file_record.get("path") or ""))
        try:
            resolved = video_path.resolve()
        except OSError:
            continue
        if resolved.exists() and resolved.is_file():
            video_paths.append(resolved)

    if not video_paths or not metadata.get("id"):
        return {
            "nfo_path": None,
            "poster": None,
            "samples": [],
            "actor_images": [],
            "list_thumbnail": None,
            "asset_error": None,
        }

    primary_video_path = video_paths[0]
    media_by_path = {str(video_path): await asyncio.to_thread(_probe_video_metadata, video_path) for video_path in video_paths}
    await local_movie_library_service.update_file_media_info(movie_id, media_by_path)
    poster_name = None
    sample_names: list[str] = []
    actor_image_names: list[str] = []
    list_thumbnail_name = None
    nfo_path = None
    asset_error = None

    if request.download_images:
        try:
            poster_name, sample_names = await _write_images(
                primary_video_path,
                metadata,
                request.overwrite_existing,
                include_samples=request.download_sample_images,
            )
        except Exception as exc:
            asset_error = "image_download_failed"
            logger.warning("Local library image download failed for %s: %s", movie_id, exc)
        if metadata.get("cover_url") and not poster_name:
            asset_error = "image_download_failed"

    if request.download_actor_images:
        actor_image_names = await _write_actor_images(primary_video_path, metadata, request.overwrite_existing)

    if request.download_list_thumbnail:
        list_thumbnail_name = await _write_list_thumbnail(primary_video_path, metadata, request.overwrite_existing)

    if request.write_nfo:
        nfo_path = await asyncio.to_thread(_write_nfo, primary_video_path, metadata, poster_name, sample_names)

    return {
        "nfo_path": str(nfo_path) if nfo_path else None,
        "poster": poster_name,
        "samples": sample_names,
        "actor_images": actor_image_names,
        "list_thumbnail": list_thumbnail_name,
        "image_error": "image_download_failed" if asset_error == "image_download_failed" else None,
        "asset_error": asset_error,
    }


async def get_local_library_status(movie_id: str) -> dict[str, Any]:
    payload = await local_movie_library_service.get_status(movie_id)
    record = payload.get("record")
    if record:
        record = dict(record)
        record["is_vr"] = bool(record.get("is_vr") or movie_detail_is_vr(record.get("metadata") or record))
        payload["record"] = record
    return payload


async def clear_local_library() -> dict[str, Any]:
    return await local_movie_library_service.clear()


async def delete_local_library_movie(movie_id: str) -> dict[str, Any]:
    return await local_movie_library_service.delete_movie(movie_id)


def _normalized_file_key(path: Path) -> str:
    return os.path.normcase(str(path.resolve(strict=False)))


def _path_is_within(path: Path, parent: Path) -> bool:
    try:
        return path == parent or path.is_relative_to(parent)
    except (AttributeError, ValueError):
        return _is_relative_to(path, parent)


def _existing_or_symlink(path: Path) -> bool:
    try:
        return path.exists() or path.is_symlink()
    except OSError:
        return False


def _nfo_referenced_local_assets(nfo_path: Path, video_directory: Path) -> list[Path]:
    if not nfo_path.exists() or not nfo_path.is_file():
        return []
    try:
        root = ET.parse(nfo_path).getroot()
    except (OSError, ET.ParseError) as exc:
        logger.warning("Local library delete could not inspect NFO %s: %s", nfo_path, exc)
        return []

    assets: list[Path] = []
    resolved_directory = video_directory.resolve(strict=False)
    for node in root.iter():
        if node.tag not in {"thumb", "poster"}:
            continue
        value = str(node.text or "").strip()
        if not value or "://" in value or value.startswith("data:"):
            continue
        relative_path = Path(value)
        if relative_path.is_absolute():
            continue
        candidate = video_directory / relative_path
        try:
            resolved_candidate = candidate.resolve(strict=False)
        except OSError:
            continue
        if resolved_candidate != resolved_directory and _path_is_within(resolved_candidate, resolved_directory):
            assets.append(candidate)
    return assets


def _video_sidecar_candidates(video_path: Path, include_folder_assets: bool) -> tuple[set[Path], set[Path]]:
    candidates: set[Path] = {video_path.with_suffix(".nfo")}
    removable_directories: set[Path] = {video_path.parent}
    stem_key = video_path.stem.casefold()

    try:
        siblings = list(video_path.parent.iterdir())
    except OSError as exc:
        raise OSError(f"无法读取影片目录：{video_path.parent}") from exc

    for sibling in siblings:
        if not sibling.is_file() and not sibling.is_symlink():
            continue
        name_key = sibling.name.casefold()
        suffix_key = sibling.suffix.casefold()
        if suffix_key in LOCAL_LIBRARY_SUBTITLE_EXTENSIONS and (
            name_key.startswith(f"{stem_key}.") or name_key.startswith(f"{stem_key}-")
        ):
            candidates.add(sibling)
            continue
        if suffix_key not in LOCAL_LIBRARY_IMAGE_EXTENSIONS:
            continue
        sibling_stem_key = sibling.stem.casefold()
        is_named_sidecar = sibling_stem_key == stem_key or any(
            sibling_stem_key == f"{stem_key}-{role}" for role in LOCAL_LIBRARY_IMAGE_ROLES
        )
        is_unshared_folder_asset = include_folder_assets and sibling_stem_key in LOCAL_LIBRARY_FOLDER_ASSET_STEMS
        if is_named_sidecar or is_unshared_folder_asset:
            candidates.add(sibling)

    nfo_path = video_path.with_suffix(".nfo")
    if include_folder_assets:
        for asset_path in _nfo_referenced_local_assets(nfo_path, video_path.parent):
            candidates.add(asset_path)
            removable_directories.add(asset_path.parent)
    return candidates, removable_directories


def _permanent_delete_error(movie_id: str, error: str, message: str) -> dict[str, Any]:
    return {
        "success": False,
        "deleted": False,
        "movie_id": movie_id,
        "error": error,
        "message": message,
    }


async def delete_local_library_movie_files(movie_id: str) -> dict[str, Any]:
    normalized = str(movie_id or "").strip().upper()
    if not normalized:
        return _permanent_delete_error("", "invalid_movie_id", "影片番号无效")

    status = await local_movie_library_service.get_status(normalized)
    record = status.get("record") if isinstance(status, dict) else None
    if not isinstance(record, dict):
        return _permanent_delete_error(normalized, "movie_not_found", "影片不在影视库中")

    file_records = [item for item in record.get("files", []) if isinstance(item, dict)]
    all_records = await local_movie_library_service.get_all()
    other_video_keys: set[str] = set()
    other_video_parent_keys: set[str] = set()
    for other_record in all_records:
        if str(other_record.get("movie_id") or "").strip().upper() == normalized:
            continue
        for other_file in other_record.get("files", []):
            if not isinstance(other_file, dict) or not other_file.get("path"):
                continue
            other_path = Path(str(other_file["path"]))
            try:
                other_video_keys.add(_normalized_file_key(other_path))
                other_video_parent_keys.add(_normalized_file_key(other_path.parent))
            except OSError:
                continue

    video_targets: list[tuple[Path, Path]] = []
    deletion_targets: dict[str, tuple[Path, Path, str]] = {}
    removable_directories: set[tuple[Path, Path]] = set()

    for file_record in file_records:
        path_value = str(file_record.get("path") or "").strip()
        scan_root_value = str(file_record.get("scan_root") or "").strip()
        if not path_value or not scan_root_value:
            return _permanent_delete_error(normalized, "unsafe_library_path", "影视库记录缺少安全删除所需的路径信息")

        video_path = Path(path_value)
        scan_root = Path(scan_root_value)
        if not video_path.is_absolute() or not scan_root.is_absolute():
            return _permanent_delete_error(normalized, "unsafe_library_path", "影视库记录包含非绝对路径，已拒绝删除")
        try:
            resolved_video = video_path.resolve(strict=False)
            resolved_root = scan_root.resolve(strict=False)
        except OSError:
            return _permanent_delete_error(normalized, "unsafe_library_path", "无法验证影片文件的安全删除范围")
        if not resolved_root.exists() or not resolved_root.is_dir():
            return _permanent_delete_error(normalized, "scan_root_unavailable", "影片所在的扫描目录当前不可访问，已保留影视库记录")
        if resolved_video == resolved_root or not _path_is_within(resolved_video, resolved_root):
            return _permanent_delete_error(normalized, "unsafe_library_path", "影片文件超出原扫描目录，已拒绝删除")
        if _normalized_file_key(video_path) in other_video_keys:
            return _permanent_delete_error(normalized, "shared_library_file", "影片文件仍被其他影视库记录引用，已拒绝删除")
        if _existing_or_symlink(video_path) and not video_path.is_file() and not video_path.is_symlink():
            return _permanent_delete_error(normalized, "invalid_library_file", "影视库记录指向的路径不是文件，已拒绝删除")

        video_targets.append((video_path, resolved_root))

    for video_path, resolved_root in video_targets:
        include_folder_assets = _normalized_file_key(video_path.parent) not in other_video_parent_keys
        try:
            sidecars, sidecar_directories = _video_sidecar_candidates(video_path, include_folder_assets)
        except OSError as exc:
            return _permanent_delete_error(normalized, "related_file_scan_failed", str(exc))

        for target, kind in [(path, "related") for path in sidecars] + [(video_path, "video")]:
            try:
                resolved_target = target.resolve(strict=False)
            except OSError:
                return _permanent_delete_error(normalized, "unsafe_library_path", "无法验证关联文件的安全删除范围")
            if resolved_target == resolved_root or not _path_is_within(resolved_target, resolved_root):
                return _permanent_delete_error(normalized, "unsafe_library_path", "关联文件超出原扫描目录，已拒绝删除")
            if _existing_or_symlink(target) and not target.is_file() and not target.is_symlink():
                return _permanent_delete_error(normalized, "invalid_related_file", "关联文件路径不是普通文件，已拒绝删除")
            deletion_targets[_normalized_file_key(target)] = (target, resolved_root, kind)
        for directory in sidecar_directories:
            removable_directories.add((directory, resolved_root))

    deleted_paths: list[str] = []
    deleted_video_count = 0
    deleted_related_file_count = 0
    deleted_size = 0
    ordered_targets = sorted(deletion_targets.values(), key=lambda item: (item[2] == "video", str(item[0])))
    for target, _scan_root, kind in ordered_targets:
        if not _existing_or_symlink(target):
            continue
        try:
            try:
                deleted_size += int(target.stat().st_size)
            except OSError:
                pass
            target.unlink()
        except OSError as exc:
            logger.warning("Local library permanent delete failed for %s: %s", target, exc)
            result = _permanent_delete_error(normalized, "file_delete_failed", f"删除文件失败：{target.name}")
            result.update({
                "deleted_file_count": len(deleted_paths),
                "deleted_video_count": deleted_video_count,
                "deleted_related_file_count": deleted_related_file_count,
                "deleted_size": deleted_size,
            })
            return result
        deleted_paths.append(str(target))
        if kind == "video":
            deleted_video_count += 1
        else:
            deleted_related_file_count += 1

    for directory, scan_root in sorted(removable_directories, key=lambda item: len(item[0].parts), reverse=True):
        try:
            resolved_directory = directory.resolve(strict=False)
            if resolved_directory != scan_root and _path_is_within(resolved_directory, scan_root):
                directory.rmdir()
        except OSError:
            pass

    record_result = await local_movie_library_service.delete_movie(normalized)
    if not record_result.get("success"):
        result = _permanent_delete_error(normalized, "library_record_delete_failed", "文件已删除，但影视库记录删除失败")
        result.update({
            "deleted_file_count": len(deleted_paths),
            "deleted_video_count": deleted_video_count,
            "deleted_related_file_count": deleted_related_file_count,
            "deleted_size": deleted_size,
        })
        return result

    return {
        "success": True,
        "deleted": True,
        "movie_id": normalized,
        "deleted_file_count": len(deleted_paths),
        "deleted_video_count": deleted_video_count,
        "deleted_related_file_count": deleted_related_file_count,
        "deleted_size": deleted_size,
        "message": "影片文件、关联文件和影视库记录已永久删除",
    }
