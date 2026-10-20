import asyncio
from collections import OrderedDict
import hashlib
import json
from pathlib import Path
import threading

import pytest

from modules.javbus_api import metadata_cache as storage


def entry_directory(path):
    return path.with_name(path.name + '.entries')


def entry_path(path, movie_id):
    return entry_directory(path) / (hashlib.sha256(movie_id.encode()).hexdigest() + '.json')


def actual_bytes(path):
    return path.stat().st_size + sum(record.stat().st_size for record in entry_directory(path).glob('*.json'))


def legacy(path, count=2):
    entries = {f'QA-{index}': {'saved_at': storage.time.time(), 'data': {'id': f'QA-{index}', 'title': '资料' * 20}}
               for index in range(count)}
    path.write_bytes(storage.encode({'version': 1, 'settings': dict(storage.DEFAULT_SETTINGS), 'entries': entries}))


@pytest.mark.parametrize('mode', ['days', 'size'])
def test_warm_put_only_writes_changed_records_and_status_uses_incremental_bytes(tmp_path, monkeypatch, mode):
    path = tmp_path / 'cache.json'
    legacy(path, 2000)
    scans, encoded, writes, traversals = [], [], [], []
    original_encode, original_write, original_glob = storage.encode, Path.write_bytes, Path.glob

    class CountedEntries(OrderedDict):
        def items(self):
            scans.append(len(self))
            return super().items()

        def values(self):
            scans.append(len(self))
            return super().values()

    def counted_encode(value):
        encoded.append(value)
        return original_encode(value)

    def counted_write(target, content):
        writes.append((target, len(content)))
        return original_write(target, content)

    def counted_glob(target, pattern):
        traversals.append((target, pattern))
        return original_glob(target, pattern)

    async def exercise():
        cache = storage.MovieMetadataCache(path)
        await cache.configure({'mode': mode, 'days': 30, 'mb': 5})
        await cache.put({'id': 'QA-SEED', 'title': 'seed'})
        cache._entries = CountedEntries(cache._entries)
        with monkeypatch.context() as tracked:
            tracked.setattr(storage, 'encode', counted_encode)
            tracked.setattr(Path, 'write_bytes', counted_write)
            tracked.setattr(Path, 'glob', counted_glob)
            for index in range(5):
                await cache.put({'id': f'QA-NEW-{index}', 'title': 'new'})
                assert (await cache.status())['count'] == 2002 + index
        assert scans == [], 'an ordinary put/status must not traverse unrelated metadata'
        assert traversals == [], 'a warm operation must not enumerate entry files'
        assert all('entries' not in payload for payload in encoded), 'only individual records may be encoded'
        assert len(writes) == 5 and sum(length for _, length in writes) < 4096
        assert (await cache.status())['size_bytes'] == actual_bytes(path)
    asyncio.run(exercise())


def test_legacy_migration_keeps_policy_public_fields_and_restarts(tmp_path):
    path = tmp_path / 'cache.json'
    legacy(path)
    original = path.read_bytes()

    async def exercise():
        cache = storage.MovieMetadataCache(path)
        assert (await cache.get('qa-0'))['title']
        assert path.read_bytes() == original, 'a read-only legacy hit must not require migration writes'
        await cache.put({'id': '../qa-new', 'title': 'new', 'raw': {'password': 'secret'}, 'password': 'secret'})
        assert json.loads(path.read_bytes()) == {'version': 2, 'settings': storage.DEFAULT_SETTINGS}
        files = list(entry_directory(path).glob('*.json'))
        assert len(files) == 3 and all(len(record.stem) == 64 for record in files)
        assert all(b'secret' not in record.read_bytes() and b'"raw"' not in record.read_bytes() for record in files)
        restarted = storage.MovieMetadataCache(path)
        assert (await restarted.get('QA-0'))['title']
        assert (await restarted.get('../QA-NEW'))['title'] == 'new'
        assert (await restarted.status())['size_bytes'] == actual_bytes(path)
    asyncio.run(exercise())


def test_equal_timestamps_and_refreshed_records_keep_fifo_order_after_restart(tmp_path, monkeypatch):
    path = tmp_path / 'cache.json'
    monkeypatch.setattr(storage.time, 'time', lambda: 1_800_000_000)

    async def exercise():
        cache = storage.MovieMetadataCache(path)
        await cache.configure({'mode': 'size', 'days': 30, 'mb': 1})
        for movie_id in ['QA-A', 'QA-B', 'QA-A']:
            await cache.put({'id': movie_id, 'title': '中' * 130000})
        restarted = storage.MovieMetadataCache(path)
        await restarted.put({'id': 'QA-C', 'title': '中' * 130000})
        assert await restarted.get('QA-B') is None
        assert await restarted.get('QA-A') and await restarted.get('QA-C')
        assert (await restarted.status())['size_bytes'] == actual_bytes(path) <= 1024 ** 2
    asyncio.run(exercise())


def test_failed_migration_marker_preserves_legacy_snapshot_and_can_retry(tmp_path, monkeypatch):
    path = tmp_path / 'cache.json'
    legacy(path)
    original = path.read_bytes()
    original_replace = Path.replace

    def deny_marker(source, target):
        if Path(target) == path:
            raise PermissionError('marker is read-only')
        return original_replace(source, target)

    async def exercise():
        cache = storage.MovieMetadataCache(path)
        with monkeypatch.context() as denied:
            denied.setattr(Path, 'replace', deny_marker)
            with pytest.raises(PermissionError):
                await cache.put({'id': 'QA-NEW', 'title': 'new'})
        assert path.read_bytes() == original
        restarted = storage.MovieMetadataCache(path)
        assert await restarted.get('QA-0')
        assert await restarted.get('QA-NEW') is None
        await restarted.put({'id': 'QA-NEW', 'title': 'new'})
        assert json.loads(path.read_bytes())['version'] == 2
        assert (await storage.MovieMetadataCache(path).status())['count'] == 3
    asyncio.run(exercise())


def test_failed_atomic_overwrite_preserves_old_record_in_memory_and_after_restart(tmp_path, monkeypatch):
    path = tmp_path / 'cache.json'
    original_replace = Path.replace

    def deny_replacement(source, target):
        if b'"title":"replacement"' in source.read_bytes():
            raise PermissionError('entry is read-only')
        return original_replace(source, target)

    async def exercise():
        cache = storage.MovieMetadataCache(path)
        await cache.put({'id': 'QA-1', 'title': 'original'})
        with monkeypatch.context() as denied:
            denied.setattr(Path, 'replace', deny_replacement)
            with pytest.raises(PermissionError):
                await cache.put({'id': 'QA-1', 'title': 'replacement'})
        assert (await cache.get('QA-1'))['title'] == 'original'
        assert (await storage.MovieMetadataCache(path).get('QA-1'))['title'] == 'original'
    asyncio.run(exercise())


def test_corrupt_entry_does_not_discard_other_records(tmp_path):
    path = tmp_path / 'cache.json'

    async def exercise():
        cache = storage.MovieMetadataCache(path)
        await cache.put({'id': 'QA-1', 'title': 'one'})
        await cache.put({'id': 'QA-2', 'title': 'two'})
        entry_path(path, 'QA-1').write_bytes(b'{broken')
        restarted = storage.MovieMetadataCache(path)
        assert await restarted.get('QA-1') is None
        assert (await restarted.get('QA-2'))['title'] == 'two'
        assert (await restarted.status())['size_bytes'] == actual_bytes(path)
    asyncio.run(exercise())


def test_failed_policy_commit_does_not_remove_old_records_or_change_expiry(tmp_path, monkeypatch):
    path = tmp_path / 'cache.json'
    now = [1_800_000_000]
    monkeypatch.setattr(storage.time, 'time', lambda: now[0])

    async def exercise():
        cache = storage.MovieMetadataCache(path)
        await cache.configure({'mode': 'size', 'days': 30, 'mb': 1})
        await cache.put({'id': 'QA-OLD', 'title': 'old'})
        now[0] += 40 * 86400
        before = await cache.status()
        original = {record: record.read_bytes() for record in [path, *entry_directory(path).glob('*.json')]}
        with monkeypatch.context() as denied:
            def deny_settings():
                raise PermissionError('settings are read-only')
            denied.setattr(cache, '_save', deny_settings)
            with pytest.raises(PermissionError):
                await cache.configure({'mode': 'days', 'days': 1, 'mb': 1})
        assert await cache.status() == before
        assert {record: record.read_bytes() for record in original} == original
        assert await cache.get('QA-OLD')
        restarted = storage.MovieMetadataCache(path)
        assert await restarted.status() == before and await restarted.get('QA-OLD')
        await cache.configure({'mode': 'days', 'days': 1, 'mb': 1})
        assert await cache.get('QA-OLD') is None
    asyncio.run(exercise())


def test_committed_policy_retries_failed_entry_deletion(tmp_path, monkeypatch):
    path = tmp_path / 'cache.json'
    now = [1_800_000_000]
    monkeypatch.setattr(storage.time, 'time', lambda: now[0])
    original_unlink = Path.unlink

    def deny_old_record(target, *args, **kwargs):
        if target == entry_path(path, 'QA-OLD'):
            raise PermissionError('entry cannot be deleted')
        return original_unlink(target, *args, **kwargs)

    async def exercise():
        cache = storage.MovieMetadataCache(path)
        await cache.configure({'mode': 'size', 'days': 30, 'mb': 1})
        await cache.put({'id': 'QA-OLD', 'title': 'old'})
        now[0] += 40 * 86400
        with monkeypatch.context() as denied:
            denied.setattr(Path, 'unlink', deny_old_record)
            with pytest.raises(PermissionError):
                await cache.configure({'mode': 'days', 'days': 1, 'mb': 1})
        assert json.loads(path.read_bytes())['settings']['mode'] == 'days'
        assert json.loads(entry_path(path, 'QA-OLD').read_bytes())['data']['title'] == 'old'
        assert (await cache.status())['count'] == 0
        assert not entry_path(path, 'QA-OLD').exists()
        assert (await cache.status())['size_bytes'] == actual_bytes(path)
    asyncio.run(exercise())


def test_restart_removes_interrupted_entry_write_without_losing_complete_record(tmp_path):
    path = tmp_path / 'cache.json'

    async def exercise():
        cache = storage.MovieMetadataCache(path)
        await cache.configure({'mode': 'size', 'days': 30, 'mb': 1})
        await cache.put({'id': 'QA-1', 'title': 'complete'})
        record = entry_path(path, 'QA-1')
        original = record.read_bytes()
        partial = record.with_name(record.name + '.tmp')
        partial.write_bytes(b'{"partial":' + b'x' * 2 * 1024 ** 2)
        marker_partial = path.with_name(path.name + '.tmp')
        marker_partial.write_bytes(b'{"version":')
        unrelated = entry_directory(path) / 'unrelated.json.tmp'
        unrelated.write_bytes(b'leave this alone')
        restarted = storage.MovieMetadataCache(path)
        state = await restarted.status()
        assert not partial.exists(), 'a crashed entry write must not escape the disk quota forever'
        assert not marker_partial.exists(), 'an interrupted policy write must not leave an uncounted temporary file'
        assert unrelated.read_bytes() == b'leave this alone'
        assert record.read_bytes() == original
        assert (await restarted.get('QA-1'))['title'] == 'complete'
        assert state['size_bytes'] == actual_bytes(path) <= 1024 ** 2
    asyncio.run(exercise())


def test_restart_discards_interrupted_migration_staging_and_preserves_legacy_snapshot(tmp_path):
    path = tmp_path / 'cache.json'
    legacy(path)
    original = path.read_bytes()
    staging = path.with_name(path.name + '.entries.staging')
    staging.mkdir()
    (staging / 'partial.json').write_bytes(b'x' * 2 * 1024 ** 2)
    unrelated = tmp_path / 'other-cache.entries.staging'
    unrelated.mkdir()
    (unrelated / 'keep.json').write_bytes(b'keep')

    async def exercise():
        restarted = storage.MovieMetadataCache(path)
        assert (await restarted.status())['count'] == 2
        assert not staging.exists(), 'a crashed one-time migration must not keep an abandoned second copy'
        assert path.read_bytes() == original and await restarted.get('QA-0')
        assert (unrelated / 'keep.json').read_bytes() == b'keep'
        await restarted.put({'id': 'QA-NEW', 'title': 'new'})
        assert (await storage.MovieMetadataCache(path).status())['count'] == 3
        assert not staging.exists()
    asyncio.run(exercise())


def test_legacy_restart_discards_uncommitted_entry_directory_without_migrating(tmp_path):
    path = tmp_path / 'cache.json'
    legacy(path)
    original = path.read_bytes()
    entry_directory(path).mkdir()
    entry_path(path, 'QA-ORPHAN').write_bytes(b'x' * 2 * 1024 ** 2)

    async def exercise():
        cache = storage.MovieMetadataCache(path)
        assert (await cache.get('QA-0'))['title']
        assert not entry_directory(path).exists(), 'only the uncommitted second copy should be removed'
        assert path.read_bytes() == original
        assert (await cache.status())['size_bytes'] == len(original)
        assert (await cache.status())['count'] == 2
    asyncio.run(exercise())


def test_clean_legacy_hits_do_not_require_writes_or_directory_creation(tmp_path, monkeypatch):
    path = tmp_path / 'cache.json'
    legacy(path)

    def deny_write(*args, **kwargs):
        raise AssertionError('a valid legacy hit must work in a read-only directory')

    async def exercise():
        monkeypatch.setattr(Path, 'write_bytes', deny_write)
        monkeypatch.setattr(Path, 'mkdir', deny_write)
        monkeypatch.setattr(Path, 'unlink', deny_write)
        cache = storage.MovieMetadataCache(path)
        assert (await cache.get('QA-0'))['title']
        assert (await cache.status())['count'] == 2
    asyncio.run(exercise())


def test_cancellation_keeps_lock_until_entry_write_and_bookkeeping_finish(tmp_path, monkeypatch):
    path = tmp_path / 'cache.json'
    entered, release = threading.Event(), threading.Event()
    original_replace = Path.replace

    def blocked_replace(source, target):
        content = source.read_bytes()
        if b'"title":"waiting"' in content and b'QA-2' not in content:
            entered.set()
            assert release.wait(10)
        return original_replace(source, target)

    async def exercise():
        cache = storage.MovieMetadataCache(path)
        await cache.put({'id': 'QA-SEED', 'title': 'seed'})
        monkeypatch.setattr(Path, 'replace', blocked_replace)
        first = asyncio.create_task(cache.put({'id': 'QA-1', 'title': 'waiting'}))
        assert await asyncio.to_thread(entered.wait, 5)
        first.cancel()
        second = asyncio.create_task(cache.put({'id': 'QA-2', 'title': 'second'}))
        try:
            await asyncio.sleep(0.03)
            assert not second.done(), 'cancellation must not expose an unfinished disk write to another mutation'
        finally:
            release.set()
            await asyncio.gather(first, second, return_exceptions=True)
        restarted = storage.MovieMetadataCache(path)
        assert (await restarted.status())['count'] == 3
        assert (await restarted.get('QA-1'))['title'] == 'waiting'
        assert (await restarted.get('QA-2'))['title'] == 'second'
    asyncio.run(exercise())
