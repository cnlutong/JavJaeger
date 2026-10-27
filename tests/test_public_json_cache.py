import asyncio

from modules.common.cache import JsonTTLCache


def test_public_cache_survives_restart_expires_and_returns_independent_snapshots(tmp_path):
    async def exercise():
        now = [1000.0]
        cache = JsonTTLCache(tmp_path, clock=lambda: now[0])
        assert await cache.put('public:one', {'title': '甲'}, ttl=30)
        restarted = JsonTTLCache(tmp_path, clock=lambda: now[0])
        record = await restarted.get('public:one')
        record['value']['title'] = 'changed'
        assert (await restarted.get('public:one'))['value']['title'] == '甲'
        now[0] += 30
        assert await restarted.get('public:one') is None
    asyncio.run(exercise())


def test_public_cache_is_bounded_by_entries_and_bytes_and_ignores_corruption(tmp_path):
    async def exercise():
        cache = JsonTTLCache(tmp_path, max_entries=2, max_bytes=800)
        for key in ['one', 'two', 'three']:
            await cache.put(key, {'value': key}, ttl=30)
        assert await cache.get('one') is None
        assert await cache.get('three')
        assert not await cache.put('oversized', {'value': 'x' * 1000}, ttl=30)
        files = list(tmp_path.glob('*.json'))
        assert len(files) <= 2 and sum(p.stat().st_size for p in files) <= 800
        for path in files:
            path.write_text('{broken')
        assert await cache.get('three') is None
    asyncio.run(exercise())


def test_public_cache_io_errors_do_not_break_the_calling_workflow(tmp_path):
    path = tmp_path / 'not-a-directory'
    path.write_text('occupied')
    async def exercise():
        cache = JsonTTLCache(path)
        assert not await cache.put('one', {'title': '甲'}, ttl=30)
        assert await cache.get('one') is None
    asyncio.run(exercise())


def test_readable_cache_remains_usable_when_access_time_cannot_be_updated(tmp_path, monkeypatch):
    async def exercise():
        cache = JsonTTLCache(tmp_path)
        await cache.put('one', {'title': '甲'}, ttl=30)
        def denied(*args):
            raise PermissionError('read-only cache')
        monkeypatch.setattr('modules.common.cache.os.utime', denied)
        assert (await cache.get('one'))['value']['title'] == '甲'
    asyncio.run(exercise())
