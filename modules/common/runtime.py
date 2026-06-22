import copy
import datetime
import json
import logging
import os
import subprocess
from typing import Any

from fastapi.templating import Jinja2Templates


logger = logging.getLogger(__name__)

SCRAPER_PROVIDER_NAMES = [
    "javbus",
    "r18dev",
    "dmm",
    "libredmm",
    "javlibrary",
    "javdb",
    "jav321",
    "mgstage",
    "tokyohot",
    "aventertainment",
    "dlgetchu",
    "caribbeancom",
    "fc2",
    "javstash",
]
IMPLEMENTED_SCRAPER_PROVIDER_NAMES = list(SCRAPER_PROVIDER_NAMES)


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
    "scrapers": {
        "priority": SCRAPER_PROVIDER_NAMES,
        "javbus": {
            "enabled": True,
            "language": "zh",
            "request_delay": 500,
            "base_url": "https://www.javbus.com",
        },
        "r18dev": {"enabled": False, "language": "en", "request_delay": 1500},
        "dmm": {"enabled": False, "language": "ja", "request_delay": 1500},
        "libredmm": {"enabled": True, "language": "ja", "request_delay": 1500},
        "javlibrary": {"enabled": False, "language": "cn", "request_delay": 1500},
        "javdb": {"enabled": False, "language": "zh", "request_delay": 1500},
        "jav321": {"enabled": True, "language": "zh", "request_delay": 1500},
        "mgstage": {"enabled": False, "language": "ja", "request_delay": 1500},
        "tokyohot": {"enabled": True, "language": "zh", "request_delay": 1500},
        "aventertainment": {"enabled": False, "language": "en", "request_delay": 1500},
        "dlgetchu": {"enabled": True, "language": "ja", "request_delay": 1500},
        "caribbeancom": {"enabled": False, "language": "ja", "request_delay": 1500},
        "fc2": {"enabled": True, "language": "ja", "request_delay": 1500},
        "javstash": {
            "enabled": False,
            "language": "en",
            "request_delay": 1500,
            "base_url": "https://javstash.org/graphql",
            "api_key": "",
        },
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
    "pan115": {
        "enabled": False,
        "cookie": "",
        "save_dir_id": "0",
        "login_app": "wechatmini",
        "batch_size": 20,
        "batch_interval_seconds": 25.0,
        "jitter_seconds": 5.0,
        "failure_backoff_seconds": [120.0, 600.0],
    },
    "magnet_health": {
        "enabled": False,
        "probe_with_aria2": False,
        "min_seeders": 1,
        "min_peers": 1,
        "min_availability": 1.0,
        "min_score": 1.0,
        "probe_timeout_seconds": 20.0,
        "allow_unknown": True,
    },
}

CONFIG_PATH = os.getenv("JAVJAEGER_CONFIG_PATH", "config.json")


class ConfigSaveError(RuntimeError):
    def __init__(self, path: str, reason: str):
        super().__init__(f"Failed to save config to {path}: {reason}")
        self.path = path
        self.reason = reason


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
    try:
        parent = os.path.dirname(os.path.abspath(CONFIG_PATH))
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(CONFIG_PATH, "w", encoding="utf-8") as file:
            json.dump(merged, file, ensure_ascii=False, indent=2)
            file.write("\n")
    except OSError as exc:
        logger.error("保存配置文件失败 %s: %s", CONFIG_PATH, exc)
        raise ConfigSaveError(CONFIG_PATH, str(exc)) from exc
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


def get_pan115_config() -> dict[str, Any]:
    return copy.deepcopy(config.get("pan115", DEFAULT_CONFIG["pan115"]))


def get_magnet_health_config() -> dict[str, Any]:
    return copy.deepcopy(config.get("magnet_health", DEFAULT_CONFIG["magnet_health"]))


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


def get_scrapers_config() -> dict[str, Any]:
    return copy.deepcopy(config.get("scrapers", DEFAULT_CONFIG["scrapers"]))


def build_client_config() -> dict[str, Any]:
    webdav_config = get_webdav_config()
    aria2_config = get_aria2_config()
    pikpak_config = get_pikpak_config()
    pan115_config = get_pan115_config()
    magnet_health_config = get_magnet_health_config()
    webdav_enabled = bool(webdav_config.get("enabled"))
    aria2_enabled = bool(aria2_config.get("enabled"))
    pikpak_enabled = bool(pikpak_config.get("enabled"))
    pan115_enabled = bool(pan115_config.get("enabled"))
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
        "pan115": {
            "configured": bool(pan115_enabled and pan115_config.get("cookie")),
            "enabled": pan115_enabled,
            "save_dir_id": pan115_config.get("save_dir_id") or "0",
            "login_app": pan115_config.get("login_app") or "wechatmini",
            "batch_size": pan115_config.get("batch_size") or 20,
            "batch_interval_seconds": pan115_config.get("batch_interval_seconds") if pan115_config.get("batch_interval_seconds") is not None else 25.0,
            "jitter_seconds": pan115_config.get("jitter_seconds") if pan115_config.get("jitter_seconds") is not None else 5.0,
            "has_cookie": bool(pan115_config.get("cookie")),
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
            "pan115_configured": client_config["pan115"]["configured"],
        },
    }


VERSION_INFO = get_version_info()
VERSION_INFO["asset_version"] = get_static_asset_version()
config = load_config()
SESSION_SECRET = os.getenv("APP_SESSION_SECRET", config.get("session_secret", "javjaeger-dev-session-secret"))
if SESSION_SECRET == "javjaeger-dev-session-secret":
    logger.warning("正在使用默认会话密钥，生产环境请设置 APP_SESSION_SECRET 或 config.session_secret")

templates = Jinja2Templates(directory="templates")
