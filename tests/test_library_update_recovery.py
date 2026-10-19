import asyncio
import json
import threading
from pathlib import Path

import pytest

from modules.history.service import ActorLibraryService, LocalMovieLibraryService
from modules.movies import local_library
from modules.movies.schemas import LocalLibraryInformationDownloadRequest


def library_service(directory):
    actors = ActorLibraryService(str(directory / 'actors.json'), str(directory / 'avatars'))
    return LocalMovieLibraryService(str(directory / 'library.json'), actor_library_service=actors)


def metadata(movie_id):
    return {'id': movie_id, 'title': f'{movie_id} enriched', 'date': '2026-10-01',
            'stars': ['Shared Actor'], 'actor_refs': [{'name': 'Shared Actor'}],
            'genres': ['Genre'], 'raw': {'id': movie_id}}


async def seed_library(directory, same_movie=False):
    service = library_service(directory)
    videos = []
    for index in range(2):
        root = directory / f'root-{index}'
        root.mkdir()
        movie_id = 'QA-001' if same_movie else f'QA-{index + 1:03d}'
        video = root / f'{movie_id}.mp4'
        video.write_bytes(b'video')
        videos.append(video)
        await service.update_from_scan(str(root), [{
            'movie_id': movie_id, 'path': str(video), 'file_name': video.name,
            'relative_path': video.name, 'size': 5, 'modified_at': '2026-01-01',
            'metadata': {'id': movie_id, 'title': movie_id, 'raw': {}},
            'scrape_status': 'skipped', 'full_text': movie_id,
        }])
    return service, videos


async def enrich(service, movie_id='QA-001'):
    return await service.update_information(movie_id, metadata(movie_id), 'found', None,
                                            f'{movie_id} searchable text', '2026-10-01', sync_actors=False)


def update_files(directory):
    return list((directory / 'library.json.updates').glob('*.json'))


def test_per_movie_metadata_and_media_updates_survive_reload_without_rewriting_the_library(tmp_path, monkeypatch):
    async def exercise():
        service, videos = await seed_library(tmp_path)
        path = tmp_path / 'library.json'
        original_bytes = path.read_bytes()
        full_saves = []
        save = service._save_locked

        async def counted_save():
            full_saves.append(1)
            await save()

        monkeypatch.setattr(service, '_save_locked', counted_save)
        assert await enrich(service)
        assert await service.update_file_media_info('QA-001', {str(videos[0]): {
            'width': 1920, 'height': 1080, 'bitrate': 5000000, 'codec': 'h264',
        }})
        assert full_saves == []
        assert path.read_bytes() == original_bytes
        assert update_files(tmp_path)
        recovered = await library_service(tmp_path).get_status('QA-001')
        record = recovered['record']
        assert record['metadata'] == metadata('QA-001')
        assert record['full_text'] == 'QA-001 searchable text'
        assert record['scrape_status'] == 'found'
        assert record['files'][0]['width'] == 1920
        assert record['files'][0]['bitrate'] == 5000000
        assert record['files'][0]['path'] == str(videos[0])
        assert record['files'][0]['scan_root'] == str(videos[0].parent)
        assert record['files'][0]['size'] == 5
        assert (await library_service(tmp_path).get_status('QA-002'))['record']['title'] == 'QA-002'
    asyncio.run(exercise())


@pytest.mark.parametrize('interruption', ['error', 'cancel'])
def test_information_workflow_flushes_successful_movies_when_later_assets_are_interrupted(tmp_path, monkeypatch, interruption):
    async def exercise():
        service, _ = await seed_library(tmp_path)
        monkeypatch.setattr(local_library, 'local_movie_library_service', service)
        second_started = asyncio.Event()
        flushed = []
        original_flush = getattr(service, 'flush_information_updates', None)

        async def tracked_flush():
            flushed.append(1)
            if original_flush is not None:
                await original_flush()

        async def scrape(movie_ids, concurrent):
            return {movie_id: {'metadata': metadata(movie_id), 'scrape_status': 'found',
                               'scrape_error': None, 'full_text': f'{movie_id} searchable text'} for movie_id in movie_ids}

        async def assets(movie_id, movie_metadata, request):
            if movie_id == 'QA-002':
                second_started.set()
                if interruption == 'error':
                    raise OSError('second movie asset failed')
                await asyncio.Future()
            return {}

        monkeypatch.setattr(service, 'flush_information_updates', tracked_flush, raising=False)
        monkeypatch.setattr(local_library, '_scrape_metadata', scrape)
        monkeypatch.setattr(local_library, '_write_local_library_information_assets', assets)
        task = asyncio.create_task(local_library.download_missing_local_library_information(
            LocalLibraryInformationDownloadRequest(fields=['title'], write_nfo=False, download_images=False)))
        await asyncio.wait_for(second_started.wait(), 5)
        if interruption == 'cancel':
            task.cancel()
        with pytest.raises(asyncio.CancelledError if interruption == 'cancel' else OSError):
            await task
        assert flushed == [1]
        recovered = library_service(tmp_path)
        await recovered.startup()
        assert (await recovered.get_status('QA-001'))['record']['title'] == 'QA-001 enriched'
        actors = (await recovered.actor_library_service.get_summary())['actors']
        assert any('QA-001' in actor['movie_ids'] for actor in actors)
    asyncio.run(exercise())


def test_failed_full_snapshot_preserves_the_old_json_and_committed_movie_updates(tmp_path, monkeypatch):
    async def exercise():
        service, _ = await seed_library(tmp_path)
        path = tmp_path / 'library.json'
        original_bytes = path.read_bytes()
        assert await enrich(service)
        replace = Path.replace

        def failed_snapshot(source, target):
            if Path(target) == path:
                raise OSError('snapshot publication failed')
            return replace(source, target)

        with monkeypatch.context() as failure:
            failure.setattr(Path, 'replace', failed_snapshot)
            with pytest.raises(OSError):
                await service.flush_information_updates()
        assert path.read_bytes() == original_bytes
        assert update_files(tmp_path)
        recovered = library_service(tmp_path)
        assert (await recovered.get_status('QA-001'))['record']['title'] == 'QA-001 enriched'
        await recovered.startup()
        assert any('QA-001' in actor['movie_ids'] for actor in (await recovered.actor_library_service.get_summary())['actors'])
    asyncio.run(exercise())


def test_missing_snapshot_does_not_discard_pending_movie_updates(tmp_path):
    async def exercise():
        service, _ = await seed_library(tmp_path)
        assert await enrich(service)
        path = tmp_path / 'library.json'
        path.unlink()
        pending = {file: file.read_bytes() for file in update_files(tmp_path)}
        actors = (tmp_path / 'actors.json').read_bytes()
        with pytest.raises(ValueError):
            await library_service(tmp_path).startup()
        assert not path.exists()
        assert pending == {file: file.read_bytes() for file in update_files(tmp_path)}
        assert (tmp_path / 'actors.json').read_bytes() == actors
    asyncio.run(exercise())


def test_delete_and_concurrent_metadata_update_cannot_resurrect_a_movie(tmp_path, monkeypatch):
    async def exercise():
        service, _ = await seed_library(tmp_path)
        assert await enrich(service)
        entered, release = asyncio.Event(), asyncio.Event()
        save = service._save_locked

        async def paused_save():
            entered.set()
            await release.wait()
            await save()

        monkeypatch.setattr(service, '_save_locked', paused_save)
        deletion = asyncio.create_task(service.delete_movie('QA-001'))
        await asyncio.wait_for(entered.wait(), 5)
        update = asyncio.create_task(enrich(service))
        release.set()
        deleted, updated = await asyncio.gather(deletion, update)
        assert deleted['deleted'] and updated is False
        recovered = library_service(tmp_path)
        await recovered.startup()
        assert not (await recovered.get_status('QA-001'))['in_local_library']
        assert (await recovered.get_status('QA-002'))['in_local_library']
    asyncio.run(exercise())


@pytest.mark.parametrize('damage', ['invalid_json', 'non_object', 'mismatched_movie_id', 'incomplete_record', 'invalid_files'])
def test_malformed_movie_updates_stop_startup_without_discarding_recovery_data(tmp_path, damage):
    async def exercise():
        service, _ = await seed_library(tmp_path)
        assert await enrich(service)
        path = update_files(tmp_path)[0]
        base_bytes = (tmp_path / 'library.json').read_bytes()
        if damage == 'invalid_json':
            damaged = '{broken'
        elif damage == 'non_object':
            damaged = '[]'
        else:
            payload = json.loads(path.read_text())

            def damage_record(value):
                if not isinstance(value, dict):
                    return False
                if value.get('movie_id') == 'QA-001':
                    if damage == 'incomplete_record':
                        value.clear()
                        value['movie_id'] = 'QA-001'
                    elif damage == 'invalid_files':
                        value['files'] = 'not a list of indexed files'
                    else:
                        value['movie_id'] = 'QA-INJECTED'
                    return True
                return any(damage_record(child) for child in value.values())

            assert damage_record(payload)
            damaged = json.dumps(payload)
        path.write_text(damaged)
        with pytest.raises(ValueError):
            await library_service(tmp_path).startup()
        assert path.read_text() == damaged
        assert (tmp_path / 'library.json').read_bytes() == base_bytes
    asyncio.run(exercise())


def test_old_updates_left_after_snapshot_cleanup_failure_cannot_revive_a_deleted_movie(tmp_path, monkeypatch):
    async def exercise():
        service, _ = await seed_library(tmp_path)
        assert await enrich(service)
        old_updates = set(update_files(tmp_path))
        unlink = Path.unlink

        def failed_cleanup(path, *args, **kwargs):
            if path in old_updates:
                raise OSError('old update cleanup failed')
            return unlink(path, *args, **kwargs)

        with monkeypatch.context() as failure:
            failure.setattr(Path, 'unlink', failed_cleanup)
            try:
                await service.delete_movie('QA-001')
            except OSError:
                pass
        assert 'QA-001' not in json.loads((tmp_path / 'library.json').read_text())['movies']
        assert any(path.exists() for path in old_updates)
        recovered = library_service(tmp_path)
        await recovered.startup()
        assert not (await recovered.get_status('QA-001'))['in_local_library']
        assert (await recovered.get_status('QA-002'))['in_local_library']
        assert all('QA-001' not in actor['movie_ids'] for actor in (await recovered.actor_library_service.get_summary())['actors'])
        assert not update_files(tmp_path), 'startup must retry cleanup of obsolete updates'
    asyncio.run(exercise())


def test_rescanning_one_root_keeps_another_root_and_its_pending_metadata(tmp_path):
    async def exercise():
        service, videos = await seed_library(tmp_path, same_movie=True)
        assert await enrich(service)
        await service.update_from_scan(str(videos[0].parent), [], remove_missing=True)
        recovered = library_service(tmp_path)
        await recovered.startup()
        record = (await recovered.get_status('QA-001'))['record']
        assert record['title'] == 'QA-001 enriched'
        assert [file['path'] for file in record['files']] == [str(videos[1])]
        assert record['files'][0]['scan_root'] == str(videos[1].parent)
    asyncio.run(exercise())


def test_startup_repairs_actors_after_snapshot_succeeds_but_actor_sync_fails(tmp_path, monkeypatch):
    async def exercise():
        service, _ = await seed_library(tmp_path)
        assert await enrich(service)

        async def failed_actor_sync(*args, **kwargs):
            raise OSError('actor projection unavailable')

        monkeypatch.setattr(service.actor_library_service, 'sync_from_movie_records', failed_actor_sync)
        with pytest.raises(OSError):
            await service.flush_information_updates()
        assert json.loads((tmp_path / 'library.json').read_text())['movies']['QA-001']['title'] == 'QA-001 enriched'
        recovered = library_service(tmp_path)
        await recovered.startup()
        actors = (await recovered.actor_library_service.get_summary())['actors']
        assert any('QA-001' in actor['movie_ids'] for actor in actors)
    asyncio.run(exercise())


def test_actor_sync_cannot_clear_recovery_for_a_newer_movie_revision(tmp_path, monkeypatch):
    async def exercise():
        service, _ = await seed_library(tmp_path)
        assert await enrich(service)
        entered, release = asyncio.Event(), asyncio.Event()
        sync = service.actor_library_service.sync_from_movie_records

        async def paused_actor_sync(*args, **kwargs):
            entered.set()
            await release.wait()
            return await sync(*args, **kwargs)

        monkeypatch.setattr(service.actor_library_service, 'sync_from_movie_records', paused_actor_sync)
        flushing = asyncio.create_task(service.flush_information_updates())
        await asyncio.wait_for(entered.wait(), 5)
        assert await enrich(service, 'QA-002')
        release.set()
        await flushing
        recovered = library_service(tmp_path)
        await recovered.startup()
        actors = (await recovered.actor_library_service.get_summary())['actors']
        assert any(set(actor['movie_ids']) == {'QA-001', 'QA-002'} for actor in actors)
    asyncio.run(exercise())


@pytest.mark.parametrize('update_kind', ['metadata', 'media'])
def test_file_state_refresh_updates_the_current_record_after_a_concurrent_movie_update(tmp_path, monkeypatch, update_kind):
    async def exercise():
        service, videos = await seed_library(tmp_path)
        videos[0].with_suffix('.nfo').write_text('newly created NFO')
        entered, release = threading.Event(), threading.Event()
        scan = service._scan_file_states

        def paused_scan(files):
            entered.set()
            assert release.wait(5)
            return scan(files)

        monkeypatch.setattr(service, '_scan_file_states', paused_scan)
        refreshing = asyncio.create_task(service.refresh_file_states(['QA-001']))
        assert await asyncio.to_thread(entered.wait, 5)
        try:
            if update_kind == 'metadata':
                assert await enrich(service)
            else:
                assert await service.update_file_media_info('QA-001', {str(videos[0]): {'width': 1920}})
        finally:
            release.set()
        await refreshing
        record = (await service.get_status('QA-001'))['record']
        assert record['files'][0]['filesystem']['nfo'] is True
        recovered = library_service(tmp_path)
        assert (await recovered.get_status('QA-001'))['record']['files'][0]['filesystem']['nfo'] is True
    asyncio.run(exercise())
