import asyncio
import json
import logging
import re
import sys
from dataclasses import dataclass, asdict
from html import unescape as html_unescape
from typing import List, Optional, Pattern, Tuple

import httpx
from bs4 import BeautifulSoup


BASE_URL = "https://cilisousuo.cc"


# ===================== 相关性过滤逻辑 =====================
_FILTER_ENABLED = True
_ALLOW_COLLECTIONS = False
_ALLOW_4K = True  # 是否允许4K资源，默认允许


def set_filter_options(enable_filter: bool, allow_collections: bool, allow_4k: bool = True) -> None:
    global _FILTER_ENABLED, _ALLOW_COLLECTIONS, _ALLOW_4K
    _FILTER_ENABLED = enable_filter
    _ALLOW_COLLECTIONS = allow_collections
    _ALLOW_4K = allow_4k


def _extract_code_parts(query: str) -> Optional[Tuple[str, str]]:
    """
    从查询中提取番号前缀和编号，例如 'dass-739' -> ('dass', '739')
    """
    m = re.search(r"([A-Za-z]{2,})[-_\s]*0*(\d{2,})", query)
    if not m:
        return None
    prefix = m.group(1)
    number = m.group(2)
    return prefix, number


def _build_code_regex(prefix: str, number: str) -> Pattern:
    """
    构造用于匹配标题/文件名中番号的正则：
      - 前缀大小写不敏感
      - 分隔符允许 '-', '_', ' ', 无分隔
      - 编号允许前导0
      - 可选后缀（如 ch、C、UHD 等）不作为必要条件
    """
    pattern = rf"(?<![A-Za-z0-9]){re.escape(prefix)}[-_\s]*0*{re.escape(number)}(?![A-Za-z0-9])"
    return re.compile(pattern, re.IGNORECASE)


_COLLECTION_KEYWORDS = (
    "合集",
    "合辑",
    "精选",
    "打包",
    "pack",
)


def _looks_like_collection(text: str) -> bool:
    t = text.lower()
    return any(k in t for k in ("合集", "合辑", "精选", "打包", "collection", "pack"))


def _normalize_code(prefix: str, number: str) -> str:
    """
    规范化番号表示，例如 (dass, 0739) -> DASS-739
    """
    try:
        norm_num = str(int(number))  # 去除前导0
    except ValueError:
        norm_num = number
    return f"{prefix.upper()}-{norm_num}"


def _find_all_codes(text: str) -> set:
    """
    在文本中查找所有可能的番号，返回规范化后的集合
    例如："DASS-739 与 IPX-123 合集" -> {"DASS-739", "IPX-123"}
    """
    codes = set()
    for m in re.finditer(r"([A-Za-z]{2,})[-_\s]*0*(\d{2,})", text or ""):
        codes.add(_normalize_code(m.group(1), m.group(2)))
    return codes


def _looks_like_4k(text: str) -> bool:
    """
    判断文本是否包含4K/超高清相关标识
    关键词示例：4k、uhd、2160p、ultra hd、ultrahd
    """
    if not text:
        return False
    t = text.lower()
    if "4k" in t:
        return True
    if "uhd" in t:
        return True
    if "ultra hd" in t:
        return True
    if "ultrahd" in t:
        return True
    if re.search(r"(?<!\d)2160p(?!\d)", t):
        return True
    return False


def _has_chinese_subtitle(text: str) -> bool:
    """
    判断文本是否包含中文字幕相关标识
    关键词示例：中文字幕、简中、繁中、chs、cht、ch、-c、chinese subtitle
    """
    if not text:
        return False
    t = text.lower()
    
    # 明确的中文字幕标识
    chinese_subtitle_keywords = [
        "中文字幕",
        "中文 字幕",
        "简中",
        "繁中",
        "简体中文",
        "繁体中文",
        "chs",  # Chinese Simplified
        "cht",  # Chinese Traditional
        "chinese subtitle",
        "chinese sub",
        "chinese srt",
        "中文 srt",
        "简中字幕",
        "繁中字幕",
        "中字",
        "内嵌中字",
        "内封中字",
        "内挂中字",
    ]
    
    for keyword in chinese_subtitle_keywords:
        if keyword in t:
            return True
    
    # 检查 "chinese" 后跟 "sub" 或 "srt" 的情况
    if re.search(r"chinese\s+(sub|srt|subtitle)", t):
        return True
    
    # 检查独立的 "ch" 标记（作为单词边界，避免误匹配 "chunk" 等）
    if re.search(r"(?<![a-z])ch(?![a-z])", t):
        return True
    
    # 检查 "-c" 标记（通常出现在文件名中，如 "xxx-c.mp4", "xxx_c.mkv", "xxx-C"）
    # 使用正则表达式匹配 -c 或 _c，并且后面跟着非字母数字字符（如 .、空格或者字符串结尾）
    if re.search(r"[-_\s]c(?![a-z0-9])", t):
        return True
    
    return False


def is_relevant(result: 'SearchResult', query: str, allow_chinese_subtitles: bool = False) -> bool:
    if not _FILTER_ENABLED:
        return True

    parts = _extract_code_parts(query)
    if not parts:
        # 没有识别出番号结构，保守不过滤
        return True
    prefix, number = parts
    code_re = _build_code_regex(prefix, number)

    text = f"{result.title}\n{result.filename}"
    has_code = bool(code_re.search(text))

    if not has_code:
        return False

    if not _ALLOW_COLLECTIONS:
        # 1) 标题明显是合集，直接过滤
        if _looks_like_collection(result.title):
            return False

        # 2) 若标题/文件名中包含两个及以上不同番号，视为合集/打包，过滤
        codes_in_text = _find_all_codes(result.title) | _find_all_codes(result.filename)
        if len(codes_in_text) >= 2:
            return False

    # 3) 非4K资源却体积大于15GB，视为异常，过滤
    size_bytes = parse_size_to_bytes(result.size)
    if size_bytes is not None and size_bytes > 15 * (1024 ** 3):
        if not (_looks_like_4k(result.title) or _looks_like_4k(result.filename)):
            return False

    # 4) 如果包含中文字幕且不允许中文字幕，过滤
    if not allow_chinese_subtitles:
        if _has_chinese_subtitle(result.title) or _has_chinese_subtitle(result.filename):
            return False

    return True


def _get_size_bytes_safe(result: 'SearchResult') -> Optional[float]:
    """
    兼容空值与解析失败，返回字节数或 None
    """
    try:
        return parse_size_to_bytes(result.size)
    except Exception:
        return None


def filter_irrelevant(results: List['SearchResult'], query: str, allow_chinese_subtitles: bool = False) -> List['SearchResult']:
    filtered = [r for r in results if is_relevant(r, query, allow_chinese_subtitles)]
    dropped = len(results) - len(filtered)
    if dropped:
        logging.info("已过滤明显无关结果: %d", dropped)
    return filtered



# ===================== 数据结构 =====================
@dataclass
class SearchResult:
    title: str
    filename: str
    size: str
    detail_url: str
    detail_path: str
    magnet: Optional[str] = None


def _build_headers() -> dict:
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }


async def fetch_text(client: httpx.AsyncClient, url: str) -> str:
    resp = await client.get(url, headers=_build_headers())
    resp.raise_for_status()
    return resp.text


def parse_list_html(html: str) -> List[SearchResult]:
    soup = BeautifulSoup(html, "html.parser")
    items = soup.find_all("li", class_="item")
    results: List[SearchResult] = []
    for item in items:
        try:
            title_el = item.find("div", class_="result-title")
            filename_el = item.find("div", class_="filename")
            size_el = item.find("div", class_="size")
            link_el = item.find("a", class_="link")

            title = title_el.get_text(strip=True) if title_el else ""
            filename = filename_el.get_text(strip=True) if filename_el else title
            size = size_el.get_text(strip=True) if size_el else ""
            path = link_el.get("href", "") if link_el else ""
            if not path:
                continue

            detail_url = f"{BASE_URL}{path}"
            results.append(
                SearchResult(
                    title=title,
                    filename=filename,
                    size=size,
                    detail_url=detail_url,
                    detail_path=path,
                )
            )
        except Exception as e:
            logging.warning("解析列表项失败: %s", e)
            continue
    return results


def parse_detail_for_magnet(html: str) -> Optional[str]:
    """
    从详情页HTML中提取磁力链接
    优先从 <input id="input-magnet"> 元素的 value 属性中提取
    """
    soup = BeautifulSoup(html, "html.parser")
    
    # 优先从 input-magnet 元素提取（这是最可靠的来源）
    input_magnet = soup.find("input", id="input-magnet")
    if input_magnet:
        magnet_value = input_magnet.get("value", "")
        if magnet_value and magnet_value.startswith("magnet:"):
            # HTML实体解码（处理 &amp; 等）
            magnet_value = html_unescape(magnet_value)
            return magnet_value
    
    # 备用方法：查找 <a href="magnet:...">
    a = soup.find("a", href=lambda x: isinstance(x, str) and x.startswith("magnet:"))
    if a:
        return a.get("href")

    # 最后备用：在文本中搜索
    text = soup.get_text("\n")
    m = re.search(r"magnet:\?xt=urn:btih:[a-zA-Z0-9]+", text)
    if m:
        return m.group(0)
    return None


def parse_size_to_bytes(size_str: str) -> Optional[float]:
    """
    解析文件大小字符串为字节数
    例如: "5.22GB" -> 5600839695.0, "1.26GB" -> 1352664698.88
    支持: B, KB, MB, GB, TB
    """
    if not size_str:
        return None
    
    size_str = size_str.strip().upper()
    # 移除可能的逗号分隔符
    size_str = size_str.replace(",", "")
    
    # 匹配数字和单位（单位可选，默认为B）
    match = re.match(r"([\d.]+)\s*([KMGTPEZY]?B)?", size_str)
    if not match:
        return None
    
    try:
        value = float(match.group(1))
        unit_str = (match.group(2) or "").strip()
        
        if not unit_str or unit_str == "B":
            return value
        
        # 处理单位：KB, MB, GB, TB等
        multipliers = {
            "KB": 1024,
            "MB": 1024 ** 2,
            "GB": 1024 ** 3,
            "TB": 1024 ** 4,
            "PB": 1024 ** 5,
            "EB": 1024 ** 6,
            "ZB": 1024 ** 7,
            "YB": 1024 ** 8,
        }
        
        multiplier = multipliers.get(unit_str, 1)
        return value * multiplier
    except (ValueError, TypeError):
        return None


def is_4k_resource(title: str, filename: str = "") -> bool:
    """
    判断资源是否为4K资源
    :param title: 资源标题
    :param filename: 文件名（可选）
    :return: 是否为4K资源
    """
    return _looks_like_4k(title) or _looks_like_4k(filename)


def filter_4k_results(results: List[SearchResult]) -> List[SearchResult]:
    """
    过滤掉4K资源
    :param results: 搜索结果列表
    :return: 过滤后的结果列表
    """
    filtered = [r for r in results if not is_4k_resource(r.title, r.filename)]
    dropped = len(results) - len(filtered)
    if dropped:
        logging.info("已过滤4K资源: %d", dropped)
    return filtered


def select_best_result(results: List[SearchResult], exclude_4k: bool = False) -> Optional[SearchResult]:
    """
    从结果中选择最佳源（文件大小最大的）
    :param results: 搜索结果列表
    :param exclude_4k: 是否排除4K资源
    """
    if not results:
        return None
    
    # 如果需要排除4K资源，先过滤
    if exclude_4k:
        results = filter_4k_results(results)
        if not results:
            return None
    
    best = None
    best_size = -1
    
    for result in results:
        if not result.magnet:
            continue  # 跳过没有磁力链接的
        
        size_bytes = parse_size_to_bytes(result.size)
        if size_bytes is None:
            continue
        
        if size_bytes > best_size:
            best_size = size_bytes
            best = result
    
    return best


async def search_cilisousuo(query: str, resolve_detail: bool = True, limit: Optional[int] = None, best_only: bool = False, allow_chinese_subtitles: bool = False) -> List[SearchResult]:
    """
    搜索磁力链接
    :param query: 搜索关键词
    :param resolve_detail: 是否解析详情页获取磁力链接
    :param limit: 限制结果数量（在过滤和排序之前）
    :param best_only: 是否只返回最佳结果
    :param allow_chinese_subtitles: 是否不过滤中文字幕版本
    :return: 搜索结果列表，如果 best_only=True 且找到最佳结果，返回单元素列表
    """
    search_url = f"{BASE_URL}/search?q={httpx.QueryParams({ 'q': query })['q']}"
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        html = await fetch_text(client, search_url)
        results = parse_list_html(html)
        # 先做相关性过滤
        results = filter_irrelevant(results, query, allow_chinese_subtitles)
        if limit is not None:
            results = results[: max(0, int(limit))]

        if not resolve_detail:
            return results

        # 如果只需要最佳结果，优先基于列表页文件大小选出少量候选，再抓详情
        if best_only:
            # 仅用列表页解析到的文件大小做预选，避免对所有结果抓详情
            sized_results = [r for r in results if _get_size_bytes_safe(r) is not None]
            sized_results.sort(key=lambda r: _get_size_bytes_safe(r) or -1, reverse=True)

            # 选择前若干名作为候选，按顺序依次抓详情，找到首个有效磁力立即返回
            TOP_K = 5
            candidates = sized_results[:TOP_K] if sized_results else results[:TOP_K]

            for r in candidates:
                try:
                    detail_html = await fetch_text(client, r.detail_url)
                    r.magnet = parse_detail_for_magnet(detail_html)
                    if r.magnet:
                        logging.info(f"已选择最佳源: {r.title} ({r.size})")
                        return [r]
                except Exception as e:
                    logging.warning("获取详情失败 %s: %s", r.detail_path, e)

            logging.warning("未在候选中找到有效的磁力链接")
            return []

        # 返回全部结果时，才并发抓取所有详情
        async def fetch_detail(r: SearchResult) -> None:
            try:
                detail_html = await fetch_text(client, r.detail_url)
                r.magnet = parse_detail_for_magnet(detail_html)
            except Exception as e:
                logging.warning("获取详情失败 %s: %s", r.detail_path, e)

        await asyncio.gather(*(fetch_detail(r) for r in results))
        
        return results


async def get_best_magnet(query: str, allow_chinese_subtitles: bool = False) -> Optional[str]:
    """
    获取最佳磁力链接的便捷函数
    :param query: 搜索关键词（通常是影片番号）
    :param allow_chinese_subtitles: 是否不过滤中文字幕版本
    :return: 最佳磁力链接，如果未找到则返回 None
    """
    results = await search_cilisousuo(query, resolve_detail=True, best_only=True, allow_chinese_subtitles=allow_chinese_subtitles)
    if results and results[0].magnet:
        return results[0].magnet
    return None


def _format_table(rows: List[SearchResult]) -> str:
    # 简单表格输出（控制台）
    headers = ["标题", "文件名", "大小", "详情页", "磁力"]
    data = [
        [r.title, r.filename, r.size, r.detail_url, (r.magnet or "")] for r in rows
    ]
    # 计算列宽
    widths = [len(h) for h in headers]
    for row in data:
        for i, col in enumerate(row):
            widths[i] = min(max(widths[i], len(str(col))), 120)

    def fmt_row(cols: List[str]) -> str:
        return " | ".join(str(c)[: widths[i]].ljust(widths[i]) for i, c in enumerate(cols))

    line = "-+-".join("-" * w for w in widths)
    parts = [fmt_row(headers), line]
    for row in data:
        parts.append(fmt_row(row))
    return "\n".join(parts)


def main(argv: List[str]) -> int:
    import argparse

    parser = argparse.ArgumentParser(
        description="cilisousuo.cc 磁力搜索 CLI",
        epilog="默认自动选择文件大小最大的最佳源，并只输出磁力链接（便于脚本使用）"
    )
    parser.add_argument("query", help="搜索关键词，例如: dass-739")
    parser.add_argument("--no-resolve", action="store_true", help="不抓取详情页磁力链接")
    parser.add_argument("--limit", type=int, default=None, help="限制返回结果数量")
    parser.add_argument("--json", action="store_true", help="以JSON输出结果")
    parser.add_argument("--debug", action="store_true", help="输出调试日志")
    parser.add_argument("--no-filter", action="store_true", help="不过滤明显无关的结果")
    parser.add_argument("--allow-collections", action="store_true", help="不过滤包含‘合集’等集合词的结果")
    parser.add_argument("--allow-chinese-subtitles", action="store_true", help="不过滤包含中文字幕的结果（默认会过滤）")
    parser.add_argument("--all", action="store_true", help="返回所有结果（而非只返回最佳源）")
    parser.add_argument("--magnet-only", action="store_true", help="仅输出最佳源的磁力链接（纯文本，便于脚本使用）")

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.debug else logging.INFO, format="%(levelname)s: %(message)s")

    try:
        # 将过滤选项注入到全局过滤函数行为
        set_filter_options(
            enable_filter=not args.no_filter,
            allow_collections=args.allow_collections
        )
        
        # 默认选择最佳结果，除非使用了 --all
        best_only = not args.all
        
        results = asyncio.run(
            search_cilisousuo(
                query=args.query,
                resolve_detail=not args.no_resolve,
                limit=args.limit,
                best_only=best_only,
                allow_chinese_subtitles=args.allow_chinese_subtitles
            )
        )
    except Exception as e:
        logging.error("搜索失败: %s", e)
        return 2

    if not results:
        print("未找到结果", file=sys.stderr)
        return 1

    # 如果指定了 --magnet-only，只输出最佳源的磁力链接
    if args.magnet_only:
        best = select_best_result(results) if not best_only else results[0] if results else None
        if best and best.magnet:
            print(best.magnet)
            return 0
        else:
            print("未找到有效的磁力链接", file=sys.stderr)
            return 1

    if args.json:
        print(json.dumps([asdict(r) for r in results], ensure_ascii=False, indent=2))
    else:
        if best_only and len(results) == 1:
            # 只返回最佳结果时的友好输出
            best = results[0]
            print(f"最佳源: {best.title}")
            print(f"文件名: {best.filename}")
            print(f"大小: {best.size}")
            print(f"磁力链接: {best.magnet or '(未获取到)'}")
        else:
            print(_format_table(results))

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

