import datetime
import asyncio
import logging
from pathlib import Path
from typing import Any

from modules.common.paths import UserPathError, resolve_existing_directory
from modules.history.service import local_movie_library_service
from modules.javbus_api import javbus_api_service
from .local_scrape import _build_metadata, _file_size, _metadata_full_text, _source_part_marker, _walk_video_files, recognize_designation
from .schemas import LocalLibraryScanRequest


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


async def get_local_library_status(movie_id: str) -> dict[str, Any]:
    return await local_movie_library_service.get_status(movie_id)


async def clear_local_library() -> dict[str, Any]:
    return await local_movie_library_service.clear()
