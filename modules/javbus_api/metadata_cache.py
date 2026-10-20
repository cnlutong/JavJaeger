"""Shared, disposable movie details and retention policy in the mounted data directory."""
import asyncio
from collections import OrderedDict
import copy
import hashlib
import json
import math
import shutil
import time
from pathlib import Path

from modules.common.runtime import run_blocking_io


DEFAULT_SETTINGS = {"mode": "days", "days": 30, "mb": 5}
DETAIL_FIELDS = ("id", "title", "img", "imageSize", "date", "videoLength", "director", "producer",
                 "publisher", "series", "genres", "stars", "samples", "similarMovies", "gid", "uc")


def valid_settings(value):
    return isinstance(value, dict) and value.get("mode") in ("days", "size") and all(
        type(value.get(key)) is int and 0 < value[key] <= 2 ** 53 - 1 for key in ("days", "mb"))


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


class MovieMetadataCache:
    # ponytail: one app process owns these files; use SQLite if multiple writers are needed.
    def __init__(self, file_path="data/movie_metadata_cache.json"):
        self.file_path = Path(file_path)
        self._directory = self.file_path.with_name(self.file_path.name + ".entries")
        self._staging = self._directory.with_name(self._directory.name + ".staging")
        self._lock = asyncio.Lock()
        self._loaded = False
        self._legacy = True
        self._settings = dict(DEFAULT_SETTINGS)
        self._entries = OrderedDict()
        self._entry_sizes = {}
        self._size_bytes = self._settings_bytes = self._next_order = 0
        self._next_expiry = math.inf

    def _entry_path(self, movie_id, directory=None):
        return (directory or self._directory) / (hashlib.sha256(movie_id.encode("utf-8")).hexdigest() + ".json")

    @staticmethod
    def _discard_directory(path):
        if path.is_symlink():
            path.unlink()
        elif path.exists():
            shutil.rmtree(path)

    def _record(self, value, key, order):
        if not isinstance(value, dict):
            return None
        stamp, data = value.get("saved_at"), value.get("data")
        if (type(stamp) not in (int, float) or stamp < 0 or stamp > time.time() or not math.isfinite(stamp)
                or not isinstance(data, dict) or str(data.get("id", "")).strip().upper() != key
                or type(order) is not int or order < 0):
            return None
        return {"saved_at": stamp, "order": order,
                "data": {field: data[field] for field in DETAIL_FIELDS if field in data}}

    def _load(self):
        if self._loaded:
            return
        try:
            content = self.file_path.read_bytes()
        except FileNotFoundError:
            content = b""
        try:
            payload = json.loads(content)
        except (json.JSONDecodeError, UnicodeError):
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        settings = payload.get("settings")
        settings = {key: settings[key] for key in DEFAULT_SETTINGS} if valid_settings(settings) else dict(DEFAULT_SETTINGS)
        entries, sizes = {}, {}
        legacy = payload.get("version") != 2
        self._discard_directory(self._staging)
        temporary = self.file_path.with_name(self.file_path.name + ".tmp")
        if temporary.is_symlink() or temporary.exists():
            temporary.unlink()
        if legacy:
            values = payload.get("entries", {})
            if isinstance(payload.get("entries"), dict):
                self._discard_directory(self._directory)
            for key, value in (values.items() if isinstance(values, dict) else []):
                record = self._record(value, key, len(entries))
                if record is not None:
                    entries[key] = record
        else:
            if self._directory.is_symlink():
                raise OSError("Metadata cache directory must not be a symbolic link")
            for path in self._directory.glob("*.json.tmp"):
                key = path.name[:-len(".json.tmp")]
                if len(key) == 64 and all(char in "0123456789abcdef" for char in key) and not path.is_dir():
                    path.unlink(missing_ok=True)
            for path in self._directory.glob("*.json"):
                if path.is_symlink() or len(path.stem) != 64 or any(char not in "0123456789abcdef" for char in path.stem):
                    continue
                try:
                    raw = path.read_bytes()
                    value = json.loads(raw)
                except FileNotFoundError:
                    continue
                except (json.JSONDecodeError, UnicodeError):
                    value = None
                data = value.get("data") if isinstance(value, dict) else None
                key = str(data.get("id", "")).strip().upper() if isinstance(data, dict) else ""
                record = self._record(value, key, value.get("order")) if isinstance(value, dict) else None
                if record is None or path != self._entry_path(key):
                    path.unlink(missing_ok=True)
                    continue
                entries[key], sizes[key] = record, len(raw)
        self._settings, self._legacy = settings, legacy
        self._entries = OrderedDict(sorted(entries.items(), key=lambda item: item[1]["order"]))
        self._entry_sizes = sizes
        self._settings_bytes = len(content)
        self._size_bytes = len(content) + sum(sizes.values())
        self._next_order = max((entry["order"] for entry in entries.values()), default=-1) + 1
        if settings["mode"] == "days":
            self._next_expiry = min((entry["saved_at"] + settings["days"] * 86400 for entry in entries.values()), default=math.inf)
        self._loaded = True

    def _atomic_write(self, path, content):
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + ".tmp")
        try:
            temporary.write_bytes(content)
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)

    def _ensure_storage(self):
        if not self._legacy:
            return
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        staging = self._staging
        staging.mkdir()
        sizes = {}
        try:
            for key, entry in self._entries.items():
                content = encode(entry)
                self._entry_path(key, staging).write_bytes(content)
                sizes[key] = len(content)
            if self._directory.is_symlink():
                raise OSError("Metadata cache directory must not be a symbolic link")
            if self._directory.exists():
                shutil.rmtree(self._directory)
            staging.replace(self._directory)
            content = encode({"version": 2, "settings": self._settings})
            self._atomic_write(self.file_path, content)
            self._entry_sizes = sizes
            self._settings_bytes = len(content)
            self._size_bytes = len(content) + sum(sizes.values())
            self._legacy = False
        finally:
            self._discard_directory(staging)

    def _remove(self, key):
        self._entry_path(key).unlink(missing_ok=True)
        del self._entries[key]
        self._size_bytes -= self._entry_sizes.pop(key)

    def _prune(self, force=False):
        if self._settings["mode"] == "days":
            if not force and time.time() < self._next_expiry:
                return
            cutoff = time.time() - self._settings["days"] * 86400
            expired, next_expiry = [], math.inf
            for key, entry in self._entries.items():
                if entry["saved_at"] <= cutoff:
                    expired.append(key)
                else:
                    next_expiry = min(next_expiry, entry["saved_at"] + self._settings["days"] * 86400)
            self._next_expiry = 0
            for key in expired:
                self._remove(key)
            self._next_expiry = next_expiry
        else:
            self._next_expiry = math.inf
            while self._size_bytes > self._settings["mb"] * 1024 ** 2 and self._entries:
                self._remove(next(iter(self._entries)))

    def _maintain(self):
        due = (time.time() >= self._next_expiry if self._settings["mode"] == "days"
               else self._size_bytes > self._settings["mb"] * 1024 ** 2)
        if due:
            self._ensure_storage()
            self._prune()

    def _save(self):
        content = encode({"version": 2, "settings": self._settings})
        self._atomic_write(self.file_path, content)
        self._size_bytes += len(content) - self._settings_bytes
        self._settings_bytes = len(content)

    def _get(self, movie_id):
        self._load()
        self._maintain()
        entry = self._entries.get(str(movie_id).strip().upper())
        return copy.deepcopy(entry["data"]) if entry else None

    async def get(self, movie_id):
        async with self._lock:
            return await run_blocking_io(self._get, movie_id)

    def _put(self, data):
        self._load()
        self._ensure_storage()
        key = data["id"]
        entry = {"saved_at": time.time(), "order": self._next_order, "data": data}
        content = encode(entry)
        self._atomic_write(self._entry_path(key), content)
        self._entries.pop(key, None)
        self._entries[key] = entry
        self._size_bytes += len(content) - self._entry_sizes.get(key, 0)
        self._entry_sizes[key] = len(content)
        self._next_order += 1
        self._maintain()
        if self._settings["mode"] == "days":
            self._next_expiry = min(self._next_expiry, entry["saved_at"] + self._settings["days"] * 86400)

    async def put(self, details):
        if not isinstance(details, dict) or not details.get("id") or not details.get("title"):
            return
        data = copy.deepcopy({key: details[key] for key in DETAIL_FIELDS if key in details})
        data["id"] = str(data["id"]).strip().upper()
        async with self._lock:
            await run_blocking_io(self._put, data)

    def _status(self):
        self._load()
        self._maintain()
        return {"settings": dict(self._settings), "count": len(self._entries), "size_bytes": self._size_bytes}

    async def status(self):
        async with self._lock:
            return await run_blocking_io(self._status)

    def _configure(self, values):
        self._load()
        self._ensure_storage()
        previous_settings, previous_expiry = self._settings, self._next_expiry
        self._settings = {key: values[key] for key in DEFAULT_SETTINGS}
        try:
            self._save()
        except OSError:
            self._settings, self._next_expiry = previous_settings, previous_expiry
            raise
        # The policy is committed; deletion failures retain complete files and retry on maintenance.
        self._prune(True)
        return self._status()

    async def configure(self, values):
        if not valid_settings(values):
            raise ValueError("请选择缓存清理方式，缓存天数和空间上限必须是正整数")
        async with self._lock:
            return await run_blocking_io(self._configure, values)
