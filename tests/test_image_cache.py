import asyncio
from urllib.parse import quote

import httpx
import pytest
from fastapi.testclient import TestClient

import main
from modules.proxy import service


PNG = b'\x89PNG\r\n\x1a\n' + b'image-fixture'
URL = 'https://www.javbus.com/cover.png?title=a%2Bb+c'


def mocked_source(monkeypatch, handler):
    client = httpx.AsyncClient
    monkeypatch.setattr(service.httpx, 'AsyncClient', lambda **kwargs: client(transport=httpx.MockTransport(handler), **kwargs))


def test_new_browsers_and_restarted_service_reuse_binary_cover_cache(tmp_path, monkeypatch):
    calls = []
    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(200, content=PNG, headers={'content-type': 'image/png'})
    mocked_source(monkeypatch, handler)
    monkeypatch.setattr(service, 'image_proxy_service', service.ImageProxyService(tmp_path / 'images'))
    first, second = TestClient(main.app), TestClient(main.app)
    try:
        response = first.get('/api/image-proxy?url=' + quote(URL, safe=''))
        assert response.status_code == 200 and response.content == PNG
        assert response.headers['content-type'] == 'image/png'
        assert response.headers['x-content-type-options'] == 'nosniff'
        first.put('/api/image-cache', json={'mb': 1}).raise_for_status()
        service.image_proxy_service = service.ImageProxyService(tmp_path / 'images')
        cached = second.get('/api/image-proxy?url=' + quote(URL, safe=''))
        assert cached.content == PNG and cached.headers['content-type'] == 'image/png'
        assert calls == [URL], 'the URL must not be decoded twice and a new browser must not fetch the origin'
        status = second.get('/api/image-cache').json()
        assert status['settings'] == {'mb': 1} and status['count'] == 1
        assert status['size_bytes'] == sum(path.stat().st_size for path in (tmp_path / 'images').glob('*.image'))
    finally:
        first.close(); second.close()


def test_image_limit_is_independent_and_evicts_least_recently_used_files(tmp_path, monkeypatch):
    calls = []
    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(200, content=PNG + b'x' * (600000 if 'large' not in request.url.path else 1100000), headers={'content-type': 'image/png'})
    mocked_source(monkeypatch, handler)
    async def exercise():
        proxy = service.ImageProxyService(tmp_path / 'images')
        await proxy.configure({'mb': 2})
        for name in ['one', 'two', 'three']:
            await proxy.get_image('https://www.javbus.com/' + name)
        await proxy.get_image('https://www.javbus.com/one')
        await proxy.configure({'mb': 1})
        assert (await proxy.status())['count'] == 1
        calls.clear()
        await proxy.get_image('https://www.javbus.com/one')
        assert calls == [], 'recently used images survive budget reductions'
        assert (await proxy.status())['size_bytes'] <= 1024 ** 2
    asyncio.run(exercise())


def test_oversized_images_are_served_without_evicting_useful_cached_files(tmp_path, monkeypatch):
    calls = []
    def handler(request):
        calls.append(request.url.path)
        return httpx.Response(200, content=PNG + (b'x' * 1100000 if 'large' in request.url.path else b''), headers={'content-type': 'image/png'})
    mocked_source(monkeypatch, handler)
    async def exercise():
        proxy = service.ImageProxyService(tmp_path / 'images'); await proxy.configure({'mb': 1})
        await proxy.get_image('https://www.javbus.com/small')
        for _ in range(2):
            content, _ = await proxy.get_image('https://www.javbus.com/large')
            assert len(content) > 1024 ** 2
        await proxy.get_image('https://www.javbus.com/small')
        assert calls == ['/small', '/large', '/large']
        assert (await proxy.status())['count'] == 1
    asyncio.run(exercise())


def test_concurrent_cover_requests_share_one_fetch_and_failed_images_are_not_cached(tmp_path, monkeypatch):
    calls = []
    async def handler(request):
        calls.append(request.url.path)
        await asyncio.sleep(0.02)
        if len(calls) == 1:
            return httpx.Response(503)
        return httpx.Response(200, content=PNG, headers={'content-type': 'image/png'})
    mocked_source(monkeypatch, handler)
    async def exercise():
        proxy = service.ImageProxyService(tmp_path / 'images')
        results = await asyncio.gather(*[proxy.get_image(URL) for _ in range(4)], return_exceptions=True)
        assert all(isinstance(result, service.ImageProxyError) for result in results)
        assert (await proxy.status())['count'] == 0
        await asyncio.gather(*[proxy.get_image(URL) for _ in range(4)])
        assert len(calls) == 2
        assert (await proxy.status())['count'] == 1
    asyncio.run(exercise())


def test_image_proxy_blocks_untrusted_redirects_and_non_image_responses(tmp_path, monkeypatch):
    requests = []
    def handler(request):
        requests.append(str(request.url))
        if request.url.path == '/redirect':
            return httpx.Response(302, headers={'location': 'http://127.0.0.1/private'})
        return httpx.Response(200, content=b'<html>error</html>', headers={'content-type': 'text/html'})
    mocked_source(monkeypatch, handler)
    async def exercise():
        proxy = service.ImageProxyService(tmp_path / 'images')
        for url in ['http://127.0.0.1/a', 'http://[broken', 'https://user:private@www.javbus.com/a', 'https://www.javbus.com:8080/a']:
            with pytest.raises(service.ImageProxyError): await proxy.get_image(url)
        for path in ['/redirect', '/html']:
            with pytest.raises(service.ImageProxyError): await proxy.get_image('https://www.javbus.com' + path)
        assert (await proxy.status())['count'] == 0
        assert requests == ['https://www.javbus.com/redirect', 'https://www.javbus.com/html']
    asyncio.run(exercise())


def test_trusted_redirects_are_cached_under_the_original_cover_url(tmp_path, monkeypatch):
    calls = []
    def handler(request):
        calls.append(str(request.url))
        if request.url.host == 'www.javbus.com':
            return httpx.Response(302, headers={'location': 'https://pics.dmm.co.jp/cover.png'})
        return httpx.Response(200, content=PNG, headers={'content-type': 'application/octet-stream'})
    mocked_source(monkeypatch, handler)
    async def exercise():
        proxy = service.ImageProxyService(tmp_path)
        for _ in range(2): assert await proxy.get_image(URL) == (PNG, 'image/png')
        assert calls == [URL, 'https://pics.dmm.co.jp/cover.png']
    asyncio.run(exercise())


@pytest.mark.parametrize('values', [{}, {'mb': 0}, {'mb': -1}, {'mb': 1.5}, {'mb': True}])
def test_image_cache_policy_validates_before_writing(tmp_path, values):
    async def exercise():
        proxy = service.ImageProxyService(tmp_path / 'images')
        with pytest.raises(ValueError): await proxy.configure(values)
        assert (await proxy.status())['settings'] == {'mb': 256}
    asyncio.run(exercise())


def test_image_cache_io_failures_do_not_break_live_images_and_configuration_errors_are_visible(tmp_path, monkeypatch):
    blocked = tmp_path / 'blocked'; blocked.write_text('not a directory')
    mocked_source(monkeypatch, lambda request: httpx.Response(200, content=PNG, headers={'content-type': 'image/png'}))
    proxy = service.ImageProxyService(blocked / 'images')
    async def exercise():
        assert (await proxy.get_image(URL))[0] == PNG
    asyncio.run(exercise())
    monkeypatch.setattr(service, 'image_proxy_service', proxy)
    client = TestClient(main.app)
    try:
        response = client.put('/api/image-cache', json={'mb': 1})
        assert response.status_code == 500 and '图片缓存' in response.json()['detail']
    finally: client.close()


def test_corrupt_cached_images_and_interrupted_writes_are_reclaimed(tmp_path, monkeypatch):
    import hashlib
    key = hashlib.sha256(URL.encode()).hexdigest()
    (tmp_path / (key + '.image')).write_bytes(b'image/png\n<html>broken</html>')
    (tmp_path / (key + '.tmp')).write_bytes(b'interrupted write')
    calls = []
    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(200, content=PNG, headers={'content-type': 'image/png'})
    mocked_source(monkeypatch, handler)
    async def exercise():
        proxy = service.ImageProxyService(tmp_path)
        assert (await proxy.get_image(URL))[0] == PNG
        assert calls == [URL]
        assert not list(tmp_path.glob('*.tmp'))
        assert (await proxy.status())['count'] == 1
    asyncio.run(exercise())
