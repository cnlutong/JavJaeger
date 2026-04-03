import asyncio
import datetime
import json
import logging
import os
from typing import Any

from modules.common.runtime import JAVBUS_API_BASE_URL, api_client


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

                movie_url = f"{JAVBUS_API_BASE_URL}/api/movies/{movie_id}"
                movie_data = await api_client.get_json(movie_url) or {}

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

                record["cover"] = movie_data.get("cover", "")
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
