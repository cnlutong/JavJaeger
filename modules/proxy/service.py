"""Trusted image retrieval with a shared, independently bounded disk cache."""
import asyncio
import hashlib
import json
import logging
import os
import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urldefrag

import httpx

from modules.common.image_download import IMAGE_DOWNLOAD_HEADERS


logger = logging.getLogger(__name__)
ALLOWED_IMAGE_HOSTS = {"www.javbus.com", "pics.dmm.co.jp"}
MAX_IMAGE_BYTES = 32 * 1024 ** 2


def _is_allowed_image_host(url):
    try:
        parsed = urlsplit(url)
        return (parsed.scheme in {"http", "https"} and (parsed.hostname or "").lower() in ALLOWED_IMAGE_HOSTS
                and parsed.username is None and parsed.password is None
                and parsed.port in (None, 443 if parsed.scheme == "https" else 80))
    except ValueError:
        return False


def image_type(content, declared=""):
    if content.startswith(b"\x89PNG\r\n\x1a\n"): return "image/png"
    if content.startswith(b"\xff\xd8\xff"): return "image/jpeg"
    if content.startswith((b"GIF87a", b"GIF89a")): return "image/gif"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP": return "image/webp"
    if content[4:8] == b"ftyp" and any(brand in content[8:32] for brand in (b"avif", b"avis")): return "image/avif"
    if content.startswith(b"BM"): return "image/bmp"
    if declared == "image/svg+xml" and b"<svg" in content.lstrip()[:512]: return declared
    return None


class ImageProxyError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code


class ImageProxyService:
    # ponytail: one app process owns these files; use SQLite indexing if multiple writers are needed.
    def __init__(self, directory="data/image_cache"):
        self.directory = Path(directory)
        self._mb = 256
        self._entries = {}
        self._loaded = False
        self._lock = asyncio.Lock()
        self._pending = {}

    def _load(self):
        if self._loaded: return
        try:
            settings = json.loads((self.directory / "settings.json").read_text())
            if isinstance(settings, dict) and type(settings.get("mb")) is int and 0 < settings["mb"] <= 2 ** 53 - 1:
                self._mb = settings["mb"]
        except (FileNotFoundError, ValueError, UnicodeError): pass
        self._entries = {}
        for path in self.directory.glob("*.tmp"):
            if path.name == "settings.tmp" or re.fullmatch(r"[a-f0-9]{64}", path.stem): path.unlink(missing_ok=True)
        for path in self.directory.glob("*.image"):
            if not re.fullmatch(r"[a-f0-9]{64}", path.stem) or path.is_symlink(): continue
            stat = path.stat()
            self._entries[path.stem] = (stat.st_size, stat.st_mtime_ns)
        self._loaded = True

    def _prune(self, extra=0):
        used = sum(entry[0] for entry in self._entries.values())
        if used + extra <= self._mb * 1024 ** 2: return
        for key, (length, _) in sorted(self._entries.items(), key=lambda item: item[1][1]):
            if used + extra <= self._mb * 1024 ** 2: break
            (self.directory / (key + ".image")).unlink(missing_ok=True)
            del self._entries[key]
            used -= length

    def _read(self, key):
        self._load(); self._prune()
        if key not in self._entries: return None
        path = self.directory / (key + ".image")
        try:
            if self._entries[key][0] > MAX_IMAGE_BYTES + 80: raise ValueError()
            media, content = path.read_bytes().split(b"\n", 1)
            media = media.decode("ascii")
            if image_type(content, media) != media: raise ValueError()
        except (FileNotFoundError, ValueError, UnicodeError):
            path.unlink(missing_ok=True); self._entries.pop(key, None)
            return None
        stamp = time.time_ns(); os.utime(path, ns=(stamp, stamp))
        self._entries[key] = (self._entries[key][0], stamp)
        return content, media

    async def _cached(self, key):
        async with self._lock:
            try: return await asyncio.to_thread(self._read, key)
            except OSError:
                logger.warning("Image cache could not be read")
                return None

    def _write(self, key, content, media):
        self._load()
        payload = media.encode("ascii") + b"\n" + content
        if len(payload) > self._mb * 1024 ** 2: return
        self.directory.mkdir(parents=True, exist_ok=True)
        self._prune(extra=len(payload))
        temporary = self.directory / (key + ".tmp")
        target = self.directory / (key + ".image")
        try:
            temporary.write_bytes(payload); temporary.replace(target)
            self._entries[key] = (target.stat().st_size, target.stat().st_mtime_ns)
        finally: temporary.unlink(missing_ok=True)

    async def _fetch(self, url, key):
        cached = await self._cached(key)
        if cached is not None: return cached
        try:
            async with httpx.AsyncClient(follow_redirects=False, timeout=15) as client:
                for _ in range(6):
                    if not _is_allowed_image_host(url): raise ImageProxyError(400, "Unsupported image host")
                    async with client.stream("GET", url, headers=IMAGE_DOWNLOAD_HEADERS) as response:
                        if response.is_redirect:
                            url = urljoin(url, response.headers.get("location", "")); continue
                        if response.status_code != 200: raise ImageProxyError(response.status_code, "Failed to fetch image")
                        content = bytearray()
                        async for chunk in response.aiter_bytes():
                            if len(content) + len(chunk) > MAX_IMAGE_BYTES: raise ImageProxyError(413, "Image exceeds the response size limit")
                            content.extend(chunk)
                        content = bytes(content)
                        media = image_type(content, response.headers.get("content-type", "").split(";", 1)[0].strip().lower())
                        if not media: raise ImageProxyError(502, "Source did not return an image")
                        break
                else: raise ImageProxyError(502, "Too many image redirects")
        except httpx.HTTPError as exc:
            raise ImageProxyError(502, "Failed to fetch image") from exc
        async with self._lock:
            try: await asyncio.to_thread(self._write, key, content, media)
            except OSError: logger.warning("Image cache could not be saved")
        return content, media

    async def get_image(self, url):
        if not _is_allowed_image_host(url): raise ImageProxyError(400, "Unsupported image host")
        url = urldefrag(url)[0]
        key = hashlib.sha256(url.encode()).hexdigest()
        cached = await self._cached(key)
        if cached is not None: return cached
        if key not in self._pending:
            task = asyncio.create_task(self._fetch(url, key)); self._pending[key] = task
            def finished(task):
                self._pending.pop(key, None)
                if not task.cancelled(): task.exception()
            task.add_done_callback(finished)
        return await asyncio.shield(self._pending[key])

    def _status(self):
        self._load(); self._prune()
        return {"settings": {"mb": self._mb}, "count": len(self._entries), "size_bytes": sum(entry[0] for entry in self._entries.values())}

    async def status(self):
        async with self._lock: return await asyncio.to_thread(self._status)

    def _configure(self, mb):
        self._load(); self.directory.mkdir(parents=True, exist_ok=True)
        temporary = self.directory / "settings.tmp"
        try:
            temporary.write_text(json.dumps({"mb": mb}), encoding="utf-8")
            temporary.replace(self.directory / "settings.json")
        finally: temporary.unlink(missing_ok=True)
        self._mb = mb; self._prune()
        return self._status()

    async def configure(self, values):
        if not isinstance(values, dict) or type(values.get("mb")) is not int or not 0 < values["mb"] <= 2 ** 53 - 1:
            raise ValueError("图片缓存空间上限必须是正整数（MB）")
        async with self._lock: return await asyncio.to_thread(self._configure, values["mb"])


image_proxy_service = ImageProxyService()
