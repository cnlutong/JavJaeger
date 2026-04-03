import asyncio
import copy
import datetime
import hashlib
import json
import logging
import os
import subprocess
from collections import OrderedDict
from typing import Any

import httpx
from fastapi.templating import Jinja2Templates


logger = logging.getLogger(__name__)


DEFAULT_CONFIG: dict[str, Any] = {
    "javbus_api": {
        "host": "10.0.0.20",
        "port": 3000,
        "base_url": "http://10.0.0.20:3000",
    },
    "webdav": {
        "enabled": False,
        "url": "",
        "username": "",
        "password": "",
        "auto_connect": False,
    },
    "aria2": {
        "enabled": False,
        "url": "http://127.0.0.1:6800/jsonrpc",
        "secret": "",
        "auto_connect": False,
    },
    "pikpak": {
        "enabled": False,
        "username": "",
        "password": "",
        "auto_login": False,
    },
}


def get_version_info() -> dict[str, str]:
    version_info = {
        "version": "v1.0.0",
        "build_date": datetime.datetime.now().strftime("%Y-%m-%d"),
    }

    try:
        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        try:
            git_tag = (
                subprocess.check_output(
                    ["git", "describe", "--tags", "--abbrev=0"],
                    stderr=subprocess.DEVNULL,
                    cwd=repo_root,
                )
                .decode("utf-8")
                .strip()
            )
            if git_tag:
                version_info["version"] = git_tag if git_tag.startswith("v") else f"v{git_tag}"
        except (subprocess.CalledProcessError, FileNotFoundError):
            try:
                git_hash = (
                    subprocess.check_output(
                        ["git", "rev-parse", "--short=7", "HEAD"],
                        stderr=subprocess.DEVNULL,
                        cwd=repo_root,
                    )
                    .decode("utf-8")
                    .strip()
                )
                if git_hash:
                    version_info["version"] = f"v1.0.0-{git_hash}"
            except (subprocess.CalledProcessError, FileNotFoundError):
                logger.warning("Git不可用，使用默认版本信息")

        try:
            git_date = (
                subprocess.check_output(
                    ["git", "log", "-1", "--format=%cd", "--date=short"],
                    stderr=subprocess.DEVNULL,
                    cwd=repo_root,
                )
                .decode("utf-8")
                .strip()
            )
            if git_date:
                version_info["build_date"] = git_date
        except (subprocess.CalledProcessError, FileNotFoundError):
            logger.warning("无法获取Git提交日期，使用当前日期")
    except Exception as exc:
        logger.warning("获取Git版本信息失败: %s", exc)

    return version_info


def merge_config(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = merge_config(merged[key], value)
        else:
            merged[key] = value
    return merged


def load_config() -> dict[str, Any]:
    try:
        with open("config.json", "r", encoding="utf-8") as file:
            loaded = json.load(file)
            return merge_config(DEFAULT_CONFIG, loaded)
    except Exception as exc:
        logger.error("加载配置文件失败: %s", exc)
        return copy.deepcopy(DEFAULT_CONFIG)


def get_webdav_config() -> dict[str, Any]:
    return copy.deepcopy(config.get("webdav", DEFAULT_CONFIG["webdav"]))


def get_aria2_config() -> dict[str, Any]:
    return copy.deepcopy(config.get("aria2", DEFAULT_CONFIG["aria2"]))


def get_pikpak_config() -> dict[str, Any]:
    return copy.deepcopy(config.get("pikpak", DEFAULT_CONFIG["pikpak"]))


def build_client_config() -> dict[str, Any]:
    webdav_config = get_webdav_config()
    aria2_config = get_aria2_config()
    pikpak_config = get_pikpak_config()
    webdav_enabled = bool(webdav_config.get("enabled"))
    aria2_enabled = bool(aria2_config.get("enabled"))
    pikpak_enabled = bool(pikpak_config.get("enabled"))
    return {
        "webdav": {
            "configured": bool(webdav_enabled and webdav_config.get("url")),
            "enabled": webdav_enabled,
            "url": webdav_config.get("url") or "",
            "username": webdav_config.get("username") or "",
            "auto_connect": bool(webdav_config.get("auto_connect")),
        },
        "aria2": {
            "configured": bool(aria2_enabled and aria2_config.get("url")),
            "enabled": aria2_enabled,
            "url": aria2_config.get("url") or "",
            "auto_connect": bool(aria2_config.get("auto_connect")),
            "has_secret": bool(aria2_config.get("secret")),
        },
        "pikpak": {
            "configured": bool(pikpak_enabled and pikpak_config.get("username") and pikpak_config.get("password")),
            "enabled": pikpak_enabled,
            "username": pikpak_config.get("username") or "",
            "auto_login": bool(pikpak_config.get("auto_login")),
        },
    }


def build_system_config_summary() -> dict[str, Any]:
    client_config = build_client_config()
    return {
        "javbus_api": {
            "base_url": config["javbus_api"]["base_url"],
            "host": config["javbus_api"]["host"],
            "port": config["javbus_api"]["port"],
        },
        "features": {
            "webdav_configured": client_config["webdav"]["configured"],
            "aria2_configured": client_config["aria2"]["configured"],
            "pikpak_configured": client_config["pikpak"]["configured"],
        },
    }


VERSION_INFO = get_version_info()
config = load_config()
JAVBUS_API_BASE_URL = os.getenv("JAVBUS_API_BASE_URL", config["javbus_api"]["base_url"])
SESSION_SECRET = os.getenv("APP_SESSION_SECRET", config.get("session_secret", "javjaeger-dev-session-secret"))
if SESSION_SECRET == "javjaeger-dev-session-secret":
    logger.warning("正在使用默认会话密钥，生产环境请设置 APP_SESSION_SECRET 或 config.session_secret")

templates = Jinja2Templates(directory="templates")


class CachedApiClient:
    def __init__(self) -> None:
        self._memory_cache: OrderedDict[str, tuple[Any, float]] = OrderedDict()
        self._client: httpx.AsyncClient | None = None
        self._client_lock = asyncio.Lock()
        self._cache_lock = asyncio.Lock()
        self._request_lock = asyncio.Lock()
        self._last_api_request_time = 0.0
        self.cache_expire_time = 3600
        self.cache_max_size = 1000
        self.api_request_interval = 1.0

    async def startup(self) -> None:
        await self._get_http_client()

    async def shutdown(self) -> None:
        async with self._client_lock:
            if self._client is not None and not self._client.is_closed:
                await self._client.aclose()
            self._client = None

    @property
    def cache_size(self) -> int:
        return len(self._memory_cache)

    def _get_cache_key(self, url: str, params: dict[str, Any] | None = None) -> str:
        cache_string = url
        if params:
            cache_string += str(sorted(params.items()))
        return hashlib.md5(cache_string.encode()).hexdigest()

    async def _get_http_client(self) -> httpx.AsyncClient:
        async with self._client_lock:
            if self._client is None or self._client.is_closed:
                self._client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
            return self._client

    async def _wait_for_api_slot(self) -> None:
        async with self._request_lock:
            now = asyncio.get_running_loop().time()
            elapsed = now - self._last_api_request_time
            if elapsed < self.api_request_interval:
                await asyncio.sleep(self.api_request_interval - elapsed)
            self._last_api_request_time = asyncio.get_running_loop().time()

    async def _get_from_cache(self, key: str) -> Any | None:
        async with self._cache_lock:
            if key not in self._memory_cache:
                return None

            data, timestamp = self._memory_cache.pop(key)
            if datetime.datetime.now().timestamp() - timestamp >= self.cache_expire_time:
                return None

            self._memory_cache[key] = (data, timestamp)
            return data

    async def _set_cache(self, key: str, data: Any) -> None:
        async with self._cache_lock:
            if key in self._memory_cache:
                self._memory_cache.pop(key)
            elif len(self._memory_cache) >= self.cache_max_size:
                self._memory_cache.popitem(last=False)
            self._memory_cache[key] = (data, datetime.datetime.now().timestamp())

    async def get_json(self, url: str, params: dict[str, Any] | None = None) -> Any | None:
        cache_key = self._get_cache_key(url, params)
        cached_data = await self._get_from_cache(cache_key)
        if cached_data is not None:
            logger.info("缓存命中: %s", url)
            return cached_data

        try:
            await self._wait_for_api_slot()

            full_url = url
            if params:
                query_string = "&".join([f"{key}={value}" for key, value in params.items()])
                full_url = f"{url}?{query_string}"

            client = await self._get_http_client()
            response = await client.get(url, params=params)
            logger.info("API请求: %s 状态: %s", full_url, response.status_code)

            if response.status_code != 200:
                logger.warning("API请求失败: %s 状态: %s 响应: %s", full_url, response.status_code, response.text[:200])
                return None

            data = response.json()
            await self._set_cache(cache_key, data)
            return data
        except Exception as exc:
            logger.error("API请求异常: %s 错误: %s", url, exc)
            return None


api_client = CachedApiClient()
