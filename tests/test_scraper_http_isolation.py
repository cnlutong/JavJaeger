import asyncio
from types import SimpleNamespace

import httpx
import pytest

from modules.common.http_client import create_http_client, http_client_scope


@pytest.fixture
def transports(monkeypatch):
    for key in ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
                'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'):
        monkeypatch.delenv(key, raising=False)
    state = SimpleNamespace(created=[], calls=[], handler=None)

    class Transport(httpx.AsyncBaseTransport):
        def __init__(self, **kwargs):
            self.options = kwargs
            self.closes = 0
            state.created.append(self)

        async def handle_async_request(self, request):
            assert self.closes == 0, 'a borrowed client must not close its owner transport'
            state.calls.append((request, self))
            if state.handler is not None:
                return await state.handler(request, self)
            return httpx.Response(200, text='ok')

        async def aclose(self):
            self.closes += 1

    monkeypatch.setattr(httpx._client, 'AsyncHTTPTransport', Transport)
    return state


def test_cookie_jars_are_per_call_while_nested_scopes_share_the_transport(transports):
    async def handler(request, transport):
        headers = {'set-cookie': 'served=first-call; Path=/'} if request.url.path == '/set' else {}
        return httpx.Response(200, text='ok', headers=headers)

    transports.handler = handler

    async def exercise():
        async with http_client_scope():
            async with create_http_client(cookies={'call': 'first'}) as client:
                await client.get('https://provider.test/set')
                await client.get('https://provider.test/same-call')
            assert len(transports.created) == 1
            assert transports.created[0].closes == 0
            async with http_client_scope():
                async with create_http_client(cookies={'call': 'second'}) as client:
                    await client.get('https://provider.test/new-call')
            assert len(transports.created) == 1
            assert transports.created[0].closes == 0
        assert transports.created[0].closes == 1

    asyncio.run(exercise())
    cookies = [request.headers.get('cookie', '') for request, _ in transports.calls]
    assert 'call=first' in cookies[0]
    assert 'served=first-call' in cookies[1]
    assert 'call=second' in cookies[2]
    assert 'served=' not in cookies[2] and 'call=first' not in cookies[2]


def test_concurrent_headers_credentials_and_timeouts_stay_on_their_own_client(transports):
    both_started = None
    started = []

    async def handler(request, transport):
        started.append(request)
        if len(started) == 2:
            both_started.set()
        await asyncio.wait_for(both_started.wait(), 5)
        return httpx.Response(200, text='ok')

    transports.handler = handler

    async def exercise():
        nonlocal both_started
        both_started = asyncio.Event()

        async def fetch(label, timeout):
            async with create_http_client(headers={'Accept': f'application/{label}', 'ApiKey': f'fixture-{label}'},
                                          cookies={'call': label}, timeout=timeout) as client:
                await client.get('https://provider.test/' + label)

        async with http_client_scope():
            await asyncio.gather(fetch('first', 1.25), fetch('second', 7.5))
        assert len(transports.created) == 1

    asyncio.run(exercise())
    for request in started:
        label = request.url.path.strip('/')
        expected_timeout = 1.25 if label == 'first' else 7.5
        assert request.headers['accept'] == f'application/{label}'
        assert request.headers['apikey'] == f'fixture-{label}'
        assert request.headers['cookie'] == f'call={label}'
        assert set(request.extensions['timeout'].values()) == {expected_timeout}
    assert all('fixture-first' not in repr(transport.options) and 'fixture-second' not in repr(transport.options)
               for transport in transports.created)


def test_failed_and_cancelled_calls_leave_the_shared_transport_usable(transports):
    entered = None
    active = []

    async def handler(request, transport):
        active.append(request)
        try:
            if request.url.path == '/error':
                raise httpx.ReadError('fixture read failure', request=request)
            if request.url.path == '/cancel':
                entered.set()
                await asyncio.Future()
            return httpx.Response(200, text='ok')
        finally:
            active.remove(request)

    transports.handler = handler

    async def exercise():
        nonlocal entered
        entered = asyncio.Event()

        async def fetch(path):
            async with create_http_client() as client:
                return await client.get('https://provider.test/' + path)

        async with http_client_scope():
            with pytest.raises(httpx.ReadError):
                await fetch('error')
            cancelled = asyncio.create_task(fetch('cancel'))
            await asyncio.wait_for(entered.wait(), 5)
            cancelled.cancel()
            with pytest.raises(asyncio.CancelledError):
                await cancelled
            assert active == []
            assert (await fetch('after-cancel')).text == 'ok'
            assert len(transports.created) == 1 and transports.created[0].closes == 0
        assert transports.created[0].closes == 1
        with pytest.raises(RuntimeError, match='scope failed'):
            async with http_client_scope():
                await fetch('before-scope-error')
                raise RuntimeError('scope failed')
        assert all(transport.closes == 1 for transport in transports.created)

    asyncio.run(exercise())


def test_new_event_loop_gets_a_fresh_transport(transports):
    async def exercise():
        async with http_client_scope():
            async with create_http_client() as client:
                assert (await client.get('https://provider.test/movie')).status_code == 200

    asyncio.run(exercise())
    first = transports.created[0]
    asyncio.run(exercise())
    assert len(transports.created) == 2
    assert transports.created[1] is not first
    assert all(transport.closes == 1 for transport in transports.created)


def test_environment_proxy_and_no_proxy_routes_are_preserved(transports, monkeypatch):
    monkeypatch.setenv('HTTP_PROXY', 'http://fixture-user:fixture-password@proxy.test:8888')
    monkeypatch.setenv('NO_PROXY', 'internal.test')

    async def handler(request, transport):
        if request.url.path == '/redirect':
            return httpx.Response(302, headers={'location': 'http://internal.test/redirected'})
        return httpx.Response(200, text='ok')

    transports.handler = handler

    async def exercise():
        async with http_client_scope():
            async with create_http_client(follow_redirects=True) as client:
                await client.get('http://public.test/movie')
                await client.get('http://internal.test/movie')
                response = await client.get('http://public.test/redirect')
                assert str(response.url) == 'http://internal.test/redirected'

    asyncio.run(exercise())
    public, internal, redirect_start, redirect_end = transports.calls
    proxy = public[1].options.get('proxy')
    assert proxy is not None and proxy.url.host == 'proxy.test'
    assert proxy.auth == ('fixture-user', 'fixture-password')
    assert internal[1].options.get('proxy') is None
    assert redirect_start[1] is public[1] and redirect_end[1] is internal[1]
    assert all('fixture-password' not in str(request.url) for request, _ in transports.calls)
    assert all(transport.closes == 1 for transport in transports.created)


def test_a_thread_inheriting_the_scope_creates_its_own_event_loop_owner(transports):
    async def fetch(path):
        async with create_http_client() as client:
            return await client.get('https://provider.test/' + path)

    def in_thread():
        async def exercise():
            async with http_client_scope():
                assert (await fetch('thread')).status_code == 200
        asyncio.run(exercise())

    async def exercise():
        async with http_client_scope():
            await fetch('main-first')
            original = transports.created[0]
            await asyncio.to_thread(in_thread)
            assert len(transports.created) == 2
            assert original.closes == 0 and transports.created[1].closes == 1
            await fetch('main-after-thread')
            assert transports.calls[0][1] is transports.calls[2][1]
            assert transports.calls[1][1] is not original
        assert all(transport.closes == 1 for transport in transports.created)

    asyncio.run(exercise())


def test_empty_and_fake_fetcher_scopes_do_not_construct_a_network_owner(transports):
    async def fake_fetcher():
        return {'id': 'QA-001', 'title': 'fixture'}

    async def exercise():
        async with http_client_scope():
            async with http_client_scope():
                assert (await fake_fetcher())['id'] == 'QA-001'
        assert transports.created == []

    asyncio.run(exercise())
