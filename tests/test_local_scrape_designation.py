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
