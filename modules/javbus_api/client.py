import asyncio
import hashlib
import logging
from collections import OrderedDict
from typing import Any

import httpx


logger = logging.getLogger(__name__)

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/91.0.4472.114 Safari/537.36"
)


class JavBusClient:
    def __init__(
        self,
        base_url: str = "https://www.javbus.com",
        timeout_seconds: float = 8.0,
        proxy: str | None = None,
        request_interval: float = 0.5,
        cache_expire_seconds: int = 3600,
        cache_max_size: int = 1000,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.proxy = proxy or None
        self.request_interval = request_interval
        self.cache_expire_seconds = cache_expire_seconds
        self.cache_max_size = cache_max_size
        self._client: httpx.AsyncClient | None = None
        self._client_loop: asyncio.AbstractEventLoop | None = None
        self._client_lock = asyncio.Lock()
        self._request_lock = asyncio.Lock()
        self._cache_lock = asyncio.Lock()
        self._last_request_time = 0.0
        self._memory_cache: OrderedDict[str, tuple[str, float]] = OrderedDict()

    @property
    def cache_size(self) -> int:
        return len(self._memory_cache)

    async def startup(self) -> None:
        await self._get_http_client()

    async def shutdown(self) -> None:
        async with self._client_lock:
            if self._client and not self._client.is_closed:
                try:
                    await self._client.aclose()
                except RuntimeError:
                    logger.debug("JavBus HTTP client loop was already closed")
            self._client = None
            self._client_loop = None

    def url(self, path: str) -> str:
        if path.startswith("http://") or path.startswith("https://"):
            return path
        if not path.startswith("/"):
            path = f"/{path}"
        return f"{self.base_url}{path}"

    async def get_text(
        self,
        path_or_url: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        use_cache: bool = True,
    ) -> str:
        url = self.url(path_or_url)
        cache_key = self._cache_key(url, params, headers)
        if use_cache:
            cached = await self._get_from_cache(cache_key)
            if cached is not None:
                logger.info("JavBus cache hit: %s", url)
                return cached

        await self._wait_for_slot()
        client = await self._get_http_client()
        response = await client.get(url, params=params, headers=headers)
        logger.info("JavBus request: %s status=%s", response.url, response.status_code)
        response.raise_for_status()
        text = response.text
        if use_cache:
            await self._set_cache(cache_key, text)
        return text

    async def _get_http_client(self) -> httpx.AsyncClient:
        async with self._client_lock:
            current_loop = asyncio.get_running_loop()
            if self._client is not None and self._client_loop is not current_loop:
                if not self._client.is_closed:
                    try:
                        await self._client.aclose()
                    except RuntimeError:
                        logger.debug("Discarding JavBus HTTP client from a closed event loop")
                self._client = None
                self._client_loop = None

            if self._client is None or self._client.is_closed:
                kwargs: dict[str, Any] = {
                    "timeout": self.timeout_seconds,
                    "follow_redirects": True,
                    "headers": {
                        "User-Agent": DEFAULT_USER_AGENT,
                        "accept-language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
                    },
                }
                if self.proxy:
                    kwargs["proxy"] = self.proxy
                self._client = httpx.AsyncClient(**kwargs)
                self._client_loop = current_loop
            return self._client

    async def _wait_for_slot(self) -> None:
        async with self._request_lock:
            now = asyncio.get_running_loop().time()
            elapsed = now - self._last_request_time
            if elapsed < self.request_interval:
                await asyncio.sleep(self.request_interval - elapsed)
            self._last_request_time = asyncio.get_running_loop().time()

    def _cache_key(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> str:
        cache_string = url
        if params:
            cache_string += str(sorted(params.items()))
        if headers:
            cache_string += str(sorted(headers.items()))
        return hashlib.md5(cache_string.encode()).hexdigest()

    async def _get_from_cache(self, key: str) -> str | None:
        async with self._cache_lock:
            if key not in self._memory_cache:
                return None
            data, timestamp = self._memory_cache.pop(key)
            now = asyncio.get_running_loop().time()
            if now - timestamp >= self.cache_expire_seconds:
                return None
            self._memory_cache[key] = (data, timestamp)
            return data

    async def _set_cache(self, key: str, data: str) -> None:
        async with self._cache_lock:
            if key in self._memory_cache:
                self._memory_cache.pop(key)
            elif len(self._memory_cache) >= self.cache_max_size:
                self._memory_cache.popitem(last=False)
            self._memory_cache[key] = (data, asyncio.get_running_loop().time())
