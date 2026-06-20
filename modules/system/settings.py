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
    "image_retry_attempts": (1, 10),
    "image_retry_backoff_seconds": (0.0, 10.0),
}


def build_settings_payload() -> dict[str, Any]:
    javbus_config = runtime.get_javbus_config()
    webdav_config = runtime.get_webdav_config()
    aria2_config = runtime.get_aria2_config()
    pikpak_config = runtime.get_pikpak_config()
    return {
        "javbus": {
            "base_url": javbus_config.get("base_url") or "",
            "timeout_seconds": javbus_config.get("timeout_seconds"),
            "proxy": javbus_config.get("proxy") or "",
            "request_interval_seconds": javbus_config.get("request_interval_seconds"),
            "cache_expire_seconds": javbus_config.get("cache_expire_seconds"),
            "cache_max_size": javbus_config.get("cache_max_size"),
            "image_retry_attempts": javbus_config.get("image_retry_attempts"),
            "image_retry_backoff_seconds": javbus_config.get("image_retry_backoff_seconds"),
        },
        "webdav": {
            "enabled": bool(webdav_config.get("enabled")),
            "url": webdav_config.get("url") or "",
            "username": webdav_config.get("username") or "",
            "has_password": bool(webdav_config.get("password")),
            "auto_connect": bool(webdav_config.get("auto_connect")),
        },
        "aria2": {
            "enabled": bool(aria2_config.get("enabled")),
            "url": aria2_config.get("url") or "",
            "has_secret": bool(aria2_config.get("secret")),
            "auto_connect": bool(aria2_config.get("auto_connect")),
        },
        "pikpak": {
            "enabled": bool(pikpak_config.get("enabled")),
            "username": pikpak_config.get("username") or "",
            "has_password": bool(pikpak_config.get("password")),
            "auto_login": bool(pikpak_config.get("auto_login")),
        },
        "security": {
            "session_secret_configured": bool(os.getenv("APP_SESSION_SECRET") or runtime.config.get("session_secret")),
            "using_default_session_secret": runtime.SESSION_SECRET == "javjaeger-dev-session-secret",
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
        if key in {"cache_expire_seconds", "cache_max_size", "image_retry_attempts"}:
            normalized[key] = int(number)
        else:
            normalized[key] = number

    return normalized


def _normalize_bool(values: dict[str, Any], key: str) -> bool | None:
    if key not in values:
        return None
    value = values[key]
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    raise HTTPException(status_code=400, detail=f"{key}_must_be_boolean")


def _normalize_url(values: dict[str, Any], key: str, supported_schemes: tuple[str, ...]) -> str | None:
    if key not in values:
        return None
    url = str(values[key] or "").strip()
    if url and not url.startswith(supported_schemes):
        raise HTTPException(status_code=400, detail=f"{key}_must_be_supported_url")
    return url


def _normalize_string(values: dict[str, Any], key: str) -> str | None:
    if key not in values:
        return None
    return str(values[key] or "").strip()


def validate_webdav_settings(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="webdav_settings_required")

    normalized: dict[str, Any] = {}
    for key in ("enabled", "auto_connect"):
        value = _normalize_bool(payload, key)
        if value is not None:
            normalized[key] = value

    url = _normalize_url(payload, "url", ("http://", "https://"))
    if url is not None:
        normalized["url"] = url

    for key in ("username", "password"):
        value = _normalize_string(payload, key)
        if value is not None:
            normalized[key] = value

    return normalized


def validate_aria2_settings(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="aria2_settings_required")

    normalized: dict[str, Any] = {}
    for key in ("enabled", "auto_connect"):
        value = _normalize_bool(payload, key)
        if value is not None:
            normalized[key] = value

    url = _normalize_url(payload, "url", ("http://", "https://"))
    if url is not None:
        normalized["url"] = url

    secret = _normalize_string(payload, "secret")
    if secret is not None:
        normalized["secret"] = secret

    return normalized


def validate_pikpak_settings(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="pikpak_settings_required")

    normalized: dict[str, Any] = {}
    for key in ("enabled", "auto_login"):
        value = _normalize_bool(payload, key)
        if value is not None:
            normalized[key] = value

    for key in ("username", "password"):
        value = _normalize_string(payload, key)
        if value is not None:
            normalized[key] = value

    return normalized


async def update_javbus_settings(payload: dict[str, Any]) -> dict[str, Any]:
    updates = validate_javbus_settings(payload)
    if not updates:
        raise HTTPException(status_code=400, detail="no_supported_settings")

    runtime.update_config_section("javbus", updates)
    await javbus_api_service.reconfigure(runtime.get_javbus_config())
    return build_settings_payload()


async def update_system_settings(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="settings_payload_required")

    validators = {
        "javbus": validate_javbus_settings,
        "webdav": validate_webdav_settings,
        "aria2": validate_aria2_settings,
        "pikpak": validate_pikpak_settings,
    }
    updates_by_section: dict[str, dict[str, Any]] = {}
    for section, validator in validators.items():
        if section not in payload:
            continue
        updates = validator(payload[section])
        if updates:
            updates_by_section[section] = updates

    if not updates_by_section:
        raise HTTPException(status_code=400, detail="no_supported_settings")

    for section, updates in updates_by_section.items():
        runtime.update_config_section(section, updates)

    if "javbus" in updates_by_section:
        await javbus_api_service.reconfigure(runtime.get_javbus_config())

    return build_settings_payload()
