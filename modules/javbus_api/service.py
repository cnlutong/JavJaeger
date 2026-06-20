import logging
import os
from typing import Any

from modules.common.runtime import get_javbus_config

from .client import JavBusClient
from .parser import (
    convert_magnets_html,
    parse_filter_info,
    parse_movie_detail,
    parse_movies_page,
    parse_star_info,
    sort_magnets,
)


logger = logging.getLogger(__name__)


class JavBusApiService:
    def __init__(self) -> None:
        self.client = self._build_client(get_javbus_config())

    def _build_client(self, cfg: dict[str, Any]) -> JavBusClient:
        proxy = cfg.get("proxy") or os.getenv("HTTP_PROXY") or os.getenv("HTTPS_PROXY") or None
        return JavBusClient(
            base_url=cfg.get("base_url") or "https://www.javbus.com",
            timeout_seconds=_float_config(cfg, "timeout_seconds", 8),
            proxy=proxy,
            request_interval=_float_config(cfg, "request_interval_seconds", 0.5),
            cache_expire_seconds=_int_config(cfg, "cache_expire_seconds", 3600),
            cache_max_size=_int_config(cfg, "cache_max_size", 1000),
        )

    @property
    def base_url(self) -> str:
        return self.client.base_url

    @property
    def cache_size(self) -> int:
        return self.client.cache_size

    async def startup(self) -> None:
        await self.client.startup()

    async def shutdown(self) -> None:
        await self.client.shutdown()

    async def reconfigure(self, cfg: dict[str, Any]) -> None:
        old_client = self.client
        self.client = self._build_client(cfg)
        await old_client.shutdown()
        await self.client.startup()

    async def get_movies_by_page(self, query: dict[str, Any]) -> dict[str, Any]:
        page = str(query.get("page") or "1")
        magnet = query.get("magnet") or "exist"
        movie_type = query.get("type")
        filter_type = query.get("filterType")
        filter_value = query.get("filterValue")

        prefix = "" if not movie_type or movie_type == "normal" else f"/{movie_type}"
        if filter_type:
            prefix = f"{prefix}/{filter_type}"

        if page == "1":
            path = f"{prefix}/{filter_value}" if filter_type and filter_value else (prefix or "/")
        else:
            path = f"{prefix}/{filter_value}/{page}" if filter_type and filter_value else f"{prefix}/page/{page}"

        html = await self.client.get_text(path, headers={"Cookie": f"existmag={'mag' if magnet == 'exist' else 'all'}"})
        payload = parse_movies_page(html, self.base_url)
        if filter_type and filter_value:
            payload["filter"] = parse_filter_info(html, str(filter_type), str(filter_value))
        return payload

    async def get_movies_by_keyword_and_page(
        self,
        keyword: str,
        page: str = "1",
        magnet: str | None = None,
        movie_type: str | None = None,
    ) -> dict[str, Any]:
        prefix = "/search" if not movie_type or movie_type == "normal" else f"/{movie_type}/search"
        path = f"{prefix}/{keyword}/{page}&type=1"
        html = await self.client.get_text(path, headers={"Cookie": f"existmag={'mag' if magnet == 'exist' else 'all'}"})
        payload = parse_movies_page(html, self.base_url)
        payload["keyword"] = keyword
        return payload

    async def get_movie_detail(self, movie_id: str) -> dict[str, Any]:
        html = await self.client.get_text(f"/{movie_id}")
        return parse_movie_detail(html, self.base_url, movie_id)

    async def get_movie_magnets(
        self,
        movie_id: str,
        gid: str,
        uc: str,
        sort_by: str | None = None,
        sort_order: str | None = None,
    ) -> list[dict[str, Any]]:
        html = await self.client.get_text(
            "/ajax/uncledatoolsbyajax.php",
            params={"lang": "zh", "gid": gid, "uc": uc},
            headers={"referer": f"{self.base_url}/{movie_id}"},
        )
        return sort_magnets(convert_magnets_html(html), sort_by, sort_order)

    async def get_star_info(self, star_id: str, movie_type: str | None = None) -> dict[str, Any]:
        prefix = "" if not movie_type or movie_type == "normal" else f"/{movie_type}"
        html = await self.client.get_text(f"{prefix}/star/{star_id}")
        return parse_star_info(html, self.base_url, star_id)


def _float_config(config: dict[str, Any], key: str, default: float) -> float:
    value = config.get(key)
    if value is None or value == "":
        return default
    return float(value)


def _int_config(config: dict[str, Any], key: str, default: int) -> int:
    value = config.get(key)
    if value is None or value == "":
        return default
    return int(value)


javbus_api_service = JavBusApiService()
