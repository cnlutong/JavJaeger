import datetime
import asyncio
import logging
from pathlib import Path
from typing import Any

from modules.common.paths import UserPathError, resolve_existing_directory
from modules.history.service import LOCAL_LIBRARY_INFORMATION_FIELDS, local_movie_library_service
from modules.javbus_api import javbus_api_service
from .local_scrape import (
    _build_metadata,
    _file_size,
    _metadata_full_text,
    _source_part_marker,
    _walk_video_files,
    _write_actor_images,
    _write_images,
    _write_list_thumbnail,
    _write_nfo,
    recognize_designation,
)
from .schemas import LocalLibraryInformationDownloadRequest, LocalLibraryScanRequest


logger = logging.getLogger(__name__)


def _iso_mtime(path: Path) -> str:
    try:
        return datetime.datetime.fromtimestamp(path.stat().st_mtime).isoformat()
    except OSError:
        return ""


def _build_library_file_record(path: Path, root: Path) -> dict[str, Any]:
    code = recognize_designation(path.stem)
    return {
        "movie_id": code,
        "path": str(path),
        "relative_path": str(path.relative_to(root)),
        "file_name": path.name,
        "size": _file_size(path),
        "modified_at": _iso_mtime(path),
        "extension": path.suffix.lower(),
        "part": _source_part_marker(path.stem),
    }


async def _scrape_metadata(movie_ids: list[str], concurrent: int) -> dict[str, dict[str, Any]]:
    semaphore = asyncio.Semaphore(max(1, min(concurrent, 5)))
    results: dict[str, dict[str, Any]] = {}

    async def fetch(movie_id: str) -> None:
        async with semaphore:
            try:
                detail = await javbus_api_service.get_movie_detail(movie_id)
                metadata = _build_metadata(detail, movie_id, movie_id)
                results[movie_id] = {
                    "metadata": metadata,
                    "scrape_status": "found" if detail and detail.get("id") else "not_found",
                    "scrape_error": None,
                    "full_text": _metadata_full_text(movie_id, metadata),
                }
            except Exception as exc:
                logger.warning("Local library metadata fetch failed for %s: %s", movie_id, exc)
                metadata = _build_metadata(None, movie_id, movie_id)
                results[movie_id] = {
                    "metadata": metadata,
                    "scrape_status": "failed",
                    "scrape_error": "metadata_fetch_failed",
                    "full_text": _metadata_full_text(movie_id, metadata),
                }

    await asyncio.gather(*[fetch(movie_id) for movie_id in movie_ids])
    return results


async def scan_local_library(request: LocalLibraryScanRequest) -> dict[str, Any]:
    try:
        root = resolve_existing_directory(request.directory)
    except UserPathError as exc:
        return {"success": False, "error": exc.code, "message": exc.message}

    video_files = _walk_video_files(root, request.recursive, request.max_depth)
    records = [_build_library_file_record(path, root) for path in video_files]
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
        else:
            metadata = _build_metadata(None, str(movie_id), str(movie_id))
            record["metadata"] = metadata
            record["scrape_status"] = "skipped"
            record["scrape_error"] = None
            record["full_text"] = _metadata_full_text(str(movie_id), metadata)
            record["scraped_at"] = ""

    result = await local_movie_library_service.update_from_scan(
        str(root),
        records,
        remove_missing=request.remove_missing,
    )
    result["directory"] = str(root)
    result["scraped_movie_count"] = len(metadata_map)
    return result


async def get_local_library_payload() -> dict[str, Any]:
    return await local_movie_library_service.get_summary()


async def get_local_library_information_check() -> dict[str, Any]:
    return await local_movie_library_service.get_information_check()


async def download_missing_local_library_information(request: LocalLibraryInformationDownloadRequest) -> dict[str, Any]:
    check = await local_movie_library_service.get_information_check()
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
    metadata_map = await _scrape_metadata(refresh_movie_ids, request.concurrent) if refresh_movie_ids else {}
    scraped_at = datetime.datetime.now().isoformat()
    results: list[dict[str, Any]] = []
    updated_count = 0
    failed_count = 0

    for candidate in candidate_records:
        movie_id = str(candidate.get("movie_id") or "").strip().upper()
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
        if saved:
            updated_count += 1
        else:
            failed_count += 1
        results.append({
            "movie_id": movie_id,
            "success": saved,
            "scrape_status": scrape_status,
            "error": asset_result.get("asset_error") if saved else "movie_not_in_local_library",
            **asset_result,
        })

    next_check = await local_movie_library_service.get_information_check()
    return {
        "success": True,
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

    if request.download_actor_images:
        actor_image_names = await _write_actor_images(primary_video_path, metadata, request.overwrite_existing)

    if request.download_list_thumbnail:
        list_thumbnail_name = await _write_list_thumbnail(primary_video_path, metadata, request.overwrite_existing)

    if request.write_nfo:
        nfo_path = _write_nfo(primary_video_path, metadata, poster_name, sample_names)

    return {
        "nfo_path": str(nfo_path) if nfo_path else None,
        "poster": poster_name,
        "samples": sample_names,
        "actor_images": actor_image_names,
        "list_thumbnail": list_thumbnail_name,
        "asset_error": asset_error,
    }


async def get_local_library_status(movie_id: str) -> dict[str, Any]:
    return await local_movie_library_service.get_status(movie_id)


async def clear_local_library() -> dict[str, Any]:
    return await local_movie_library_service.clear()


async def delete_local_library_movie(movie_id: str) -> dict[str, Any]:
    return await local_movie_library_service.delete_movie(movie_id)
