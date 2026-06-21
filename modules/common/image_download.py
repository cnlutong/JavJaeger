import asyncio
import base64
import logging
from pathlib import Path
from typing import Any

import httpx

from modules.common.runtime import get_javbus_config


logger = logging.getLogger(__name__)

IMAGE_DOWNLOAD_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.javbus.com/",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
}
DEFAULT_IMAGE_DOWNLOAD_ATTEMPTS = 3
DEFAULT_IMAGE_DOWNLOAD_BACKOFF_SECONDS = 0.25


def image_download_headers(javbus_config: dict[str, Any]) -> dict[str, str]:
    headers = dict(IMAGE_DOWNLOAD_HEADERS)
    base_url = str(javbus_config.get("base_url") or "").strip()
    if base_url:
        headers["Referer"] = f"{base_url.rstrip('/')}/"
    return headers


async def download_image(url: str, target: Path, overwrite: bool) -> str | None:
    if not url:
        return None
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and not overwrite:
        return target.name
    if url.startswith("data:"):
        _, _, payload = url.partition(",")
        target.write_bytes(base64.b64decode(payload))
        return target.name

    javbus_config = get_javbus_config()
    headers = image_download_headers(javbus_config)
    client_kwargs: dict[str, Any] = {"timeout": 20.0, "follow_redirects": True}
    proxy = javbus_config.get("proxy")
    if proxy:
        client_kwargs["proxy"] = proxy

    retry_attempts_value = javbus_config.get("image_retry_attempts")
    try:
        retry_attempts = int(
            DEFAULT_IMAGE_DOWNLOAD_ATTEMPTS if retry_attempts_value in (None, "") else retry_attempts_value
        )
    except (TypeError, ValueError):
        retry_attempts = DEFAULT_IMAGE_DOWNLOAD_ATTEMPTS
    retry_attempts = max(1, min(retry_attempts, 10))

    retry_backoff_value = javbus_config.get("image_retry_backoff_seconds")
    try:
        retry_backoff = float(
            DEFAULT_IMAGE_DOWNLOAD_BACKOFF_SECONDS if retry_backoff_value in (None, "") else retry_backoff_value
        )
    except (TypeError, ValueError):
        retry_backoff = DEFAULT_IMAGE_DOWNLOAD_BACKOFF_SECONDS
    retry_backoff = max(0.0, min(retry_backoff, 10.0))

    last_exc: Exception | None = None
    for attempt in range(1, retry_attempts + 1):
        try:
            async with httpx.AsyncClient(**client_kwargs) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                target.write_bytes(response.content)
            return target.name
        except Exception as exc:
            last_exc = exc
            if attempt < retry_attempts and retry_backoff > 0:
                await asyncio.sleep(retry_backoff * attempt)
    if last_exc:
        raise last_exc
    return target.name


async def download_image_or_warn(url: str, target: Path, overwrite: bool) -> str | None:
    try:
        return await download_image(url, target, overwrite)
    except Exception as exc:
        logger.warning("Image download failed for %s: %r", url, exc)
        return None
