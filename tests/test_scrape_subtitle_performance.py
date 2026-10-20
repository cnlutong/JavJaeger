import asyncio
from pathlib import Path
import threading

import pytest

from modules.movies import local_scrape as scrape
from modules.movies.schemas import LocalScrapeApplyRequest


def request_for(videos, **options):
    return LocalScrapeApplyRequest(items=[{'source_path': str(video), 'code': f'OUT-{index + 100}',
        'metadata': {'id': f'OUT-{index + 100}', 'title': 'fixture'}} for index, video in enumerate(videos)],
        write_nfo=False, download_images=False, download_actor_images=False, download_list_thumbnail=False, **options)


def test_apply_reuses_one_directory_scan_and_keeps_subtitle_io_off_loop(tmp_path, monkeypatch):
    videos = [tmp_path / f'ABP-{index + 100}.mp4' for index in range(200)]
    for video in videos:
        video.write_bytes(b'video fixture')
        video.with_suffix('.zh.srt').write_text('subtitle fixture')
    enumerations, visited, checks = [], [], []
    loop_thread = threading.get_ident()
    iterdir, is_file = Path.iterdir, Path.is_file

    def tracked_iterdir(directory):
        enumerations.append(threading.get_ident())
        for entry in iterdir(directory):
            visited.append(1)
            yield entry

    def tracked_is_file(path, *args, **kwargs):
        checks.append(1)
        return is_file(path, *args, **kwargs)

    monkeypatch.setattr(Path, 'iterdir', tracked_iterdir)
    monkeypatch.setattr(Path, 'is_file', tracked_is_file)
    monkeypatch.setattr(scrape, '_build_library_record_for_applied_video', lambda *args: None)
    result = asyncio.run(scrape.apply_local_scrape(request_for(videos, organize=False)))
    assert result['success'] and result['success_count'] == 200
    assert len(enumerations) == 1, 'one source directory must not be enumerated again for every movie'
    assert len(visited) == 400 and len(checks) < 20 * len(videos)
    assert all(thread != loop_thread for thread in enumerations)
    assert all(len(item['moved_assets']) == 1 for item in result['results'])


@pytest.mark.parametrize('name, matches', [
    ('ABP-001.srt', True), ('abp-001.ZH.ASS', True), ('ABP-001-CD1.sup', True),
    ('ABP-001_en.idx', True), ('ABP-0010.srt', False), ('ABP-001extra.srt', False),
    ('ABP-001.zh.txt', False), ('other.srt', False),
])
def test_subtitle_matching_preserves_extension_case_and_stem_boundaries(tmp_path, name, matches):
    video = tmp_path / 'ABP-001.mp4'
    assert scrape._subtitle_matches(video, tmp_path / name) is matches
    assert not scrape._subtitle_matches(video, tmp_path / 'another-directory' / name)


def test_batch_does_not_reuse_a_subtitle_moved_by_an_earlier_overlapping_stem(tmp_path, monkeypatch):
    source, target = tmp_path / 'source', tmp_path / 'target'
    source.mkdir()
    videos = [source / 'ABP-001.mp4', source / 'ABP-001-CD1.mp4']
    for video in videos:
        video.write_bytes(b'video')
    (source / 'ABP-001-CD1.zh.srt').write_text('shared subtitle')
    monkeypatch.setattr(scrape, '_build_library_record_for_applied_video', lambda *args: None)
    result = asyncio.run(scrape.apply_local_scrape(request_for(videos, organize=True,
        target_directory=str(target), naming_template='{code}', folder_template='')))
    assert result['success']
    assert len(result['results'][0]['moved_assets']) == 1
    assert result['results'][1]['moved_assets'] == []
    assert (target / 'OUT-100-CD1.zh.srt').read_text() == 'shared subtitle'


def test_same_directory_rename_updates_subtitles_visible_to_later_movies(tmp_path, monkeypatch):
    videos = [tmp_path / 'intro.mp4', tmp_path / 'OUT-100-CD1.mp4']
    for video in videos:
        video.write_bytes(b'video')
    (tmp_path / 'intro-CD1.zh.srt').write_text('renamed subtitle')
    monkeypatch.setattr(scrape, '_build_library_record_for_applied_video', lambda *args: None)
    result = asyncio.run(scrape.apply_local_scrape(request_for(videos, organize=True,
        target_directory=str(tmp_path), naming_template='{code}', folder_template='')))
    assert result['success']
    assert result['results'][1]['moved_assets'] == [str(tmp_path / 'OUT-101-cd1.zh.srt')]
    assert (tmp_path / 'OUT-101-cd1.zh.srt').read_text() == 'renamed subtitle'


def test_failed_directory_read_returns_empty_and_retries_for_the_next_movie(tmp_path, monkeypatch):
    videos = [tmp_path / 'ABP-001.mp4', tmp_path / 'ABP-002.mp4']
    for video in videos:
        video.write_bytes(b'video')
        video.with_suffix('.zh.srt').write_text('subtitle')
    original_iterdir = Path.iterdir
    attempts = []

    def temporarily_denied(directory):
        attempts.append(1)
        if len(attempts) == 1:
            raise PermissionError('temporarily unreadable')
        return original_iterdir(directory)

    monkeypatch.setattr(Path, 'iterdir', temporarily_denied)
    monkeypatch.setattr(scrape, '_build_library_record_for_applied_video', lambda *args: None)
    result = asyncio.run(scrape.apply_local_scrape(request_for(videos, organize=False)))
    assert result['success']
    assert result['results'][0]['moved_assets'] == []
    assert result['results'][1]['moved_assets'] == [str(videos[1].with_suffix('.zh.srt'))]
    assert len(attempts) == 2


def test_subtitle_enumeration_order_is_preserved(tmp_path, monkeypatch):
    video = tmp_path / 'ABP-001.mp4'
    video.write_bytes(b'video')
    subtitles = [tmp_path / 'ABP-001_zh.srt', tmp_path / 'ABP-001.en.srt', tmp_path / 'ABP-001.ass']
    for subtitle in subtitles:
        subtitle.write_text('subtitle')
    monkeypatch.setattr(Path, 'iterdir', lambda parent: iter([video, *subtitles]))
    monkeypatch.setattr(scrape, '_build_library_record_for_applied_video', lambda *args: None)
    result = asyncio.run(scrape.apply_local_scrape(request_for([video], organize=False)))
    assert result['success']
    assert result['results'][0]['moved_assets'] == [str(subtitle) for subtitle in subtitles]
