"""Discover sidecars for one indexed video; serve browser/TV-compatible WebVTT."""
import hashlib
import mimetypes
import re
from pathlib import Path

MAX_SUBTITLE_BYTES = 8 * 1024 * 1024


def subtitle_files(video: Path) -> list[tuple[str, Path, str, str]]:
    tracks = {}
    try:
        for candidate in video.parent.iterdir():
            if candidate.suffix.lower() not in {".vtt", ".srt"}:
                continue
            stem = candidate.stem
            if stem.lower() == video.stem.lower():
                suffix = ""
            elif stem.lower().startswith(video.stem.lower()) and stem[len(video.stem):len(video.stem) + 1] in {".", "-", "_"}:
                suffix = stem[len(video.stem) + 1:]
                if re.match(r"(?:cd|disc|disk|part|pt)[-_. ]*\d", suffix, re.I):
                    continue
            else:
                continue
            container, separator, language = suffix.partition(".")
            specific = bool(separator and (mimetypes.guess_type("video." + container)[0] or "").startswith("video/"))
            if specific:
                if "." + container.lower() != video.suffix.lower():
                    continue
                suffix = language
            if candidate.is_symlink() or not candidate.is_file() or candidate.stat().st_size > MAX_SUBTITLE_BYTES:
                continue
            key = suffix.lower()
            priority = (specific, candidate.suffix.lower() == ".vtt")
            if key not in tracks or priority > tracks[key][0]:
                tracks[key] = (priority, candidate)
    except OSError:
        return []
    result = []
    for suffix, (_, candidate) in tracks.items():
        language, label = subtitle_language(suffix)
        token = hashlib.sha256(candidate.name.encode("utf-8")).hexdigest()[:24]
        result.append((token, candidate, language, label))
    return sorted(result, key=lambda track: (not track[2].startswith("zh"), track[1].name.lower()))


def subtitle_language(suffix: str) -> tuple[str, str]:
    tag = suffix.replace("_", "-").lower()
    if tag in {"zh-hans", "zh-cn", "chs", "sc"}:
        return "zh-Hans", "简体中文"
    if tag in {"zh-hant", "zh-tw", "cht", "tc"}:
        return "zh-Hant", "繁体中文"
    if tag in {"zh", "chi", "zho", "中文"}:
        return "zh", "中文"
    if tag in {"ja", "jp", "jpn"}:
        return "ja", "日语"
    if tag in {"en", "eng"}:
        return "en", "英语"
    return "und", suffix or "外挂字幕"


def read_webvtt(path: Path) -> str:
    # Limit the read as well as discovery, in case a sidecar grew between requests.
    with path.open("rb") as source:
        data = source.read(MAX_SUBTITLE_BYTES + 1)
    if len(data) > MAX_SUBTITLE_BYTES:
        raise ValueError("subtitle_too_large")
    text = data.decode("utf-16" if data.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if path.suffix.lower() == ".vtt":
        if not re.match(r"WEBVTT(?:[ \t\n]|$)", text):
            raise ValueError("invalid_webvtt")
        return text
    # SRT cue IDs and inline markup are valid in WebVTT; only timestamps need conversion.
    text = re.sub(r"(?m)^(\d{2,}:\d{2}:\d{2}),(\d{3})(\s+-->\s+\d{2,}:\d{2}:\d{2}),(\d{3})", r"\1.\2\3.\4", text)
    return "WEBVTT\n\n" + text.strip() + "\n"
