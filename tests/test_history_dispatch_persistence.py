import asyncio
import copy
import json
from pathlib import Path
import threading
from types import SimpleNamespace

import pytest

from modules.history import service as history


def ready_history(tmp_path):
    path = tmp_path / 'history.json'
    record = {'movie_id': 'QA-1', 'download_time': '2020-01-01', 'title': 'old',
        'download_resources': [{'link': 'magnet:old', 'source': 'javbus'}], 'download_links': ['magnet:old'],
        'failed_resources': [{'link': 'magnet:retry', 'source': 'cilisousuo'}],
        'custom': {'preserve': ['value']}, 'status': 'failed'}
    path.write_text(json.dumps([record]))
    service = history.DownloadHistoryService(str(path))
    service._loaded = True
    service._cache = {'QA-1': copy.deepcopy(record)}
    return service, path


@pytest.fixture
def metadata(monkeypatch):
    calls = []

    async def fetch(movie_id):
        calls.append(movie_id)
        return {'id': movie_id, 'title': 'new', 'stars': [{'name': 'Actor'}], 'genres': [{'name': 'Genre'}]}

    monkeypatch.setattr(history.javbus_api_service, 'get_movie_detail', fetch)
    return calls


@pytest.mark.parametrize('outcome', ['success', 'mixed', 'failure', 'skipped'])
def test_dispatch_persists_one_complete_snapshot_off_loop(tmp_path, monkeypatch, metadata, outcome):
    service, path = ready_history(tmp_path)
    encoded = []
    dump, dumps = json.dump, json.dumps
    loop_thread = threading.get_ident()

    def tracked_dump(payload, *args, **kwargs):
        encoded.append((copy.deepcopy(payload), threading.get_ident()))
        return dump(payload, *args, **kwargs)

    def tracked_dumps(payload, *args, **kwargs):
        encoded.append((copy.deepcopy(payload), threading.get_ident()))
        return dumps(payload, *args, **kwargs)

    results = [{'movie_id': 'qa-1', 'magnet': 'magnet:retry', 'source': 'CILISOUSUO',
                'success': outcome != 'failure', 'skipped': outcome == 'skipped'}]
    if outcome == 'mixed':
        results.append({'movie_id': 'QA-2', 'magnet': 'magnet:failed', 'source': 'javbus', 'success': False})
    monkeypatch.setattr(json, 'dump', tracked_dump)
    monkeypatch.setattr(json, 'dumps', tracked_dumps)

    async def exercise():
        await service.record_dispatch_results(results, 'aria2')
        assert len(encoded) == (0 if outcome == 'skipped' else 1), 'one dispatch batch needs only one durable snapshot'
        assert all(thread != loop_thread for _, thread in encoded)
        assert json.loads(path.read_text()) == (encoded[-1][0] if encoded else list(service._cache.values()))
        if outcome != 'skipped':
            record = service._cache['QA-1']
            assert record['custom'] == {'preserve': ['value']} and record['download_time'] == '2020-01-01'
            assert record['download_tool'] == 'aria2'
            assert await service.is_magnet_downloaded('QA-1', 'magnet:retry') is (outcome != 'failure')
            assert bool(record['failed_resources']) is (outcome == 'failure')
        if outcome == 'mixed':
            assert not await service.is_magnet_downloaded('QA-2', 'magnet:failed')
            assert service._cache['QA-2']['status'] == 'failed'
    asyncio.run(exercise())
    assert metadata == ([] if outcome in {'failure', 'skipped'} else ['QA-1'])


def test_mixed_same_movie_preserves_input_order_links_and_metadata_deduplication(tmp_path, metadata):
    service, _ = ready_history(tmp_path)

    async def exercise():
        await service.record_dispatch_results([
            {'movie_id': 'qa-1', 'magnet': 'MAGNET:new', 'source': '', 'success': True},
            {'movie_id': 'QA-1', 'magnet': 'magnet:new', 'source': 'JAVBUS', 'success': True},
            {'movie_id': 'QA-1', 'magnet': 'magnet:retry', 'success': False},
            {'movie_id': 'qa-1', 'magnet': 'MAGNET:RETRY', 'source': 'cilisousuo', 'success': True},
            {'movie_id': 'QA-1', 'magnet': 'magnet:new', 'source': 'javbus', 'success': False},
        ], 'pan115')
        record = service._cache['QA-1']
        assert record['download_resources'] == [{'link': 'magnet:old', 'source': 'javbus'},
            {'link': 'MAGNET:new', 'source': 'javbus'}, {'link': 'MAGNET:RETRY', 'source': 'cilisousuo'}]
        assert [item['link'] for item in record['failed_resources']] == ['magnet:new']
        assert record['status'] == 'failed' and record['download_tool'] == 'pan115'
        assert await service.is_magnet_downloaded('QA-1', 'magnet:new')
    asyncio.run(exercise())
    assert metadata == ['QA-1']


@pytest.mark.parametrize('operation', ['save', 'dispatch', 'clear', 'dismiss'])
def test_atomic_write_failure_preserves_old_file_and_published_records(tmp_path, monkeypatch, metadata, operation):
    service, path = ready_history(tmp_path)
    original_file, original_cache = path.read_bytes(), copy.deepcopy(service._cache)
    replace = Path.replace

    def denied(source, target):
        if Path(target) == path:
            raise PermissionError('history cannot be replaced')
        return replace(source, target)

    monkeypatch.setattr(Path, 'replace', denied)

    async def exercise():
        with pytest.raises(PermissionError):
            if operation == 'save':
                await service.save_movies(['QA-1'], ['magnet:new'])
            elif operation == 'dispatch':
                await service.record_dispatch_results([{'movie_id': 'QA-1', 'magnet': 'magnet:retry', 'success': True}], 'aria2')
            elif operation == 'clear':
                await service.clear()
            else:
                await service.dismiss_failure('QA-1', 'magnet:retry')
        assert path.read_bytes() == original_file
        assert service._cache == original_cache
        assert not list(tmp_path.glob('*.tmp'))
    asyncio.run(exercise())


@pytest.mark.parametrize('operation', ['load', 'save', 'clear', 'dismiss', 'check'])
def test_history_load_mutation_and_library_check_run_on_workers(tmp_path, monkeypatch, metadata, operation):
    service, _ = ready_history(tmp_path)
    threads = []
    loop_thread = threading.get_ident()
    load, dump, dumps = json.load, json.dump, json.dumps
    resources = history._extract_download_resources

    def tracked_load(*args, **kwargs):
        threads.append(threading.get_ident())
        return load(*args, **kwargs)

    def tracked_dump(*args, **kwargs):
        threads.append(threading.get_ident())
        return dump(*args, **kwargs)

    def tracked_dumps(*args, **kwargs):
        threads.append(threading.get_ident())
        return dumps(*args, **kwargs)

    def tracked_resources(*args, **kwargs):
        threads.append(threading.get_ident())
        return resources(*args, **kwargs)

    monkeypatch.setattr(json, 'load', tracked_load)
    monkeypatch.setattr(json, 'dump', tracked_dump)
    monkeypatch.setattr(json, 'dumps', tracked_dumps)
    if operation == 'check':
        monkeypatch.setattr(history, '_extract_download_resources', tracked_resources)

    async def exercise():
        if operation == 'load':
            service._loaded = False
            await service.load_records()
        elif operation == 'save':
            await service.save_movies(['QA-1'], ['magnet:new'])
        elif operation == 'clear':
            await service.clear()
        elif operation == 'dismiss':
            await service.dismiss_failure('QA-1', 'magnet:retry')
        else:
            async def local_records():
                return {'QA-1': {}}
            result = await service.check_against_local_library(SimpleNamespace(load_records=local_records))
            assert result['in_library_count'] == 1
        assert threads and all(thread != loop_thread for thread in threads)
    asyncio.run(exercise())


@pytest.mark.parametrize('operation', ['dispatch', 'save', 'clear', 'dismiss', 'load'])
def test_cancel_waits_for_disk_and_cache_commit_before_releasing_lock(tmp_path, monkeypatch, metadata, operation):
    service, path = ready_history(tmp_path)
    if operation == 'load':
        path.unlink()
        service._loaded = False
        service._cache = {}
    entered, release = threading.Event(), threading.Event()
    published, original_records = service._cache, copy.deepcopy(service._cache)
    dump = json.dump
    first_call = True
    loop_thread = threading.get_ident()

    def blocked_dump(payload, *args, **kwargs):
        nonlocal first_call
        assert threading.get_ident() != loop_thread, 'disk writes must not block the event loop'
        result = dump(payload, *args, **kwargs)
        if first_call:
            first_call = False
            entered.set()
            assert release.wait(5)
        return result

    monkeypatch.setattr(json, 'dump', blocked_dump)

    async def change():
        if operation == 'dispatch':
            await service.record_dispatch_results([{'movie_id': 'QA-1', 'magnet': 'magnet:retry', 'success': True}], 'aria2')
        elif operation == 'save':
            await service.save_movies(['QA-1'], ['magnet:new'])
        elif operation == 'clear':
            await service.clear()
        elif operation == 'dismiss':
            await service.dismiss_failure('QA-1', 'magnet:retry')
        else:
            await service.load_records()

    async def exercise():
        first = asyncio.create_task(change())
        second = None
        try:
            assert await asyncio.to_thread(entered.wait, 1)
            assert service._cache is published and service._cache == original_records
            first.cancel()
            second = asyncio.create_task(service.get_history())
            await asyncio.sleep(0.02)
            assert not second.done(), 'a cancelled writer must still own its lock until cache publication'
        finally:
            release.set()
            outcomes = await asyncio.gather(first, *([second] if second else []), return_exceptions=True)
        assert isinstance(outcomes[0], asyncio.CancelledError)
        assert service._loaded
        restarted = history.DownloadHistoryService(str(path))
        assert await service.get_history() == await restarted.get_history()
        if operation == 'dispatch':
            record = service._cache['QA-1']
            assert record['status'] == 'submitted' and record['download_tool'] == 'aria2'
            assert not record['failed_resources']
    asyncio.run(exercise())


def test_waiting_for_remote_metadata_does_not_freeze_readers_or_restore_cleared_records(tmp_path, monkeypatch):
    service, _ = ready_history(tmp_path)

    async def exercise():
        entered, release = asyncio.Event(), asyncio.Event()

        async def metadata(movie_id):
            entered.set()
            await release.wait()
            return {'id': movie_id, 'title': 'new'}

        monkeypatch.setattr(history.javbus_api_service, 'get_movie_detail', metadata)
        task = asyncio.create_task(service.save_movies(['QA-2'], ['magnet:new']))
        await entered.wait()
        assert (await asyncio.wait_for(service.get_history(), 0.5))[0]['movie_id'] == 'QA-1'
        await service.clear()
        release.set()
        await task
        assert set(service._cache) == {'QA-2'}
    asyncio.run(exercise())


def test_download_status_uses_one_record_snapshot_during_concurrent_publication(tmp_path, monkeypatch):
    service, _ = ready_history(tmp_path)
    extract = history._extract_download_resources
    calls = []

    def publish_after_extract(record):
        calls.append(record)
        result = extract(record)
        service._cache = {'QA-1': {'movie_id': 'QA-1', 'download_resources': [], 'failed_resources': []}}
        return result

    monkeypatch.setattr(history, '_extract_download_resources', publish_after_extract)
    state = asyncio.run(service.get_downloaded_movie_status('qa-1'))
    assert state['is_downloaded'] is True
    assert state['download_links'] == ['magnet:old']
    assert state['download_resources'] == [{'link': 'magnet:old', 'source': 'javbus'}]
    assert len(calls) == 1


@pytest.mark.parametrize('operation', ['save', 'dispatch'])
def test_each_transaction_copies_an_affected_existing_movie_only_once(tmp_path, monkeypatch, metadata, operation):
    service, _ = ready_history(tmp_path)
    untouched = {'movie_id': 'QA-OTHER', 'download_resources': [{'link': 'magnet:other', 'source': 'javbus'}]}
    service._cache['QA-OTHER'] = untouched
    original, copies = copy.deepcopy, []

    def counted_copy(value, *args, **kwargs):
        if isinstance(value, dict) and value.get('movie_id'):
            copies.append(value['movie_id'])
        return original(value, *args, **kwargs)

    monkeypatch.setattr(history.copy, 'deepcopy', counted_copy)
    results = [{'movie_id': 'qa-1' if index % 2 else 'QA-1', 'magnet': f'magnet:new-{index}',
                'source': 'javbus', 'success': True} for index in range(50)]
    results.append({'movie_id': 'QA-NEW', 'magnet': 'magnet:new-movie', 'source': 'javbus', 'success': True})

    async def exercise():
        if operation == 'save':
            await service.save_movies([item['movie_id'] for item in results],
                [item['magnet'] for item in results], [item['source'] for item in results])
        else:
            await service.record_dispatch_results(results, 'aria2')
        assert copies == ['QA-1'], 'only previously published affected records require one transaction copy'
        assert service._cache['QA-OTHER'] is untouched
        assert len(service._cache['QA-1']['download_resources']) == 51
        assert service._cache['QA-NEW']['download_links'] == ['magnet:new-movie']
    asyncio.run(exercise())
