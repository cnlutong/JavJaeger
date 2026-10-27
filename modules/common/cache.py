"""Bounded, disposable JSON records; callers persist public projections only."""
import asyncio
import hashlib
import json
import logging
import math
import os
import re
import time
from pathlib import Path
from uuid import uuid4

from .runtime import run_blocking_io


logger = logging.getLogger(__name__)


class JsonTTLCache:
    """One application process owns the directory; no credentials or sessions belong here."""
    def __init__(self, directory, max_entries=512, max_bytes=32 * 1024 ** 2, clock=time.time):
        self.directory = Path(directory)
        self.max_entries, self.max_bytes, self.clock = max_entries, max_bytes, clock
        self._lock = asyncio.Lock()
        self._ttls = {}

    def _path(self, key):
        return self.directory / (hashlib.sha256(key.encode()).hexdigest() + '.json')

    def _read_path(self, path, key=None, touch=False):
        if self.directory.is_symlink() or path.is_symlink() or not path.is_file():
            return None
        try:
            if path.stat().st_size > self.max_bytes:
                raise ValueError()
            record = json.loads(path.read_bytes())
            now = self.clock()
            if (not isinstance(record, dict) or not isinstance(record.get('key'), str)
                    or self._path(record['key']) != path or (key is not None and record['key'] != key) or 'value' not in record
                    or any(type(record.get(field)) not in (int, float) or not math.isfinite(record[field]) for field in ('saved_at', 'expires_at'))
                    or record['expires_at'] <= record['saved_at']):
                raise ValueError()
            ttl = next((seconds for prefix, seconds in self._ttls.items() if record['key'].startswith(prefix)), None)
            if ttl is not None:
                record['expires_at'] = record['saved_at'] + ttl
            if not 0 <= record['saved_at'] <= now < record['expires_at']:
                raise ValueError()
        except (ValueError, UnicodeError):
            path.unlink(missing_ok=True)
            return None
        if touch:
            try:
                os.utime(path, None)
            except OSError:
                pass  # Readable data remains useful when cache maintenance is unavailable.
        return {field: record[field] for field in ('value', 'saved_at', 'expires_at')}

    def _read(self, key):
        return self._read_path(self._path(key), key, touch=True)

    def _atomic_write(self, path, content):
        if self.directory.is_symlink():
            raise OSError('Cache directory must not be a symbolic link')
        self.directory.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + '.' + uuid4().hex + '.tmp')
        try:
            with temporary.open('xb') as stream:
                stream.write(content)
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)

    def _files(self):
        if self.directory.is_symlink():
            raise OSError('Cache directory must not be a symbolic link')
        return [p for p in self.directory.glob('*.json') if re.fullmatch(r'[a-f0-9]{64}\.json', p.name) and p.is_file() and not p.is_symlink()]

    def _maintain(self, clear=False):
        files = []
        for path in self._files():
            if clear:
                path.unlink(missing_ok=True)
            elif self._read_path(path) is not None:
                files.append((path, path.stat()))
        used, count = sum(stat.st_size for _, stat in files), len(files)
        for old, stat in sorted(files, key=lambda item: item[1].st_mtime_ns):
            if used <= self.max_bytes and count <= self.max_entries:
                break
            old.unlink(missing_ok=True)
            used -= stat.st_size
            count -= 1
        return {'count': count, 'size_bytes': used}

    def _write(self, key, value, ttl):
        now = self.clock()
        content = json.dumps({'key': key, 'saved_at': now, 'expires_at': now + ttl, 'value': value},
                             ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode()
        if len(content) > self.max_bytes or self.directory.is_symlink():
            return False
        path = self._path(key)
        self._atomic_write(path, content)
        self._maintain()
        return True

    async def get(self, key):
        async with self._lock:
            try:
                return await run_blocking_io(self._read, key)
            except OSError:
                logger.warning('Public cache could not be read')
                return None

    async def put(self, key, value, ttl):
        async with self._lock:
            try:
                return await run_blocking_io(self._write, key, value, ttl)
            except (OSError, ValueError, TypeError):
                logger.warning('Public cache could not be saved')
                return False

    def _load_options(self):
        try:
            if self.directory.is_symlink() or (self.directory / 'settings.json').is_symlink():
                raise OSError('Cache settings must not be a symbolic link')
            return json.loads((self.directory / 'settings.json').read_bytes())
        except (FileNotFoundError, ValueError, UnicodeError):
            return None

    async def load_options(self):
        async with self._lock:
            return await run_blocking_io(self._load_options)

    def _set_policy(self, max_bytes, ttls, options):
        if options is not None:
            self._atomic_write(self.directory / 'settings.json', json.dumps(options, separators=(',', ':')).encode())
        self.max_bytes, self._ttls = max_bytes, dict(ttls)

    async def set_policy(self, max_bytes, ttls, options=None):
        async with self._lock:
            await run_blocking_io(self._set_policy, max_bytes, ttls, options)

    async def status(self):
        async with self._lock:
            return await run_blocking_io(self._maintain)

    async def clear(self):
        async with self._lock:
            return await run_blocking_io(self._maintain, True)
