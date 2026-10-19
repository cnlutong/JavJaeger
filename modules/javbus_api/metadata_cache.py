"""Shared, disposable movie details and retention policy in the mounted data directory."""
import asyncio
import copy
import json
import math
import time
from pathlib import Path


DEFAULT_SETTINGS = {"mode": "days", "days": 30, "mb": 5}
DETAIL_FIELDS = ("id", "title", "img", "imageSize", "date", "videoLength", "director", "producer",
                 "publisher", "series", "genres", "stars", "samples", "similarMovies", "gid", "uc")


def valid_settings(value):
    return isinstance(value, dict) and value.get("mode") in ("days", "size") and all(
        type(value.get(key)) is int and 0 < value[key] <= 2 ** 53 - 1 for key in ("days", "mb"))


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


class MovieMetadataCache:
    # ponytail: one app process owns this JSON file; use SQLite if multiple writers are needed.
    def __init__(self, file_path="data/movie_metadata_cache.json"):
        self.file_path = Path(file_path)
        self._lock = asyncio.Lock()
        self._loaded = False
        self._settings = dict(DEFAULT_SETTINGS)
        self._entries = {}
        self._next_expiry = 0

    def _load(self):
        if self._loaded:
            return
        try:
            payload = json.loads(self.file_path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError, UnicodeError):
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        settings = payload.get("settings")
        if valid_settings(settings):
            self._settings = {key: settings[key] for key in DEFAULT_SETTINGS}
        entries = payload.get("entries", {})
        for key, entry in (entries.items() if isinstance(entries, dict) else []):
            if not isinstance(entry, dict):
                continue
            stamp, data = entry.get("saved_at"), entry.get("data")
            if (type(stamp) not in (int, float) or stamp < 0 or stamp > time.time() or not math.isfinite(stamp)
                    or not isinstance(data, dict) or str(data.get("id", "")).strip().upper() != key):
                continue
            self._entries[key] = {"saved_at": stamp, "data": {field: data[field] for field in DETAIL_FIELDS if field in data}}
        self._loaded = True

    def _payload(self):
        return {"version": 1, "settings": self._settings, "entries": self._entries}

    def _prune(self, force=False):
        if not force and time.time() < self._next_expiry:
            return False
        before = len(self._entries)
        self._next_expiry = math.inf
        if self._settings["mode"] == "days":
            cutoff = time.time() - self._settings["days"] * 86400
            self._entries = {key: entry for key, entry in self._entries.items() if entry["saved_at"] > cutoff}
            self._next_expiry = min((entry["saved_at"] + self._settings["days"] * 86400 for entry in self._entries.values()), default=math.inf)
        else:
            total = len(encode(self._payload()))
            for key, entry in list(self._entries.items()):
                if total <= self._settings["mb"] * 1024 ** 2:
                    break
                total -= len(encode({key: entry})) - 2 + (1 if len(self._entries) > 1 else 0)
                del self._entries[key]
        return len(self._entries) != before

    def _save(self):
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.file_path.with_suffix(".tmp")
        try:
            temporary.write_bytes(encode(self._payload()))
            temporary.replace(self.file_path)
        finally:
            temporary.unlink(missing_ok=True)

    async def get(self, movie_id):
        async with self._lock:
            if not self._loaded:
                await asyncio.to_thread(self._load)
            if time.time() >= self._next_expiry and await asyncio.to_thread(self._prune):
                await asyncio.to_thread(self._save)
            entry = self._entries.get(str(movie_id).strip().upper())
            return copy.deepcopy(entry["data"]) if entry else None

    async def put(self, details):
        if not isinstance(details, dict) or not details.get("id") or not details.get("title"):
            return
        data = copy.deepcopy({key: details[key] for key in DETAIL_FIELDS if key in details})
        data["id"] = str(data["id"]).strip().upper()
        async with self._lock:
            await asyncio.to_thread(self._load)
            self._entries.pop(data["id"], None)
            self._entries[data["id"]] = {"saved_at": time.time(), "data": data}
            await asyncio.to_thread(self._prune, True)
            await asyncio.to_thread(self._save)

    async def status(self):
        async with self._lock:
            await asyncio.to_thread(self._load)
            if await asyncio.to_thread(self._prune):
                await asyncio.to_thread(self._save)
            return {"settings": dict(self._settings), "count": len(self._entries),
                    "size_bytes": await asyncio.to_thread(lambda: len(encode(self._payload())) if self.file_path.exists() else 0)}

    async def configure(self, values):
        if not valid_settings(values):
            raise ValueError("请选择缓存清理方式，缓存天数和空间上限必须是正整数")
        async with self._lock:
            await asyncio.to_thread(self._load)
            previous_settings, previous_entries, previous_expiry = self._settings, dict(self._entries), self._next_expiry
            self._settings = {key: values[key] for key in DEFAULT_SETTINGS}
            await asyncio.to_thread(self._prune, True)
            try:
                await asyncio.to_thread(self._save)
            except OSError:
                self._settings, self._entries = previous_settings, previous_entries
                self._next_expiry = previous_expiry
                raise
        return await self.status()
