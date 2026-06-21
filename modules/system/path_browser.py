import os
import string
from pathlib import Path
from typing import Any

from modules.common.paths import UserPathError, resolve_existing_directory


def _directory_entry(path: Path) -> dict[str, Any]:
    return {
        "name": path.name or str(path),
        "path": str(path),
        "is_directory": True,
        "is_symlink": path.is_symlink(),
    }


def _file_manager_entry(path: Path) -> dict[str, Any]:
    is_directory = path.is_dir()
    size = 0
    modified = ""
    try:
        stat = path.stat()
        size = 0 if is_directory else stat.st_size
        modified = str(stat.st_mtime)
    except OSError:
        pass
    return {
        "name": path.name or str(path),
        "path": str(path),
        "is_directory": is_directory,
        "is_symlink": path.is_symlink(),
        "size": size,
        "modified": modified,
    }


def _dedupe_paths(paths: list[Path]) -> list[Path]:
    deduped: list[Path] = []
    seen: set[str] = set()
    for path in paths:
        key = str(path).lower() if os.name == "nt" else str(path)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(path)
    return deduped


def _root_directories() -> list[Path]:
    roots: list[Path] = []
    if os.name == "nt":
        for letter in string.ascii_uppercase:
            drive = Path(f"{letter}:\\")
            if drive.exists():
                roots.append(drive)
    else:
        roots.append(Path("/"))

    for candidate in (Path.home(), Path.cwd()):
        try:
            if candidate.exists() and candidate.is_dir():
                roots.append(candidate.resolve())
        except OSError:
            continue
    return _dedupe_paths(roots)


def _list_child_directories(directory: Path) -> list[dict[str, Any]]:
    entries: list[Path] = []
    try:
        children = list(directory.iterdir())
    except OSError:
        children = []

    for child in children:
        try:
            if child.is_dir():
                entries.append(child.resolve())
        except OSError:
            continue

    return [_directory_entry(path) for path in sorted(_dedupe_paths(entries), key=lambda item: item.name.lower())]


def _list_file_manager_entries(directory: Path) -> list[dict[str, Any]]:
    entries: list[Path] = []
    try:
        children = list(directory.iterdir())
    except OSError:
        children = []

    for child in children:
        try:
            if child.is_dir() or child.is_file():
                entries.append(child.resolve())
        except OSError:
            continue

    return [
        _file_manager_entry(path)
        for path in sorted(_dedupe_paths(entries), key=lambda item: (not item.is_dir(), item.name.lower()))
    ]


def list_directory_payload(path: str | None = None) -> dict[str, Any]:
    if not path or not str(path).strip():
        return {
            "success": True,
            "current_path": "",
            "parent_path": None,
            "entries": [_directory_entry(root) for root in _root_directories()],
        }

    try:
        directory = resolve_existing_directory(path)
    except UserPathError as exc:
        return {"success": False, "error": exc.code, "message": exc.message, "entries": []}

    parent = directory.parent
    parent_path = str(parent) if parent != directory else None
    return {
        "success": True,
        "current_path": str(directory),
        "parent_path": parent_path,
        "entries": _list_child_directories(directory),
    }


def list_file_entries_payload(path: str | None = None) -> dict[str, Any]:
    if not path or not str(path).strip():
        return {
            "success": True,
            "current_path": "",
            "parent_path": None,
            "entries": [_file_manager_entry(root) for root in _root_directories()],
        }

    try:
        directory = resolve_existing_directory(path)
    except UserPathError as exc:
        return {"success": False, "error": exc.code, "message": exc.message, "entries": []}

    parent = directory.parent
    parent_path = str(parent) if parent != directory else None
    return {
        "success": True,
        "current_path": str(directory),
        "parent_path": parent_path,
        "entries": _list_file_manager_entries(directory),
    }
