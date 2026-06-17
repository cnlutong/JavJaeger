import os
import re
from pathlib import Path


WINDOWS_DRIVE_PATH_RE = re.compile(r"^[a-zA-Z]:[\\/]")
WINDOWS_UNC_PATH_RE = re.compile(r"^\\\\")


class UserPathError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _strip_wrapping_quotes(value: str) -> str:
    cleaned = value.strip()
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"'", '"'}:
        return cleaned[1:-1].strip()
    return cleaned


def _looks_like_windows_path(value: str) -> bool:
    return bool(WINDOWS_DRIVE_PATH_RE.match(value) or WINDOWS_UNC_PATH_RE.match(value))


def resolve_user_path(value: str | None) -> Path:
    if not value or not str(value).strip():
        raise UserPathError("path_required", "请输入路径")

    cleaned = _strip_wrapping_quotes(str(value))
    expanded = os.path.expandvars(os.path.expanduser(cleaned))

    if os.name != "nt" and _looks_like_windows_path(expanded):
        raise UserPathError(
            "windows_path_on_posix",
            "当前服务运行在 Linux/macOS，请输入服务所在系统可访问的路径，例如 /media/JAV 或 /data/JAV",
        )

    return Path(expanded).resolve()


def resolve_existing_directory(value: str | None) -> Path:
    path = resolve_user_path(value)
    if not path.exists() or not path.is_dir():
        raise UserPathError("directory_not_found", "指定目录不存在或不是目录")
    if path.is_symlink():
        raise UserPathError("symlink_not_supported", "不支持直接扫描符号链接目录")
    return path


def resolve_existing_file(value: str | None) -> Path:
    path = resolve_user_path(value)
    if not path.exists() or not path.is_file():
        raise UserPathError("file_not_found", "源视频不存在")
    return path
