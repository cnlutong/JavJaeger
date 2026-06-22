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
SCRAPER_SETTING_LIMITS = {
    "request_delay": (0, 60000),
}
SCRAPER_LANGUAGES = {"en", "ja", "zh", "cn", "tw"}
PAN115_SETTING_LIMITS = {
    "batch_size": (1, 50),
    "batch_interval_seconds": (0.0, 300.0),
    "jitter_seconds": (0.0, 60.0),
}
MAGNET_HEALTH_SETTING_LIMITS = {
    "min_seeders": (0, 10000),
    "min_peers": (0, 10000),
    "min_availability": (0.0, 100.0),
    "min_score": (0.0, 100000.0),
    "probe_timeout_seconds": (3.0, 120.0),
}


def build_scrapers_settings_payload(scrapers_config: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "priority": [
            provider
            for provider in scrapers_config.get("priority", runtime.SCRAPER_PROVIDER_NAMES)
            if provider in runtime.SCRAPER_PROVIDER_NAMES
        ],
    }
    for provider in runtime.SCRAPER_PROVIDER_NAMES:
        provider_config = scrapers_config.get(provider)
        if not isinstance(provider_config, dict):
            provider_config = {}
        item = {
            "enabled": bool(provider_config.get("enabled")),
            "language": provider_config.get("language") or "",
            "request_delay": provider_config.get("request_delay"),
            "base_url": provider_config.get("base_url") or "",
            "implemented": provider in runtime.IMPLEMENTED_SCRAPER_PROVIDER_NAMES,
        }
        if provider == "javstash":
            item["has_api_key"] = bool(provider_config.get("api_key"))
        payload[provider] = item
    return payload


def build_settings_payload() -> dict[str, Any]:
    javbus_config = runtime.get_javbus_config()
    webdav_config = runtime.get_webdav_config()
    aria2_config = runtime.get_aria2_config()
    pikpak_config = runtime.get_pikpak_config()
    pan115_config = runtime.get_pan115_config()
    magnet_health_config = runtime.get_magnet_health_config()
    scrapers_config = runtime.get_scrapers_config()
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
        "scrapers": build_scrapers_settings_payload(scrapers_config),
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
        "pan115": {
            "enabled": bool(pan115_config.get("enabled")),
            "has_cookie": bool(pan115_config.get("cookie")),
            "save_dir_id": pan115_config.get("save_dir_id") or "0",
            "login_app": pan115_config.get("login_app") or "wechatmini",
            "batch_size": pan115_config.get("batch_size") or 20,
            "batch_interval_seconds": pan115_config.get("batch_interval_seconds") if pan115_config.get("batch_interval_seconds") is not None else 25.0,
            "jitter_seconds": pan115_config.get("jitter_seconds") if pan115_config.get("jitter_seconds") is not None else 5.0,
        },
        "magnet_health": {
            "enabled": bool(magnet_health_config.get("enabled")),
            "probe_with_aria2": bool(magnet_health_config.get("probe_with_aria2")),
            "min_seeders": int(magnet_health_config.get("min_seeders") or 0),
            "min_peers": int(magnet_health_config.get("min_peers") or 0),
            "min_availability": float(magnet_health_config.get("min_availability") or 0),
            "min_score": float(magnet_health_config.get("min_score") or 0),
            "probe_timeout_seconds": float(magnet_health_config.get("probe_timeout_seconds") or 0),
            "allow_unknown": bool(magnet_health_config.get("allow_unknown", True)),
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


def config_save_error_response(exc: runtime.ConfigSaveError) -> HTTPException:
    return HTTPException(
        status_code=500,
        detail={
            "error": "config_save_failed",
            "message": "配置文件写入失败，请检查部署环境中的配置文件路径和写入权限",
            "path": exc.path,
            "reason": exc.reason,
        },
    )


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


def validate_scrapers_settings(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="scrapers_settings_required")

    normalized: dict[str, Any] = {}
    if "priority" in payload:
        if not isinstance(payload["priority"], list):
            raise HTTPException(status_code=400, detail="scraper_priority_must_be_list")
        priority: list[str] = []
        for value in payload["priority"]:
            provider = str(value or "").strip().lower()
            if provider not in runtime.SCRAPER_PROVIDER_NAMES:
                raise HTTPException(status_code=400, detail="unknown_scraper_provider")
            if provider not in priority:
                priority.append(provider)
        normalized["priority"] = priority

    for provider in runtime.SCRAPER_PROVIDER_NAMES:
        values = payload.get(provider)
        if values is None:
            continue
        if not isinstance(values, dict):
            raise HTTPException(status_code=400, detail=f"{provider}_scraper_settings_required")

        provider_updates: dict[str, Any] = {}
        enabled = _normalize_bool(values, "enabled")
        if enabled is not None:
            provider_updates["enabled"] = enabled

        language = _normalize_string(values, "language")
        if language is not None:
            language = language.lower()
            if language and language not in SCRAPER_LANGUAGES:
                raise HTTPException(status_code=400, detail="scraper_language_unsupported")
            provider_updates["language"] = language

        for key, (minimum, maximum) in SCRAPER_SETTING_LIMITS.items():
            if key not in values:
                continue
            try:
                number = int(float(values[key]))
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"{key}_must_be_number")
            if number < minimum or number > maximum:
                raise HTTPException(status_code=400, detail=f"{key}_out_of_range")
            provider_updates[key] = number

        base_url = _normalize_url(values, "base_url", ("http://", "https://"))
        if base_url is not None:
            provider_updates["base_url"] = base_url.rstrip("/") if base_url else ""

        if provider == "javstash":
            api_key = _normalize_string(values, "api_key")
            if api_key is not None:
                provider_updates["api_key"] = api_key

        if provider_updates:
            normalized[provider] = provider_updates

    return normalized


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


def validate_pan115_settings(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="pan115_settings_required")

    normalized: dict[str, Any] = {}
    enabled = _normalize_bool(payload, "enabled")
    if enabled is not None:
        normalized["enabled"] = enabled

    for key in ("cookie", "save_dir_id", "login_app"):
        value = _normalize_string(payload, key)
        if value is not None:
            if key == "save_dir_id":
                normalized[key] = value or "0"
            elif key == "login_app":
                normalized[key] = value or "wechatmini"
            else:
                normalized[key] = value

    for key, (minimum, maximum) in PAN115_SETTING_LIMITS.items():
        if key not in payload:
            continue
        try:
            number = float(payload[key])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"{key}_must_be_number")
        if number < minimum or number > maximum:
            raise HTTPException(status_code=400, detail=f"{key}_out_of_range")
        normalized[key] = int(number) if key == "batch_size" else number

    if "failure_backoff_seconds" in payload:
        value = payload["failure_backoff_seconds"]
        if not isinstance(value, list):
            raise HTTPException(status_code=400, detail="failure_backoff_seconds_must_be_list")
        backoff: list[float] = []
        for item in value[:5]:
            try:
                seconds = float(item)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="failure_backoff_seconds_must_be_number")
            if seconds < 0 or seconds > 3600:
                raise HTTPException(status_code=400, detail="failure_backoff_seconds_out_of_range")
            backoff.append(seconds)
        normalized["failure_backoff_seconds"] = backoff

    return normalized


def validate_magnet_health_settings(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="magnet_health_settings_required")

    normalized: dict[str, Any] = {}
    for key in ("enabled", "probe_with_aria2", "allow_unknown"):
        value = _normalize_bool(payload, key)
        if value is not None:
            normalized[key] = value

    for key, (minimum, maximum) in MAGNET_HEALTH_SETTING_LIMITS.items():
        if key not in payload:
            continue
        try:
            number = float(payload[key])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"{key}_must_be_number")
        if number < minimum or number > maximum:
            raise HTTPException(status_code=400, detail=f"{key}_out_of_range")
        normalized[key] = int(number) if key in {"min_seeders", "min_peers"} else number

    return normalized


async def update_javbus_settings(payload: dict[str, Any]) -> dict[str, Any]:
    updates = validate_javbus_settings(payload)
    if not updates:
        raise HTTPException(status_code=400, detail="no_supported_settings")

    try:
        runtime.update_config_section("javbus", updates)
    except runtime.ConfigSaveError as exc:
        raise config_save_error_response(exc)
    await javbus_api_service.reconfigure(runtime.get_javbus_config())
    return build_settings_payload()


async def update_system_settings(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="settings_payload_required")

    validators = {
        "javbus": validate_javbus_settings,
        "scrapers": validate_scrapers_settings,
        "webdav": validate_webdav_settings,
        "aria2": validate_aria2_settings,
        "pikpak": validate_pikpak_settings,
        "pan115": validate_pan115_settings,
        "magnet_health": validate_magnet_health_settings,
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

    try:
        for section, updates in updates_by_section.items():
            runtime.update_config_section(section, updates)
    except runtime.ConfigSaveError as exc:
        raise config_save_error_response(exc)

    if "javbus" in updates_by_section:
        await javbus_api_service.reconfigure(runtime.get_javbus_config())

    return build_settings_payload()
