"""Validated public forum magnets; retain the resource rather than re-searching it."""
import re
from urllib.parse import parse_qs, urlencode, urlsplit


def extract_forum_magnets(text, hrefs=()):
    candidates = re.findall(r'''magnet:\?[^\s<>"'，。]+''', text, re.I)
    candidates.extend(href for href in hrefs if href.lower().startswith('magnet:?'))
    results, seen = [], set()
    for candidate in candidates:
        try:
            values = parse_qs(urlsplit(candidate.rstrip('.,;；)）]】')).query).get('xt', [])
        except ValueError:
            continue
        for value in values:
            if not value.lower().startswith('urn:btih:'):
                continue
            info_hash = value[9:].lower()
            if not re.fullmatch(r'[a-f0-9]{40}|[a-z2-7]{32}', info_hash) or info_hash in seen:
                continue
            seen.add(info_hash)
            results.append({'link': 'magnet:?' + urlencode({'xt': 'urn:btih:' + info_hash}, safe=':'), 'source': 'dmn12'})
    return results
