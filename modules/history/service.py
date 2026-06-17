import asyncio
import datetime
import json
import logging
import os
from typing import Any

from modules.javbus_api import javbus_api_service


logger = logging.getLogger(__name__)


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
        total_files = sum(int(record.get("file_count") or 0) for record in records)
        total_size = sum(int(record.get("total_size") or 0) for record in records)
        return {
            "success": True,
            "total_movies": len(records),
            "total_files": total_files,
            "total_size": total_size,
            "records": records,
        }

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
