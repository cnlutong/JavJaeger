import copy
import datetime
import json
import logging
import os
import subprocess
from typing import Any

from fastapi.templating import Jinja2Templates


logger = logging.getLogger(__name__)


DEFAULT_CONFIG: dict[str, Any] = {
    "javbus": {
        "base_url": "https://www.javbus.com",
        "timeout_seconds": 8,
        "proxy": "",
        "request_interval_seconds": 0.5,
        "cache_expire_seconds": 3600,
        "cache_max_size": 1000,
        "image_retry_attempts": 3,
        "image_retry_backoff_seconds": 0.25,
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

CONFIG_PATH = os.getenv("JAVJAEGER_CONFIG_PATH", "config.json")


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


def get_static_asset_version() -> str:
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    app_bundle_path = os.path.join(repo_root, "static", "app.js")
    try:
        return str(os.stat(app_bundle_path).st_mtime_ns)
    except OSError:
        return datetime.datetime.now().strftime("%Y%m%d%H%M%S")


def _parse_bool_env(value: str | None) -> bool:
    return str(value).lower() in {"1", "true", "yes", "on", "y"}


def is_frontend_cache_disabled() -> bool:
    env_mode = os.getenv("APP_ENV", "").strip().lower()
    explicit = os.getenv("JAVJAEGER_DISABLE_FRONTEND_CACHE")
    if explicit is not None:
        return _parse_bool_env(explicit)
    if env_mode in {"development", "dev", "test", "testing"}:
        return True
    return bool(os.getenv("PYTEST_CURRENT_TEST"))


def is_frontend_auto_reload_enabled() -> bool:
    explicit = os.getenv("JAVJAEGER_ENABLE_FRONTEND_AUTO_RELOAD")
    if explicit is not None:
        return _parse_bool_env(explicit)
    return is_frontend_cache_disabled()


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
        with open(CONFIG_PATH, "r", encoding="utf-8-sig") as file:
            loaded = json.load(file)
            return merge_config(DEFAULT_CONFIG, loaded)
    except Exception as exc:
        logger.error("加载配置文件失败: %s", exc)
        return copy.deepcopy(DEFAULT_CONFIG)


def save_config(next_config: dict[str, Any]) -> dict[str, Any]:
    merged = merge_config(DEFAULT_CONFIG, next_config)
    with open(CONFIG_PATH, "w", encoding="utf-8") as file:
        json.dump(merged, file, ensure_ascii=False, indent=2)
        file.write("\n")
    return merged


def update_config_section(section: str, values: dict[str, Any]) -> dict[str, Any]:
    global config
    current_section = config.get(section, DEFAULT_CONFIG.get(section, {}))
    next_config = copy.deepcopy(config)
    if isinstance(current_section, dict):
        next_config[section] = merge_config(current_section, values)
    else:
        next_config[section] = copy.deepcopy(values)
    config = save_config(next_config)
    return copy.deepcopy(config.get(section, {}))


def get_webdav_config() -> dict[str, Any]:
    return copy.deepcopy(config.get("webdav", DEFAULT_CONFIG["webdav"]))


def get_aria2_config() -> dict[str, Any]:
    return copy.deepcopy(config.get("aria2", DEFAULT_CONFIG["aria2"]))


def get_pikpak_config() -> dict[str, Any]:
    return copy.deepcopy(config.get("pikpak", DEFAULT_CONFIG["pikpak"]))


def get_javbus_config() -> dict[str, Any]:
    javbus_config = copy.deepcopy(config.get("javbus", DEFAULT_CONFIG["javbus"]))
    env_base_url = os.getenv("JAVBUS_BASE_URL")
    env_proxy = os.getenv("JAVBUS_PROXY")
    env_request_interval = os.getenv("JAVBUS_REQUEST_INTERVAL_SECONDS")
    if env_base_url:
        javbus_config["base_url"] = env_base_url
    if env_proxy:
        javbus_config["proxy"] = env_proxy
    if env_request_interval is not None:
        javbus_config["request_interval_seconds"] = env_request_interval
    return javbus_config


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
    javbus_config = get_javbus_config()
    return {
        "javbus": {
            "base_url": javbus_config["base_url"],
            "proxy_configured": bool(javbus_config.get("proxy")),
            "timeout_seconds": javbus_config["timeout_seconds"],
            "request_interval_seconds": javbus_config["request_interval_seconds"],
            "image_retry_attempts": javbus_config["image_retry_attempts"],
            "image_retry_backoff_seconds": javbus_config["image_retry_backoff_seconds"],
        },
        "features": {
            "webdav_configured": client_config["webdav"]["configured"],
            "aria2_configured": client_config["aria2"]["configured"],
            "pikpak_configured": client_config["pikpak"]["configured"],
        },
    }


VERSION_INFO = get_version_info()
VERSION_INFO["asset_version"] = get_static_asset_version()
config = load_config()
SESSION_SECRET = os.getenv("APP_SESSION_SECRET", config.get("session_secret", "javjaeger-dev-session-secret"))
if SESSION_SECRET == "javjaeger-dev-session-secret":
    logger.warning("正在使用默认会话密钥，生产环境请设置 APP_SESSION_SECRET 或 config.session_secret")

templates = Jinja2Templates(directory="templates")
