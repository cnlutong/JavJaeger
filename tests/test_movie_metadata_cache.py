import asyncio
import json
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import main
from modules.javbus_api.metadata_cache import MovieMetadataCache
from modules.javbus_api import service as provider


HTML = '''<div class="container"><h3>QA-001 Shared title</h3><div class="movie">
<a class="bigImage"><img src="/cover.jpg"></a><div class="info">
<p><span class="header">製作商:</span><a href="https://www.javbus.com/studio/qa">Shared Studio</a></p>
<p><span class="genre" onmouseover="star"><a href="https://www.javbus.com/star/qa">Shared Actor</a></span></p>
</div></div></div><script>var gid = 123; var uc = 0;</script>'''


def test_two_browser_sessions_and_a_restarted_cache_reuse_completed_details(tmp_path, monkeypatch):
    cache_path = tmp_path / 'cache.json'
    api = provider.javbus_api_service
    monkeypatch.setattr(api, 'metadata_cache', MovieMetadataCache(cache_path))
    fetch = AsyncMock(return_value=HTML)
    monkeypatch.setattr(api.client, 'get_text', fetch)
    first = TestClient(main.app)
    details = first.get('/api/movies/qa-001').json()
    assert details['stars'][0]['name'] == 'Shared Actor'
    assert details['producer']['name'] == 'Shared Studio'
    assert details['img'].endswith('/cover.jpg')
    first.put('/api/metadata-cache', json={'mode': 'size', 'days': 7, 'mb': 1}).raise_for_status()
    first.close()
    api.metadata_cache = MovieMetadataCache(cache_path)
    second = TestClient(main.app)
    assert second.get('/api/movies/QA-001').json() == details
    status = second.get('/api/metadata-cache').json()
    assert status['settings'] == {'mode': 'size', 'days': 7, 'mb': 1}
    assert status['count'] == 1
    assert status['size_bytes'] == cache_path.stat().st_size
    second.close()
    assert fetch.await_count == 1, 'new browsers and a fresh cache instance must not fetch the source again'
    paths = [route.path for route in main.app.routes if hasattr(route, 'path')]
    assert paths.index('/api/metadata-cache') < paths.index('/api/{path:path}')


def test_server_cache_prunes_days_or_actual_utf8_file_bytes_and_keeps_public_metadata(tmp_path, monkeypatch):
    import modules.javbus_api.metadata_cache as storage
    now = 1_800_000_000
    monkeypatch.setattr(storage.time, 'time', lambda: now)
    path = tmp_path / 'cache.json'

    async def exercise():
        cache = MovieMetadataCache(path)
        await cache.put({'id': 'qa-old', 'title': '旧' * 150000, 'stars': [{'name': 'Actor'}], 'password': 'must-not-persist', 'in_local_library': True})
        now_age = now + 40 * 86400
        monkeypatch.setattr(storage.time, 'time', lambda: now_age)
        await cache.configure({'mode': 'size', 'days': 1, 'mb': 1})
        assert await cache.get('QA-OLD'), 'size mode does not apply a hidden day limit'
        await cache.put({'id': 'QA-NEW', 'title': '新' * 150000})
        await cache.put({'id': 'QA-LAST', 'title': '末' * 150000})
        assert path.stat().st_size <= 1024 ** 2
        assert await cache.get('QA-OLD') is None
        assert await cache.get('QA-NEW')
        serialized = path.read_text()
        assert 'must-not-persist' not in serialized and 'in_local_library' not in serialized
        await cache.configure({'mode': 'days', 'days': 1, 'mb': 1})
        monkeypatch.setattr(storage.time, 'time', lambda: now_age + 86400)
        assert await cache.get('QA-NEW') is None
        assert (await cache.status())['count'] == 0
        assert json.loads(path.read_text())['entries'] == {}
    asyncio.run(exercise())


@pytest.mark.parametrize('values', [None, {}, {'mode': 'unknown', 'days': 1, 'mb': 1},
    {'mode': 'days', 'days': 0, 'mb': 1}, {'mode': 'size', 'days': 1, 'mb': -1},
    {'mode': 'days', 'days': 1.5, 'mb': 1}, {'mode': 'size', 'days': True, 'mb': 1},
    {'mode': 'days', 'days': 10 ** 100, 'mb': 1}])
def test_server_cache_rejects_invalid_settings_without_overwriting_saved_policy(tmp_path, values):
    async def exercise():
        cache = MovieMetadataCache(tmp_path / 'cache.json')
        await cache.configure({'mode': 'days', 'days': 7, 'mb': 5})
        with pytest.raises(ValueError):
            await cache.configure(values)
        assert (await cache.status())['settings']['days'] == 7
    asyncio.run(exercise())


def test_failed_fetches_and_unwritable_cache_do_not_poison_completed_metadata(tmp_path, monkeypatch):
    api = provider.JavBusApiService()
    api.metadata_cache = MovieMetadataCache(tmp_path / 'cache.json')
    fetch = AsyncMock(side_effect=[ValueError('source offline'), HTML, HTML])
    monkeypatch.setattr(api.client, 'get_text', fetch)

    async def exercise():
        with pytest.raises(ValueError):
            await api.get_movie_detail('QA-001')
        assert (await api.metadata_cache.status())['count'] == 0
        result = await api.get_movie_detail('QA-001')
        result['stars'].clear()
        assert (await api.get_movie_detail('QA-001'))['stars'], 'response mutations cannot edit the shared cache'
        api.metadata_cache = MovieMetadataCache(tmp_path / 'blocked' / 'cache.json')
        (tmp_path / 'blocked').write_text('not a directory')
        assert (await api.get_movie_detail('QA-002'))['title'], 'cache I/O failure must still return live metadata'
    asyncio.run(exercise())


def test_cache_recovers_from_corrupt_json_and_settings_write_errors_are_reported(tmp_path, monkeypatch):
    path = tmp_path / 'cache.json'; path.write_text('{broken')
    cache = MovieMetadataCache(path)
    async def exercise():
        assert await cache.get('QA-001') is None
        await cache.put({'id': 'QA-001', 'title': 'Recovered'})
        assert (await MovieMetadataCache(path).get('QA-001'))['title'] == 'Recovered'
    asyncio.run(exercise())
    blocker = tmp_path / 'blocked'; blocker.write_text('not a directory')
    monkeypatch.setattr(provider.javbus_api_service, 'metadata_cache', MovieMetadataCache(blocker / 'cache.json'))
    client = TestClient(main.app)
    response = client.put('/api/metadata-cache', json={'mode': 'days', 'days': 7, 'mb': 5})
    assert response.status_code == 500
    assert '缓存' in response.json()['detail']
    client.close()
