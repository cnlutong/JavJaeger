import asyncio
from pathlib import Path

import pytest

from modules.movies import local_scrape


DECORATED_FILENAMES = [
    ("4k2.me@snos-359.mp4", "SNOS-359"),
    ("489155.com@EKDV-830_4KS.mp4", "EKDV-830"),
    ("@vdd-069-1K-ltx.mp4", "VDD-069"),
    ("489155.com@EKDV_831_4KS.mp4", "EKDV-831"),
    ("abc-123.com@SNOS_360_HEVC-265.mp4", "SNOS-360"),
    ("abc-123.com@snos359.mp4", "SNOS-359"),
    ("snos359@abc-123.com.mp4", "SNOS-359"),
    ("[www.abc-123.net] EKDV 830 [1080p x265].mkv", "EKDV-830"),
    ("SNOS-359_HEVC-265.mp4", "SNOS-359"),
    ("c800.me@ssni00048hhb.mp4", "SSNI-048"),
    ("489155.com@FC2-PPV-1234567_4KS.mp4", "FC2-1234567"),
    ("4k2.me@FC2_PPV_1234567.mp4", "FC2-1234567"),
    ("FC2-1234567.mp4", "FC2-1234567"),
    ("@300MIUM-001_4KS.mp4", "300MIUM-001"),
    ("@T28-001-CD1.mp4", "T28-001"),
    ("@123456_001_4KS.mp4", "123456-001"),
]


@pytest.mark.parametrize(("filename", "expected"), DECORATED_FILENAMES)
def test_recognizes_decorated_video_filename(filename, expected):
    assert local_scrape.recognize_designation(filename) == expected
    assert local_scrape.recognize_designation(Path(filename).stem) == expected


@pytest.mark.parametrize(
    "filename",
    ["abc-123.com.mp4", "HEVC-265.mp4", "ABCDEFG-123.mp4", "ABP-123456.mp4", "FC2-PPV-123456789.mp4"],
)
def test_does_not_recognize_site_codec_or_partial_designation(filename):
    assert local_scrape.recognize_designation(filename) is None


def test_scrape_preview_uses_clean_codes_for_metadata_and_target_names(tmp_path, monkeypatch):
    source = tmp_path / "inbox"
    source.mkdir()
    expected = dict(DECORATED_FILENAMES[:5])
    for filename in expected:
        (source / filename).write_bytes(b"fixture")
    fetched = []

    async def fake_scrape(movie_id, fallback_title):
        fetched.append(movie_id)
        return {"metadata": {"id": movie_id, "title": "Example"}, "source": "fixture", "scrape_status": "found"}

    monkeypatch.setattr(local_scrape, "scrape_movie_metadata", fake_scrape)
    output = tmp_path / "library"
    payload = asyncio.run(local_scrape.preview_local_scrape(local_scrape.LocalScrapePreviewRequest(
        directory=str(source), target_directory=str(output), naming_template="{code}", folder_template="",
    )))

    assert payload["success"]
    assert {item["file_name"]: item["code"] for item in payload["items"]} == expected
    assert sorted(fetched) == sorted(expected.values())
    for item in payload["items"]:
        assert item["scrape_status"] == "found"
        assert item["target_video_path"] == str(output / f'{item["code"]}.mp4')
        assert (source / item["file_name"]).read_bytes() == b"fixture"
    assert not output.exists(), "preview must not create or move output files"


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
