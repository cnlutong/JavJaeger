"""Detached public search enrichment using the same provider and cache services."""
import asyncio
import time
from modules.common.runtime import get_config_revision

from modules.magnets.service import get_magnets_payload
from .service import get_movie_detail, get_all_movies_for_query
from .schemas import SearchEnrichmentRequest, SearchMovieSummary
from .metadata_scrapers import test_metadata_scraper_providers


async def enrich_search(payload: SearchEnrichmentRequest, progress):
    movies = [movie.model_dump(exclude_unset=True) for movie in payload.movies]
    if payload.all_pages:
        progress({'phase': 'search', 'message': '正在检索全部页面，可刷新或离开页面'})
        response = await get_all_movies_for_query(payload.query)
        if response.get('error'):
            return {'success': False, 'message': '影片检索失败，请检查来源后重试'}
        movies = [SearchMovieSummary.model_validate(movie).model_dump(exclude_unset=True) for movie in response.get('movies', [])]
    magnets, completed, details_ready, errors = {}, [], [], {}

    def snapshot():
        return {'success': True, 'movies': list(movies), 'magnets': dict(magnets), 'completed_ids': list(completed),
                'details_ready': list(details_ready), 'errors': dict(errors), 'source': payload.source,
                'mode': payload.mode, 'has_next_page': payload.has_next_page}

    progress({'phase': 'enrichment', 'total': len(movies), 'message': '摘要已就绪，正在后台补全资料与磁力', 'result': snapshot()})

    published = 0

    async def enrich(index):
        nonlocal published
        seed = movies[index]
        code = seed['id']
        if payload.mode != 'magnet' or payload.source == 'javbus':
            try:
                detail = await get_movie_detail(code)
                if detail and detail.get('id'):
                    movies[index] = {**seed, **{key: value for key, value in detail.items() if value is not None and value != ''}}
                    code = movies[index]['id']
                    details_ready.append(code)
                else:
                    errors[code] = '资料补全失败，可打开详情重试'
            except Exception:
                errors[code] = '资料补全失败，可打开详情重试'
        query = {'source': payload.source, 'sortBy': payload.sort_by, 'sortOrder': payload.sort_order, 'exclude4k': str(payload.exclude_4k).lower()}
        if payload.has_subtitle_filter is not None:
            query['hasSubtitle'] = payload.has_subtitle_filter
        if payload.source == 'javbus':
            query.update({key: str(movies[index][key]) for key in ('gid', 'uc') if movies[index].get(key) is not None})
        try:
            result = await get_magnets_payload(code, query)
            magnets[code] = result if isinstance(result, list) else result.get('magnets', [])
        except Exception:
            magnets[code] = []
            errors[code] = '磁力检索失败，可重新检索'
        completed.append(code)
        if time.monotonic() - published >= .5 or len(completed) == len(movies):
            progress({'phase': 'enrichment', 'completed': len(completed), 'total': len(movies),
                      'message': f'已补全 {len(completed)}/{len(movies)} 部', 'result': snapshot()})
            published = time.monotonic()
    indices = iter(range(len(movies)))
    async def worker():
        for index in indices:
            await enrich(index)
    await asyncio.gather(*(worker() for _ in range(min(4, len(movies)))))
    return {**snapshot(), 'message': f'检索完成：{len(movies)} 部，{len(errors)} 部需重试'}


async def test_scrapers(payload, progress):
    revision = get_config_revision()
    progress({'phase': 'testing', 'message': '正在后台测试刮削源，可刷新或离开页面'})
    result = await test_metadata_scraper_providers(payload, progress_callback=progress)
    return {**result, 'config_revision': revision}
