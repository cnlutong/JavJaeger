import asyncio

import pytest

from modules.movies import local_scrape


@pytest.mark.parametrize(
    ("filename", "expected"),
    [
        ("KIWVR-800", "KIWVR-800"),
        ("SDJS-360", "SDJS-360"),
    ],
)
def test_recognizes_designation_with_resolution_like_number(filename, expected):
    assert local_scrape.recognize_designation(filename) == expected


@pytest.mark.parametrize("filename", ["movie-1080p", "movie-360p"])
def test_does_not_recognize_plain_resolution_marker(filename):
    assert local_scrape.recognize_designation(filename) is None


def test_manual_designation_rebuilds_preview_and_rejects_unscanned_paths(tmp_path):
    video = tmp_path / 'unknown.mp4'
    video.write_bytes(b'fixture')
    request = local_scrape.LocalScrapePreviewRequest(
        directory=str(tmp_path), scrape=False, naming_template='{code}',
        code_overrides={str(video): 'ABP-123'},
    )
    payload = asyncio.run(local_scrape.preview_local_scrape(request))
    assert payload['success']
    assert payload['items'][0]['code'] == 'ABP-123'
    assert payload['items'][0]['target_video_path'].endswith('ABP-123.mp4')
    assert video.read_bytes() == b'fixture', 'preview must not rename or modify files'

    request.code_overrides = {str(tmp_path.parent / 'outside.mp4'): 'ABP-123'}
    assert not asyncio.run(local_scrape.preview_local_scrape(request))['success']
    request.code_overrides = {str(video): '../invalid'}
    assert not asyncio.run(local_scrape.preview_local_scrape(request))['success']
