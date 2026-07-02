import re
import unicodedata
from typing import Any


CHINESE_SUBTITLE_KEYWORDS = (
    "中文字幕",
    "中文",
    "简中",
    "繁中",
    "简体中文",
    "繁体中文",
    "简中字幕",
    "繁中字幕",
    "中字",
    "内嵌中字",
    "内封中字",
    "内挂中字",
    "内嵌字幕",
    "内封字幕",
    "内挂字幕",
    "外挂字幕",
    "汉化",
    "漢化",
    "双语字幕",
    "雙語字幕",
    "中日双语",
    "中英双语",
    "人工中字",
    "精翻中字",
    "机翻中字",
    "官中",
)


def has_chinese_subtitle(text: Any) -> bool:
    if not text:
        return False

    normalized = unicodedata.normalize("NFKC", str(text)).lower()
    compact = re.sub(r"\s+", "", normalized)

    for keyword in CHINESE_SUBTITLE_KEYWORDS:
        if keyword in normalized or keyword in compact:
            return True

    if re.search(r"\bchinese\s*(sub|srt|subtitle)s?\b", normalized):
        return True
    if re.search(r"\b(sub|srt|subtitle)s?\s*chinese\b", normalized):
        return True
    if re.search(r"(?<![a-z0-9])(ch|chs|cht)(?![a-z0-9])", normalized):
        return True
    if re.search(r"[-_\s]c(?![a-z0-9])", normalized):
        return True
    return bool(re.search(r"(?<![a-z0-9])[a-z]{2,8}[-_\s]?\d{2,6}c(?![a-z0-9])", normalized))
