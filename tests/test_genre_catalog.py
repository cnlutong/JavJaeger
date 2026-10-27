"""Category codes checked against the user's supplied JavBus genre page."""
import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from starlette.datastructures import QueryParams

from modules.movies import service


ROOT = Path(__file__).resolve().parents[1]
REFERENCE = json.loads((ROOT / 'tests/fixtures/javbus_genres.json').read_text(encoding='utf-8'))['groups']
GROUP_NAMES = {'主題': '主题', '角色': '角色', '服裝': '服装', '體型': '体型',
               '行為': '行为', '玩法': '玩法', '類別': '类别', '其他': '其他'}


def test_category_catalog_covers_the_supplied_page_without_reassigning_codes():
    catalog = json.loads((ROOT / 'static/categories.json').read_text(encoding='utf-8'))
    seen = set()
    for source_group, entries in REFERENCE.items():
        expected = []
        for entry in entries:
            if entry['code'] not in seen:
                expected.append(entry['code'])
                seen.add(entry['code'])
        assert {entry['code'] for entry in catalog[GROUP_NAMES[source_group]]} == set(expected)
    entries = [entry for group in catalog.values() for entry in group]
    assert len(entries) == len({entry['code'] for entry in entries}) == 492
    by_code = {entry['code']: entry['name'] for entry in entries}
    assert {code: by_code[code] for code in ['f', '5t', '7x', 'hd', 'fd', 'i8', 'ka']} == {
        'f': '单体作品', '5t': '面向女性观众', '7x': 'VR专用', 'hd': '高清',
        'fd': '4K', 'i8': 'VR', 'ka': 'AI生成作品',
    }
    assert [entry for entry in REFERENCE['其他'] if entry['code'] == 'hd'] == [{'name': '縛り', 'code': 'hd'}]
    assert all(entry['name'] != '縛り' for entry in entries), 'the source conflict must not override the existing HD code'
    assert catalog['其他'] == [entry for entry in REFERENCE['其他'] if entry['code'] != 'hd']


@pytest.mark.parametrize('all_pages', [False, True])
def test_combined_genres_with_the_same_name_require_each_distinct_code(monkeypatch, all_pages):
    async def movies(query):
        return {'movies': [{'id': 'ONE'}, {'id': 'BOTH'}], 'pagination': {'hasNextPage': False}}

    async def details(movie_id):
        genres = [{'id': 'i6', 'name': '清楚'}]
        if movie_id == 'BOTH':
            genres.append({'id': 'jo', 'name': '清楚'})
        return {'genres': genres}

    monkeypatch.setattr(service, 'javbus_api_service', SimpleNamespace(get_movies_by_page=movies, get_movie_detail=details))
    request = SimpleNamespace(query_params=QueryParams({'filters': json.dumps([
        {'type': 'genre', 'value': 'i6', 'label': '清楚'}, {'type': 'genre', 'value': 'jo', 'label': '清楚'},
    ])}))
    fetch = service.get_all_movies_payload if all_pages else service.get_movies_payload
    assert asyncio.run(fetch(request))['movies'] == [{'id': 'BOTH'}]


@pytest.mark.parametrize('genres', ['清楚', {'name': '清楚'}, ['清楚'], [{'name': '清楚'}], [{'id': '', 'name': '清楚'}]])
def test_genre_names_remain_a_fallback_for_metadata_without_codes(genres):
    assert service._movie_detail_matches_filter({'genres': genres}, {'type': 'genre', 'value': 'i6', 'label': '清楚'})
