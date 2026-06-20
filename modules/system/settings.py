import os
from typing import Any

from fastapi import HTTPException

from modules.common import runtime
from modules.javbus_api import javbus_api_service


JAVBUS_SETTING_LIMITS = {
    "timeout_seconds": (1.0, 60.0),
    "request_interval_seconds": (0.0, 10.0),
    "cache_expire_seconds": (0, 86400),
    "cache_max_size": (1, 100000),
}


def build_settings_payload() -> dict[str, Any]:
    javbus_config = runtime.get_javbus_config()
    return {
        "javbus": {
            "base_url": javbus_config.get("base_url") or "",
            "timeout_seconds": javbus_config.get("timeout_seconds"),
            "proxy": javbus_config.get("proxy") or "",
            "request_interval_seconds": javbus_config.get("request_interval_seconds"),
            "cache_expire_seconds": javbus_config.get("cache_expire_seconds"),
            "cache_max_size": javbus_config.get("cache_max_size"),
        },
        "environment_overrides": {
            "javbus": {
                "base_url": bool(os.getenv("JAVBUS_BASE_URL")),
                "proxy": bool(os.getenv("JAVBUS_PROXY")),
                "request_interval_seconds": os.getenv("JAVBUS_REQUEST_INTERVAL_SECONDS") is not None,
            }
        },
    }


def validate_javbus_settings(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="settings_payload_required")

    values = payload.get("javbus", payload)
    if not isinstance(values, dict):
        raise HTTPException(status_code=400, detail="javbus_settings_required")

    normalized: dict[str, Any] = {}
    if "base_url" in values:
        base_url = str(values["base_url"] or "").strip().rstrip("/")
        if not base_url.startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="base_url_must_be_http_url")
        normalized["base_url"] = base_url

    if "proxy" in values:
        proxy = str(values["proxy"] or "").strip()
        if proxy and not proxy.startswith(("http://", "https://", "socks5://", "socks5h://")):
            raise HTTPException(status_code=400, detail="proxy_must_be_supported_url")
        normalized["proxy"] = proxy

    for key, (minimum, maximum) in JAVBUS_SETTING_LIMITS.items():
        if key not in values:
            continue
        try:
            number = float(values[key])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"{key}_must_be_number")
        if number < minimum or number > maximum:
            raise HTTPException(status_code=400, detail=f"{key}_out_of_range")
        if key in {"cache_expire_seconds", "cache_max_size"}:
            normalized[key] = int(number)
        else:
            normalized[key] = number

    return normalized


async def update_javbus_settings(payload: dict[str, Any]) -> dict[str, Any]:
    updates = validate_javbus_settings(payload)
    if not updates:
        raise HTTPException(status_code=400, detail="no_supported_settings")

    runtime.update_config_section("javbus", updates)
    await javbus_api_service.reconfigure(runtime.get_javbus_config())
    return build_settings_payload()
