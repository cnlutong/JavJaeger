import asyncio
import datetime
import json
import logging
import os
import re
from pathlib import Path
from typing import Any

from modules.javbus_api import javbus_api_service


logger = logging.getLogger(__name__)


LOCAL_LIBRARY_INFORMATION_FIELDS = ("title", "date", "stars", "genres", "cover_url")
LOCAL_LIBRARY_INFORMATION_FIELD_LABELS = {
    "title": "标题",
    "date": "发行日期",
    "stars": "演员",
    "genres": "标签",
    "cover_url": "封面",
}


class DownloadHistoryService:
    def __init__(self, file_path: str = "data/downloaded_movies.json") -> None:
        self.file_path = file_path
        self._cache: dict[str, dict[str, Any]] = {}
        self._loaded = False
        self._lock = asyncio.Lock()

    async def load_records(self) -> list[dict[str, Any]]:
        async with self._lock:
            if self._loaded:
                return list(self._cache.values())

            os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
            if os.path.exists(self.file_path):
                with open(self.file_path, "r", encoding="utf-8") as file:
                    data = json.load(file)
                    self._cache = {record["movie_id"]: record for record in data}
                    logger.info("已加载 %s 条下载记录", len(self._cache))
            else:
                with open(self.file_path, "w", encoding="utf-8") as file:
                    json.dump([], file, ensure_ascii=False, indent=2)
                self._cache = {}
                logger.info("已创建空的下载记录文件: %s", self.file_path)

            self._loaded = True
            return list(self._cache.values())

    async def get_history(self) -> list[dict[str, Any]]:
        records = await self.load_records()
        records.sort(key=lambda item: item.get("download_time", ""), reverse=True)
        return records

    async def clear(self) -> dict[str, Any]:
        async with self._lock:
            os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
            with open(self.file_path, "w", encoding="utf-8") as file:
                json.dump([], file, ensure_ascii=False)
            self._cache.clear()
            self._loaded = True
        return {"success": True, "message": "历史记录已清空"}

    async def is_movie_downloaded(self, movie_id: str) -> bool:
        await self.load_records()
        return movie_id in self._cache

    async def save_movies(self, movie_ids: list[str]) -> None:
        await self.load_records()
        async with self._lock:
            current_time = datetime.datetime.now().isoformat()

            for movie_id in movie_ids:
                if movie_id in self._cache and "title" in self._cache[movie_id]:
                    continue

                try:
                    movie_data = await javbus_api_service.get_movie_detail(movie_id)
                except Exception as exc:
                    logger.error("Failed to load movie metadata for %s: %s", movie_id, exc)
                    movie_data = {}

                record = self._cache.get(
                    movie_id,
                    {
                        "movie_id": movie_id,
                        "download_time": current_time,
                    },
                )
                record["title"] = movie_data.get("title", "")
                record["date"] = movie_data.get("date", "")

                stars = movie_data.get("stars", [])
                record["stars"] = [star.get("name", "") for star in stars] if isinstance(stars, list) else []

                genres = movie_data.get("genres", [])
                record["genres"] = [genre.get("name", "") for genre in genres] if isinstance(genres, list) else []

                record["img"] = movie_data.get("img", "")
                self._cache[movie_id] = record

            downloaded_movies = list(self._cache.values())
            downloaded_movies.sort(key=lambda item: item.get("download_time", ""), reverse=True)
            with open(self.file_path, "w", encoding="utf-8") as file:
                json.dump(downloaded_movies, file, ensure_ascii=False, indent=2)

            logger.info("保存下载记录: %s", movie_ids)

    async def get_downloaded_movie_ids(self) -> dict[str, Any]:
        downloaded_movies = await self.load_records()
        return {
            "success": True,
            "downloaded_movies": [record["movie_id"] for record in downloaded_movies],
            "total_count": len(downloaded_movies),
        }

    async def get_downloaded_movie_status(self, movie_id: str) -> dict[str, Any]:
        return {
            "success": True,
            "movie_id": movie_id,
            "is_downloaded": await self.is_movie_downloaded(movie_id),
        }


download_history_service = DownloadHistoryService()


class LocalMovieLibraryService:
    def __init__(self, file_path: str = "data/local_movie_library.json") -> None:
        self.file_path = file_path
        self._cache: dict[str, dict[str, Any]] = {}
        self._loaded = False
        self._lock = asyncio.Lock()

    def _empty_payload(self) -> dict[str, Any]:
        return {"version": 1, "updated_at": "", "movies": {}}

    async def load_records(self) -> dict[str, dict[str, Any]]:
        async with self._lock:
            if self._loaded:
                return self._cache

            os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
            if os.path.exists(self.file_path):
                with open(self.file_path, "r", encoding="utf-8") as file:
                    data = json.load(file)
                if isinstance(data, list):
                    self._cache = {str(record.get("movie_id", "")).upper(): record for record in data if record.get("movie_id")}
                else:
                    movies = data.get("movies", {}) if isinstance(data, dict) else {}
                    self._cache = {str(movie_id).upper(): record for movie_id, record in movies.items()}
                logger.info("已加载 %s 条本地影片库记录", len(self._cache))
            else:
                with open(self.file_path, "w", encoding="utf-8") as file:
                    json.dump(self._empty_payload(), file, ensure_ascii=False, indent=2)
                self._cache = {}
                logger.info("已创建空的本地影片库文件: %s", self.file_path)

            self._loaded = True
            return self._cache

    async def _save_locked(self) -> None:
        now = datetime.datetime.now().isoformat()
        payload = {"version": 1, "updated_at": now, "movies": self._cache}
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
        with open(self.file_path, "w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)

    async def get_all(self) -> list[dict[str, Any]]:
        records = await self.load_records()
        values = list(records.values())
        values.sort(key=lambda item: item.get("movie_id", ""))
        return values

    async def get_summary(self) -> dict[str, Any]:
        records = await self.get_all()
        for record in records:
            metadata = record.get("metadata") if isinstance(record.get("metadata"), dict) else {}
            record["cover_url"] = metadata.get("cover_url") or record.get("img") or ""
            if await self.get_poster_path(str(record.get("movie_id") or "")):
                record["poster_url"] = f"/api/movies/local-library/poster/{record.get('movie_id')}"
            thumbnail_path = await self.get_thumbnail_path(str(record.get("movie_id") or ""))
            if thumbnail_path:
                record["thumbnail_url"] = f"/api/movies/local-library/thumbnail/{record.get('movie_id')}"
            elif metadata.get("list_thumbnail_url"):
                record["thumbnail_url"] = metadata.get("list_thumbnail_url")
        total_files = sum(int(record.get("file_count") or 0) for record in records)
        total_size = sum(int(record.get("total_size") or 0) for record in records)
        return {
            "success": True,
            "total_movies": len(records),
            "total_files": total_files,
            "total_size": total_size,
            "records": records,
        }

    def _has_remote_metadata(self, record: dict[str, Any]) -> bool:
        metadata = record.get("metadata") if isinstance(record.get("metadata"), dict) else {}
        raw = metadata.get("raw")
        return bool(record.get("scrape_status") == "found" or (isinstance(raw, dict) and raw.get("id")))

    def _information_value(self, record: dict[str, Any], field_name: str) -> Any:
        metadata = record.get("metadata") if isinstance(record.get("metadata"), dict) else {}
        if field_name == "cover_url":
            return metadata.get("cover_url") or record.get("cover_url") or record.get("img")
        return metadata.get(field_name) if field_name in metadata else record.get(field_name)

    def _missing_information_fields(
        self,
        record: dict[str, Any],
        field_names: tuple[str, ...] = LOCAL_LIBRARY_INFORMATION_FIELDS,
    ) -> list[str]:
        missing: list[str] = []
        movie_id = str(record.get("movie_id") or "").strip().upper()
        has_remote_metadata = self._has_remote_metadata(record)
        for field_name in field_names:
            value = self._information_value(record, field_name)
            is_missing = value in (None, "", [], {})
            if field_name == "title" and (is_missing or (str(value).strip().upper() == movie_id and not has_remote_metadata)):
                is_missing = True
            if is_missing:
                missing.append(field_name)
        return missing

    async def get_information_check(self) -> dict[str, Any]:
        records = await self.get_all()
        checked_records: list[dict[str, Any]] = []
        for record in records:
            missing_fields = self._missing_information_fields(record)
            checked_record = {
                "movie_id": record.get("movie_id"),
                "title": record.get("title") or record.get("movie_id"),
                "scrape_status": record.get("scrape_status") or "",
                "has_metadata": self._has_remote_metadata(record),
                "info_complete": not missing_fields,
                "missing_fields": missing_fields,
                "missing_labels": [
                    LOCAL_LIBRARY_INFORMATION_FIELD_LABELS.get(field_name, field_name)
                    for field_name in missing_fields
                ],
            }
            checked_records.append(checked_record)

        incomplete_records = [record for record in checked_records if not record["info_complete"]]
        return {
            "success": True,
            "fields": list(LOCAL_LIBRARY_INFORMATION_FIELDS),
            "field_labels": LOCAL_LIBRARY_INFORMATION_FIELD_LABELS,
            "total_movies": len(checked_records),
            "complete_count": len(checked_records) - len(incomplete_records),
            "incomplete_count": len(incomplete_records),
            "records": checked_records,
            "incomplete_records": incomplete_records,
        }

    async def update_information(
        self,
        movie_id: str,
        metadata: dict[str, Any],
        scrape_status: str,
        scrape_error: str | None,
        full_text: str,
        scraped_at: str,
    ) -> bool:
        await self.load_records()
        normalized = str(movie_id or "").strip().upper()
        if not normalized:
            return False

        async with self._lock:
            record = self._cache.get(normalized)
            if not record:
                return False

            record["metadata"] = metadata
            record["title"] = metadata.get("title") or normalized
            record["date"] = metadata.get("date") or ""
            record["stars"] = metadata.get("stars") or []
            record["genres"] = metadata.get("genres") or []
            record["studio"] = metadata.get("studio") or ""
            record["publisher"] = metadata.get("publisher") or ""
            record["director"] = metadata.get("director") or ""
            record["series"] = metadata.get("series") or ""
            record["full_text"] = full_text
            record["scrape_status"] = scrape_status
            record["scrape_error"] = scrape_error
            record["scraped_at"] = scraped_at
            self._refresh_record_totals(record, scraped_at)
            await self._save_locked()
            return True

    async def clear(self) -> dict[str, Any]:
        await self.load_records()
        async with self._lock:
            self._cache.clear()
            await self._save_locked()
        return {"success": True, "message": "本地影片库已清空"}

    async def is_movie_present(self, movie_id: str) -> bool:
        if not movie_id:
            return False
        records = await self.load_records()
        return movie_id.upper() in records

    async def get_status(self, movie_id: str) -> dict[str, Any]:
        records = await self.load_records()
        normalized = (movie_id or "").upper()
        record = records.get(normalized)
        return {
            "success": True,
            "movie_id": normalized,
            "in_local_library": bool(record),
            "record": record,
        }

    async def get_poster_path(self, movie_id: str) -> Path | None:
        records = await self.load_records()
        record = records.get((movie_id or "").upper())
        if not record:
            return None

        for file_record in record.get("files", []):
            video_path = Path(str(file_record.get("path") or ""))
            if not video_path.name:
                continue
            candidates = [
                video_path.with_name(f"{video_path.stem}-poster.jpg"),
                video_path.with_name(f"{video_path.stem}-poster.png"),
                video_path.with_name("poster.jpg"),
                video_path.with_name("folder.jpg"),
                video_path.with_name("cover.jpg"),
            ]
            for candidate in candidates:
                try:
                    if candidate.exists() and candidate.is_file():
                        return candidate.resolve()
                except OSError:
                    continue
        return None

    async def get_thumbnail_path(self, movie_id: str) -> Path | None:
        records = await self.load_records()
        record = records.get((movie_id or "").upper())
        if not record:
            return None

        for file_record in record.get("files", []):
            video_path = Path(str(file_record.get("path") or ""))
            if not video_path.name:
                continue
            candidates = [
                video_path.with_name(f"{video_path.stem}-thumb.jpg"),
                video_path.with_name(f"{video_path.stem}-thumb.png"),
                video_path.with_name("thumb.jpg"),
                video_path.with_name("thumbnail.jpg"),
            ]
            for candidate in candidates:
                try:
                    if candidate.exists() and candidate.is_file():
                        return candidate.resolve()
                except OSError:
                    continue
        return None

    def _actor_avatar_candidates(self, video_path: Path, actor_name: str) -> list[Path]:
        raw_name = str(actor_name or "").strip()
        if not raw_name:
            return []
        sanitized = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", raw_name).strip().strip(". ")
        sanitized = re.sub(r"\s+", " ", sanitized) or raw_name
        stems = []
        for stem in (raw_name, sanitized):
            if stem and stem not in stems:
                stems.append(stem)
        actor_dir = video_path.parent / "actors"
        extensions = [".jpg", ".jpeg", ".png", ".webp"]
        return [actor_dir / f"{stem}{extension}" for stem in stems for extension in extensions]

    async def get_actor_avatar_path(self, movie_id: str, actor_name: str) -> Path | None:
        records = await self.load_records()
        record = records.get((movie_id or "").upper())
        if not record:
            return None

        for file_record in record.get("files", []):
            video_path = Path(str(file_record.get("path") or ""))
            if not video_path.name:
                continue
            for candidate in self._actor_avatar_candidates(video_path, actor_name):
                try:
                    if candidate.exists() and candidate.is_file():
                        return candidate.resolve()
                except OSError:
                    continue
        return None

    async def get_video_file_path(self, movie_id: str, file_index: int = 0) -> Path | None:
        records = await self.load_records()
        record = records.get((movie_id or "").upper())
        if not record:
            return None

        files = record.get("files", [])
        if file_index < 0 or file_index >= len(files):
            return None

        file_record = files[file_index]
        video_path = Path(str(file_record.get("path") or ""))
        try:
            resolved = video_path.resolve()
        except OSError:
            return None
        return resolved if resolved.exists() and resolved.is_file() else None

    async def update_from_scan(
        self,
        scan_root: str,
        files: list[dict[str, Any]],
        remove_missing: bool = True,
    ) -> dict[str, Any]:
        await self.load_records()
        now = datetime.datetime.now().isoformat()
        normalized_root = os.path.abspath(scan_root)
        recognized_files = [item for item in files if item.get("movie_id")]
        unrecognized_files = [item for item in files if not item.get("movie_id")]

        async with self._lock:
            previous_movie_ids = set(self._cache.keys())
            removed_files = 0

            if remove_missing:
                empty_movie_ids: list[str] = []
                for movie_id, record in self._cache.items():
                    kept_files = []
                    for file_record in record.get("files", []):
                        if os.path.abspath(str(file_record.get("scan_root") or "")) == normalized_root:
                            removed_files += 1
                            continue
                        kept_files.append(file_record)
                    record["files"] = kept_files
                    if not kept_files:
                        empty_movie_ids.append(movie_id)
                    else:
                        self._refresh_record_totals(record, now)
                for movie_id in empty_movie_ids:
                    self._cache.pop(movie_id, None)

            changed_movie_ids: set[str] = set()
            for item in recognized_files:
                movie_id = str(item["movie_id"]).upper()
                record = self._cache.get(movie_id)
                if not record:
                    record = {
                        "movie_id": movie_id,
                        "first_seen_at": now,
                        "files": [],
                    }
                    self._cache[movie_id] = record

                file_record = dict(item)
                metadata = file_record.pop("metadata", None)
                full_text = file_record.pop("full_text", None)
                scrape_status = file_record.pop("scrape_status", None)
                scrape_error = file_record.pop("scrape_error", None)
                scraped_at = file_record.pop("scraped_at", None)

                if metadata:
                    record["metadata"] = metadata
                    record["title"] = metadata.get("title") or movie_id
                    record["date"] = metadata.get("date") or ""
                    record["stars"] = metadata.get("stars") or []
                    record["genres"] = metadata.get("genres") or []
                    record["studio"] = metadata.get("studio") or ""
                    record["publisher"] = metadata.get("publisher") or ""
                    record["director"] = metadata.get("director") or ""
                    record["series"] = metadata.get("series") or ""
                if full_text is not None:
                    record["full_text"] = full_text
                if scrape_status:
                    record["scrape_status"] = scrape_status
                if scrape_error is not None:
                    record["scrape_error"] = scrape_error
                if scraped_at is not None:
                    record["scraped_at"] = scraped_at

                file_record["movie_id"] = movie_id
                file_record["scan_root"] = normalized_root
                file_path = os.path.abspath(str(file_record.get("path") or ""))
                existing_files = [
                    existing for existing in record.get("files", [])
                    if os.path.abspath(str(existing.get("path") or "")) != file_path
                ]
                existing_files.append(file_record)
                record["files"] = existing_files
                self._refresh_record_totals(record, now)
                changed_movie_ids.add(movie_id)

            await self._save_locked()

        new_movie_ids = changed_movie_ids - previous_movie_ids
        return {
            "success": True,
            "scan_root": normalized_root,
            "scanned_files": len(files),
            "recognized_files": len(recognized_files),
            "unrecognized_files": len(unrecognized_files),
            "movie_count": len(changed_movie_ids),
            "new_movie_count": len(new_movie_ids),
            "updated_movie_count": len(changed_movie_ids - new_movie_ids),
            "removed_file_count": removed_files,
            "total_movies": len(self._cache),
            "total_files": sum(int(record.get("file_count") or 0) for record in self._cache.values()),
            "unrecognized": unrecognized_files[:50],
        }

    def _refresh_record_totals(self, record: dict[str, Any], updated_at: str) -> None:
        files = record.get("files", [])
        record["file_count"] = len(files)
        record["total_size"] = sum(int(item.get("size") or 0) for item in files)
        record["updated_at"] = updated_at
        roots = sorted({str(item.get("scan_root") or "") for item in files if item.get("scan_root")})
        record["scan_roots"] = roots


local_movie_library_service = LocalMovieLibraryService()
