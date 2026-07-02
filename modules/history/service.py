import asyncio
import datetime
import json
import logging
import os
import re
from pathlib import Path
from typing import Any

from modules.common.image_download import download_image
from modules.javbus_api import javbus_api_service


logger = logging.getLogger(__name__)


LOCAL_LIBRARY_INFORMATION_FIELDS = ("title", "date", "stars", "genres", "cover_url")
LOCAL_LIBRARY_INFORMATION_ASSET_FIELDS = ("nfo", "poster_file")
LOCAL_LIBRARY_INFORMATION_CHECK_FIELDS = LOCAL_LIBRARY_INFORMATION_FIELDS + LOCAL_LIBRARY_INFORMATION_ASSET_FIELDS
LOCAL_LIBRARY_INFORMATION_FIELD_LABELS = {
    "title": "标题",
    "date": "发行日期",
    "stars": "演员",
    "genres": "标签",
    "cover_url": "封面",
    "nfo": "NFO",
    "poster_file": "本地封面",
}


def normalize_local_library_information_fields(field_names: list[str] | tuple[str, ...] | None = None) -> tuple[str, ...]:
    if not field_names:
        return LOCAL_LIBRARY_INFORMATION_CHECK_FIELDS
    allowed = set(LOCAL_LIBRARY_INFORMATION_CHECK_FIELDS)
    normalized: list[str] = []
    for field_name in field_names:
        value = str(field_name or "").strip()
        if value in allowed and value not in normalized:
            normalized.append(value)
    return tuple(normalized) if normalized else LOCAL_LIBRARY_INFORMATION_CHECK_FIELDS


def _normalize_movie_id(movie_id: Any) -> str:
    return str(movie_id or "").strip().upper()


def _normalize_download_link_key(link: Any) -> str:
    return str(link or "").strip().lower()


def _normalize_magnet_source(source: Any) -> str:
    return str(source or "").strip().lower()


def _append_download_resource(
    resources: list[dict[str, str]],
    seen: dict[str, int],
    link: Any,
    source: Any = "",
) -> None:
    normalized_link = str(link or "").strip()
    link_key = _normalize_download_link_key(normalized_link)
    if not link_key:
        return

    normalized_source = _normalize_magnet_source(source)
    if link_key in seen:
        existing = resources[seen[link_key]]
        if normalized_source and not existing.get("source"):
            existing["source"] = normalized_source
        return

    seen[link_key] = len(resources)
    resources.append({"link": normalized_link, "source": normalized_source})


def _extract_download_resources(record: dict[str, Any]) -> list[dict[str, str]]:
    resources: list[dict[str, str]] = []
    seen: dict[str, int] = {}

    for field_name in ("download_resources", "magnet_resources", "resources"):
        value = record.get(field_name)
        if not isinstance(value, list):
            continue
        for item in value:
            if isinstance(item, dict):
                link = item.get("link") or item.get("magnet") or item.get("download_link") or item.get("magnet_link")
                source = item.get("source") or item.get("magnet_source") or item.get("download_source")
                _append_download_resource(resources, seen, link, source)
            else:
                _append_download_resource(resources, seen, item)

    fallback_sources: list[Any] = []
    for source_field_name in ("download_sources", "magnet_sources"):
        source_value = record.get(source_field_name)
        if isinstance(source_value, list):
            fallback_sources = source_value
            break
    single_source = record.get("download_source") or record.get("magnet_source") or record.get("source")

    for field_name in ("download_links", "magnet_links"):
        value = record.get(field_name)
        if not isinstance(value, list):
            continue
        for index, link in enumerate(value):
            source = fallback_sources[index] if index < len(fallback_sources) else single_source
            _append_download_resource(resources, seen, link, source)

    for field_name in ("download_link", "magnet_link", "link", "magnet"):
        if record.get(field_name):
            _append_download_resource(resources, seen, record[field_name], single_source)

    return resources


def _extract_download_links(record: dict[str, Any]) -> list[str]:
    return [resource["link"] for resource in _extract_download_resources(record)]


def _normalize_history_record(record: dict[str, Any]) -> dict[str, Any] | None:
    movie_id = _normalize_movie_id(record.get("movie_id"))
    if not movie_id:
        return None
    normalized = dict(record)
    normalized["movie_id"] = movie_id
    normalized["download_resources"] = _extract_download_resources(normalized)
    normalized["download_links"] = [resource["link"] for resource in normalized["download_resources"]]
    return normalized


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

            parent_dir = os.path.dirname(self.file_path)
            if parent_dir:
                os.makedirs(parent_dir, exist_ok=True)
            if os.path.exists(self.file_path):
                with open(self.file_path, "r", encoding="utf-8") as file:
                    data = json.load(file)
                    if isinstance(data, dict):
                        source_records = data.get("movies") or data.get("records") or []
                    else:
                        source_records = data
                    self._cache = {}
                    if isinstance(source_records, list):
                        for record in source_records:
                            if not isinstance(record, dict):
                                continue
                            normalized = _normalize_history_record(record)
                            if normalized:
                                self._cache[normalized["movie_id"]] = normalized
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
            parent_dir = os.path.dirname(self.file_path)
            if parent_dir:
                os.makedirs(parent_dir, exist_ok=True)
            with open(self.file_path, "w", encoding="utf-8") as file:
                json.dump([], file, ensure_ascii=False)
            self._cache.clear()
            self._loaded = True
        return {"success": True, "message": "历史记录已清空"}

    async def is_movie_downloaded(self, movie_id: str) -> bool:
        await self.load_records()
        return _normalize_movie_id(movie_id) in self._cache

    async def is_magnet_downloaded(self, movie_id: str, magnet_link: str) -> bool:
        if not movie_id or not magnet_link:
            return False
        await self.load_records()
        record = self._cache.get(_normalize_movie_id(movie_id))
        if not record:
            return False
        target_key = _normalize_download_link_key(magnet_link)
        return any(
            _normalize_download_link_key(resource.get("link")) == target_key
            for resource in _extract_download_resources(record)
        )

    async def get_magnet_source(self, movie_id: str, magnet_link: str) -> str:
        if not movie_id or not magnet_link:
            return ""
        await self.load_records()
        record = self._cache.get(_normalize_movie_id(movie_id))
        if not record:
            return ""
        target_key = _normalize_download_link_key(magnet_link)
        for resource in _extract_download_resources(record):
            if _normalize_download_link_key(resource.get("link")) == target_key:
                return _normalize_magnet_source(resource.get("source"))
        return ""

    async def get_downloaded_magnet_links(self, movie_id: str) -> list[str]:
        await self.load_records()
        record = self._cache.get(_normalize_movie_id(movie_id))
        if not record:
            return []
        return [resource["link"] for resource in _extract_download_resources(record)]

    async def get_downloaded_magnet_resources(self, movie_id: str) -> list[dict[str, str]]:
        await self.load_records()
        record = self._cache.get(_normalize_movie_id(movie_id))
        if not record:
            return []
        return _extract_download_resources(record)

    async def save_movies(
        self,
        movie_ids: list[str],
        magnet_links: list[str] | None = None,
        magnet_sources: list[str] | None = None,
    ) -> None:
        await self.load_records()
        async with self._lock:
            current_time = datetime.datetime.now().isoformat()

            for index, raw_movie_id in enumerate(movie_ids):
                movie_id = _normalize_movie_id(raw_movie_id)
                if not movie_id:
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
                record["movie_id"] = movie_id
                record.setdefault("download_time", current_time)
                record["updated_at"] = current_time
                record["title"] = movie_data.get("title", "")
                record["date"] = movie_data.get("date", "")

                stars = movie_data.get("stars", [])
                record["stars"] = [star.get("name", "") for star in stars] if isinstance(stars, list) else []

                genres = movie_data.get("genres", [])
                record["genres"] = [genre.get("name", "") for genre in genres] if isinstance(genres, list) else []

                record["img"] = movie_data.get("img", "")
                download_resources = _extract_download_resources(record)
                resource_indexes = {
                    _normalize_download_link_key(resource.get("link")): resource
                    for resource in download_resources
                    if _normalize_download_link_key(resource.get("link"))
                }
                if magnet_links is not None and index < len(magnet_links):
                    link = str(magnet_links[index] or "").strip()
                    link_key = _normalize_download_link_key(link)
                    source = (
                        _normalize_magnet_source(magnet_sources[index])
                        if magnet_sources is not None and index < len(magnet_sources)
                        else ""
                    )
                    if link_key and link_key not in resource_indexes:
                        resource = {"link": link, "source": source}
                        download_resources.append(resource)
                        resource_indexes[link_key] = resource
                    elif link_key and source and not resource_indexes[link_key].get("source"):
                        resource_indexes[link_key]["source"] = source
                record["download_resources"] = download_resources
                record["download_links"] = [resource["link"] for resource in download_resources]
                self._cache[movie_id] = record

            downloaded_movies = list(self._cache.values())
            downloaded_movies.sort(key=lambda item: item.get("download_time", ""), reverse=True)
            parent_dir = os.path.dirname(self.file_path)
            if parent_dir:
                os.makedirs(parent_dir, exist_ok=True)
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
        normalized = _normalize_movie_id(movie_id)
        return {
            "success": True,
            "movie_id": normalized,
            "is_downloaded": await self.is_movie_downloaded(normalized),
            "download_links": await self.get_downloaded_magnet_links(normalized),
            "download_resources": await self.get_downloaded_magnet_resources(normalized),
        }


download_history_service = DownloadHistoryService()


def _safe_actor_file_stem(value: str, fallback: str = "actor") -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", str(value or "")).strip().strip(". ")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return (cleaned or fallback)[:180].rstrip(". ")


def _actor_name(actor: Any) -> str:
    if isinstance(actor, dict):
        return str(actor.get("name") or actor.get("title") or actor.get("id") or "").strip()
    return str(actor or "").strip()


class ActorLibraryService:
    def __init__(self, file_path: str = "data/local_actor_library.json", image_dir: str = "data/actor_images") -> None:
        self.file_path = file_path
        self.image_dir = image_dir
        self._cache: dict[str, dict[str, Any]] = {}
        self._loaded = False
        self._lock = asyncio.Lock()

    def _empty_payload(self) -> dict[str, Any]:
        return {"version": 1, "updated_at": "", "actors": {}}

    def _actor_key(self, actor: dict[str, Any]) -> str:
        actor_id = str(actor.get("id") or "").strip()
        if actor_id:
            return _safe_actor_file_stem(actor_id.lower(), actor_id)
        return _safe_actor_file_stem(str(actor.get("name") or "").strip(), "actor")

    def _avatar_target(self, actor_key: str) -> Path:
        return Path(self.image_dir) / f"{_safe_actor_file_stem(actor_key, 'actor')}.jpg"

    def _actor_refs_from_record(self, record: dict[str, Any]) -> list[dict[str, str]]:
        values: list[Any] = []
        metadata = record.get("metadata") if isinstance(record.get("metadata"), dict) else {}
        raw = metadata.get("raw") if isinstance(metadata.get("raw"), dict) else {}
        for source in (
            raw.get("stars"),
            metadata.get("actor_refs"),
            metadata.get("stars"),
            record.get("stars"),
        ):
            if isinstance(source, list):
                values.extend(source)

        refs: list[dict[str, str]] = []
        seen: set[str] = set()
        seen_names: set[str] = set()
        for value in values:
            name = _actor_name(value)
            if isinstance(value, dict):
                actor_id = str(value.get("id") or "").strip()
                avatar = str(
                    value.get("avatar")
                    or value.get("img")
                    or value.get("image")
                    or value.get("thumbnail")
                    or ""
                ).strip()
            else:
                actor_id = ""
                avatar = ""
            if not (name or actor_id):
                continue
            actor = {"id": actor_id, "name": name or actor_id}
            if avatar:
                actor["avatar"] = avatar
            key = self._actor_key(actor)
            normalized_name = actor["name"].strip().lower()
            if key in seen or (normalized_name and normalized_name in seen_names):
                continue
            seen.add(key)
            if normalized_name:
                seen_names.add(normalized_name)
            refs.append(actor)
        return refs

    def _movie_summary_from_record(self, record: dict[str, Any]) -> dict[str, Any]:
        metadata = record.get("metadata") if isinstance(record.get("metadata"), dict) else {}
        movie_id = str(record.get("movie_id") or metadata.get("id") or "").strip().upper()
        return {
            "movie_id": movie_id,
            "title": record.get("title") or metadata.get("title") or movie_id,
            "date": record.get("date") or metadata.get("date") or "",
            "cover_url": metadata.get("cover_url") or record.get("cover_url") or record.get("img") or "",
        }

    async def load_records(self) -> dict[str, dict[str, Any]]:
        async with self._lock:
            if self._loaded:
                return self._cache

            os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
            if os.path.exists(self.file_path):
                with open(self.file_path, "r", encoding="utf-8") as file:
                    data = json.load(file)
                actors = data.get("actors", {}) if isinstance(data, dict) else {}
                self._cache = {str(actor_key): record for actor_key, record in actors.items() if isinstance(record, dict)}
            else:
                with open(self.file_path, "w", encoding="utf-8") as file:
                    json.dump(self._empty_payload(), file, ensure_ascii=False, indent=2)
                self._cache = {}
            self._loaded = True
            return self._cache

    async def _save_locked(self) -> None:
        now = datetime.datetime.now().isoformat()
        payload = {"version": 1, "updated_at": now, "actors": self._cache}
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
        with open(self.file_path, "w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)

    async def _ensure_actor_avatar(self, actor_key: str, actor: dict[str, Any], overwrite: bool) -> bool:
        existing_path = await self.get_avatar_path(actor_key)
        if existing_path and not overwrite:
            return False

        avatar_url = str(actor.get("remote_avatar_url") or "").strip()
        actor_id = str(actor.get("id") or "").strip()
        if not avatar_url and actor_id:
            try:
                star_info = await javbus_api_service.get_star_info(actor_id)
                if isinstance(star_info, dict):
                    avatar_url = str(star_info.get("avatar") or "").strip()
                    if avatar_url:
                        actor["remote_avatar_url"] = avatar_url
            except Exception as exc:
                logger.warning("Actor avatar lookup failed for %s: %r", actor_id, exc)
                return False
        if not avatar_url:
            return False

        target = self._avatar_target(actor_key)
        if target.exists() and not overwrite:
            actor["avatar_file"] = target.name
            return False
        try:
            name = await download_image(avatar_url, target, overwrite)
        except Exception as exc:
            logger.warning("Actor avatar download failed for %s: %r", avatar_url, exc)
            return False
        if not name:
            return False
        actor["avatar_file"] = name
        return True

    async def sync_from_movie_records(
        self,
        records: list[dict[str, Any]] | dict[str, dict[str, Any]],
        download_missing_avatars: bool = True,
        overwrite_existing_avatars: bool = False,
    ) -> dict[str, Any]:
        await self.load_records()
        source_records = list(records.values()) if isinstance(records, dict) else list(records or [])
        previous = {actor_key: dict(actor) for actor_key, actor in self._cache.items()}
        now = datetime.datetime.now().isoformat()
        next_cache: dict[str, dict[str, Any]] = {}

        for record in source_records:
            movie = self._movie_summary_from_record(record)
            if not movie["movie_id"]:
                continue
            for actor_ref in self._actor_refs_from_record(record):
                actor_key = self._actor_key(actor_ref)
                existing = previous.get(actor_key, {})
                actor = next_cache.get(actor_key) or {
                    "key": actor_key,
                    "id": existing.get("id") or actor_ref.get("id") or "",
                    "name": existing.get("name") or actor_ref.get("name") or actor_key,
                    "remote_avatar_url": existing.get("remote_avatar_url") or actor_ref.get("avatar") or "",
                    "avatar_file": existing.get("avatar_file") or "",
                    "first_seen_at": existing.get("first_seen_at") or now,
                    "movies": {},
                }
                if actor_ref.get("id") and not actor.get("id"):
                    actor["id"] = actor_ref["id"]
                if actor_ref.get("name") and actor.get("name") == actor_key:
                    actor["name"] = actor_ref["name"]
                if actor_ref.get("avatar") and not actor.get("remote_avatar_url"):
                    actor["remote_avatar_url"] = actor_ref["avatar"]
                actor["movies"][movie["movie_id"]] = movie
                actor["updated_at"] = now
                next_cache[actor_key] = actor

        changed_avatar_count = 0
        if download_missing_avatars:
            for actor_key, actor in next_cache.items():
                if await self._ensure_actor_avatar(actor_key, actor, overwrite_existing_avatars):
                    changed_avatar_count += 1

        for actor in next_cache.values():
            movies = actor.get("movies") if isinstance(actor.get("movies"), dict) else {}
            actor["movie_ids"] = sorted(movies.keys())
            actor["movie_count"] = len(actor["movie_ids"])

        async with self._lock:
            self._cache = next_cache
            self._loaded = True
            await self._save_locked()

        return {
            "success": True,
            "total_actors": len(next_cache),
            "downloaded_avatar_count": changed_avatar_count,
        }

    async def get_summary(self) -> dict[str, Any]:
        records = await self.load_records()
        actors: list[dict[str, Any]] = []
        for actor_key, actor in records.items():
            movies = actor.get("movies") if isinstance(actor.get("movies"), dict) else {}
            actor_payload = dict(actor)
            actor_payload["key"] = actor_key
            actor_payload["movie_ids"] = sorted(movies.keys())
            actor_payload["movie_count"] = len(actor_payload["movie_ids"])
            actor_payload["movies"] = [movies[movie_id] for movie_id in actor_payload["movie_ids"]]
            actor_payload.pop("avatar_url", None)
            if await self.get_avatar_path(actor_key):
                actor_payload["avatar_url"] = f"/api/movies/local-library/actors/{actor_key}/avatar"
            actors.append(actor_payload)
        actors.sort(key=lambda item: (-int(item.get("movie_count") or 0), str(item.get("name") or "")))
        return {"success": True, "total_actors": len(actors), "actors": actors}

    async def get_avatar_path(self, actor_key: str) -> Path | None:
        records = await self.load_records()
        actor = records.get(str(actor_key or ""))
        if not actor:
            return None

        candidates: list[Path] = []
        avatar_file = str(actor.get("avatar_file") or "").strip()
        if avatar_file:
            candidates.append(Path(self.image_dir) / avatar_file)
        candidates.append(self._avatar_target(str(actor_key)))
        for candidate in candidates:
            try:
                resolved = candidate.resolve()
            except OSError:
                continue
            if resolved.exists() and resolved.is_file():
                return resolved
        return None

    async def get_movies_for_actor(self, actor_key: str) -> dict[str, Any]:
        records = await self.load_records()
        actor = records.get(str(actor_key or ""))
        if not actor:
            return {"success": False, "error": "actor_not_found", "actor": None, "movies": []}
        movies = actor.get("movies") if isinstance(actor.get("movies"), dict) else {}
        movie_ids = sorted(movies.keys())
        return {
            "success": True,
            "actor": dict(actor),
            "movies": [movies[movie_id] for movie_id in movie_ids],
            "movie_ids": movie_ids,
        }


local_actor_library_service = ActorLibraryService()


class LocalMovieLibraryService:
    def __init__(
        self,
        file_path: str = "data/local_movie_library.json",
        actor_library_service: ActorLibraryService | None = None,
    ) -> None:
        self.file_path = file_path
        self.actor_library_service = actor_library_service
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

    async def _sync_actor_library(
        self,
        records: list[dict[str, Any]] | None = None,
        download_missing_avatars: bool = True,
    ) -> dict[str, Any] | None:
        if self.actor_library_service is None:
            return None
        source_records = records if records is not None else list(self._cache.values())
        return await self.actor_library_service.sync_from_movie_records(
            source_records,
            download_missing_avatars=download_missing_avatars,
        )

    async def get_all(self) -> list[dict[str, Any]]:
        records = await self.load_records()
        values = list(records.values())
        values.sort(key=lambda item: item.get("movie_id", ""))
        return values

    async def get_summary(self) -> dict[str, Any]:
        records = [dict(record) for record in await self.get_all()]
        for record in records:
            metadata = record.get("metadata") if isinstance(record.get("metadata"), dict) else {}
            record["cover_url"] = metadata.get("cover_url") or record.get("img") or ""
            record["media_info"] = self._record_media_info(record)
            record.pop("poster_url", None)
            record.pop("thumbnail_url", None)
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

    def _iter_existing_video_paths(self, record: dict[str, Any]) -> list[Path]:
        paths: list[Path] = []
        for file_record in record.get("files", []):
            video_path = Path(str(file_record.get("path") or ""))
            if not video_path.name:
                continue
            try:
                resolved = video_path.resolve()
            except OSError:
                continue
            if resolved.exists() and resolved.is_file():
                paths.append(resolved)
        return paths

    def _has_nfo_file(self, record: dict[str, Any]) -> bool:
        for video_path in self._iter_existing_video_paths(record):
            try:
                if video_path.with_suffix(".nfo").exists():
                    return True
            except OSError:
                continue
        return False

    def _has_poster_file(self, record: dict[str, Any]) -> bool:
        for video_path in self._iter_existing_video_paths(record):
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
                        return True
                except OSError:
                    continue
        return False

    def _missing_information_fields(
        self,
        record: dict[str, Any],
        field_names: tuple[str, ...] | None = None,
    ) -> list[str]:
        selected_fields = normalize_local_library_information_fields(field_names)
        metadata_fields = tuple(field_name for field_name in selected_fields if field_name in LOCAL_LIBRARY_INFORMATION_FIELDS)
        missing: list[str] = []
        movie_id = str(record.get("movie_id") or "").strip().upper()
        has_remote_metadata = self._has_remote_metadata(record)
        for field_name in metadata_fields:
            value = self._information_value(record, field_name)
            is_missing = value in (None, "", [], {})
            if field_name == "title" and (is_missing or (str(value).strip().upper() == movie_id and not has_remote_metadata)):
                is_missing = True
            if is_missing:
                missing.append(field_name)
        if "nfo" in selected_fields and has_remote_metadata and not self._has_nfo_file(record):
            missing.append("nfo")
        if "poster_file" in selected_fields and self._information_value(record, "cover_url") and not self._has_poster_file(record):
            missing.append("poster_file")
        return missing

    async def get_information_check(self, field_names: list[str] | tuple[str, ...] | None = None) -> dict[str, Any]:
        selected_fields = normalize_local_library_information_fields(field_names)
        records = await self.get_all()
        checked_records: list[dict[str, Any]] = []
        for record in records:
            missing_fields = self._missing_information_fields(record, selected_fields)
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
            "fields": list(selected_fields),
            "available_fields": list(LOCAL_LIBRARY_INFORMATION_CHECK_FIELDS),
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
            actor_records = list(self._cache.values())
            await self._save_locked()
        await self._sync_actor_library(actor_records, download_missing_avatars=True)
        return True

    async def update_file_media_info(self, movie_id: str, media_by_path: dict[str, dict[str, Any]]) -> bool:
        await self.load_records()
        normalized = str(movie_id or "").strip().upper()
        if not normalized or not media_by_path:
            return False

        normalized_media = {
            os.path.abspath(str(path)): media
            for path, media in media_by_path.items()
            if isinstance(media, dict) and media
        }
        if not normalized_media:
            return False

        allowed_fields = {"width", "height", "resolution_pixels", "bitrate", "codec", "container", "duration_seconds"}
        async with self._lock:
            record = self._cache.get(normalized)
            if not record:
                return False
            changed = False
            for file_record in record.get("files", []):
                file_path = os.path.abspath(str(file_record.get("path") or ""))
                media = normalized_media.get(file_path)
                if not media:
                    continue
                for key in allowed_fields:
                    value = media.get(key)
                    if value in (None, "", 0):
                        continue
                    if file_record.get(key) != value:
                        file_record[key] = value
                        changed = True
            if changed:
                self._refresh_record_totals(record, datetime.datetime.now().isoformat())
                await self._save_locked()
            return changed

    async def clean_file_records(
        self,
        invalid_paths_by_movie: dict[str, list[str]],
        media_by_movie: dict[str, dict[str, dict[str, Any]]] | None = None,
    ) -> dict[str, Any]:
        await self.load_records()
        media_by_movie = media_by_movie or {}
        allowed_fields = {"width", "height", "resolution_pixels", "bitrate", "codec", "container", "duration_seconds"}
        now = datetime.datetime.now().isoformat()
        removed_file_count = 0
        removed_movie_ids: list[str] = []
        updated_media_file_count = 0

        normalized_invalid = {
            str(movie_id or "").strip().upper(): {os.path.abspath(str(path)) for path in paths}
            for movie_id, paths in (invalid_paths_by_movie or {}).items()
        }
        normalized_media = {
            str(movie_id or "").strip().upper(): {
                os.path.abspath(str(path)): media
                for path, media in media_by_path.items()
                if isinstance(media, dict) and media
            }
            for movie_id, media_by_path in media_by_movie.items()
            if isinstance(media_by_path, dict)
        }

        async with self._lock:
            touched = False
            movie_ids = set(normalized_invalid.keys()) | set(normalized_media.keys())
            for movie_id in movie_ids:
                if not movie_id:
                    continue
                record = self._cache.get(movie_id)
                if not record:
                    continue

                invalid_paths = normalized_invalid.get(movie_id, set())
                media_by_path = normalized_media.get(movie_id, {})
                kept_files: list[dict[str, Any]] = []
                record_changed = False

                for file_record in record.get("files", []):
                    file_path = os.path.abspath(str(file_record.get("path") or ""))
                    if file_path in invalid_paths:
                        removed_file_count += 1
                        record_changed = True
                        touched = True
                        continue

                    media = media_by_path.get(file_path)
                    if media:
                        media_changed = False
                        for key in allowed_fields:
                            value = media.get(key)
                            if value in (None, "", 0):
                                continue
                            if file_record.get(key) != value:
                                file_record[key] = value
                                media_changed = True
                        if media_changed:
                            updated_media_file_count += 1
                            record_changed = True
                            touched = True
                    kept_files.append(file_record)

                if record_changed:
                    record["files"] = kept_files
                    if kept_files:
                        self._refresh_record_totals(record, now)
                    else:
                        self._cache.pop(movie_id, None)
                        removed_movie_ids.append(movie_id)

            actor_records = list(self._cache.values())
            if touched:
                await self._save_locked()

        if removed_file_count or removed_movie_ids:
            await self._sync_actor_library(actor_records, download_missing_avatars=False)

        return {
            "success": True,
            "removed_file_count": removed_file_count,
            "removed_movie_count": len(removed_movie_ids),
            "removed_movie_ids": removed_movie_ids,
            "updated_media_file_count": updated_media_file_count,
            "total_movies": len(self._cache),
            "total_files": sum(int(record.get("file_count") or 0) for record in self._cache.values()),
        }

    async def clear(self) -> dict[str, Any]:
        await self.load_records()
        async with self._lock:
            self._cache.clear()
            await self._save_locked()
        await self._sync_actor_library([], download_missing_avatars=False)
        return {"success": True, "message": "本地影片库已清空"}

    async def delete_movie(self, movie_id: str) -> dict[str, Any]:
        await self.load_records()
        normalized = str(movie_id or "").strip().upper()
        if not normalized:
            return {
                "success": False,
                "deleted": False,
                "movie_id": "",
                "error": "invalid_movie_id",
                "message": "影片番号无效",
            }

        async with self._lock:
            record = self._cache.pop(normalized, None)
            if not record:
                return {
                    "success": False,
                    "deleted": False,
                    "movie_id": normalized,
                    "error": "movie_not_found",
                    "message": "影片不在影视库中",
                }
            actor_records = list(self._cache.values())
            await self._save_locked()

        await self._sync_actor_library(actor_records, download_missing_avatars=False)
        return {
            "success": True,
            "deleted": True,
            "movie_id": normalized,
            "file_count": int(record.get("file_count") or len(record.get("files", []))),
            "message": "影片已从影视库移除",
        }

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
            actor_records = list(self._cache.values())

        new_movie_ids = changed_movie_ids - previous_movie_ids
        actor_result = await self._sync_actor_library(actor_records, download_missing_avatars=True)
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
            "actor_count": actor_result.get("total_actors") if actor_result else 0,
        }

    def _refresh_record_totals(self, record: dict[str, Any], updated_at: str) -> None:
        files = record.get("files", [])
        record["file_count"] = len(files)
        record["total_size"] = sum(int(item.get("size") or 0) for item in files)
        record["updated_at"] = updated_at
        roots = sorted({str(item.get("scan_root") or "") for item in files if item.get("scan_root")})
        record["scan_roots"] = roots

    def _record_media_info(self, record: dict[str, Any]) -> dict[str, Any]:
        files = [file_record for file_record in record.get("files", []) if isinstance(file_record, dict)]
        best_file = max(
            files,
            key=lambda item: (int(item.get("resolution_pixels") or 0), int(item.get("bitrate") or 0)),
            default=None,
        )
        if not best_file:
            return {}
        media_info = {
            key: best_file.get(key)
            for key in ("width", "height", "resolution_pixels", "bitrate", "codec", "container", "duration_seconds")
            if best_file.get(key) not in (None, "", 0)
        }
        return media_info


local_movie_library_service = LocalMovieLibraryService(actor_library_service=local_actor_library_service)
