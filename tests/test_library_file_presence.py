import asyncio
from pathlib import Path

import pytest

from modules.history.service import LocalMovieLibraryService


def test_library_reports_existing_and_missing_indexed_files_without_mutating_records(tmp_path):
    present = tmp_path / "ABP-123.mp4"
    present.write_bytes(b"fixture")
    missing = tmp_path / "ABP-123-CD2.mp4"
    service = LocalMovieLibraryService(str(tmp_path / "library.json"))

    async def check():
        await service.update_from_scan(str(tmp_path), [
            {"movie_id": "ABP-123", "path": str(present), "size": 7},
            {"movie_id": "ABP-123", "path": str(missing), "size": 7},
        ])
        record = (await service.get_summary())["records"][0]
        assert [file["exists"] for file in record["files"]] == [True, False]
        assert "exists" not in (await service.get_all())[0]["files"][0]

    asyncio.run(check())


@pytest.mark.parametrize(("case_sensitive", "readable"), [(False, True), (True, True), (False, False)])
def test_file_verification_respects_filesystem_case_sensitivity(tmp_path, monkeypatch, case_sensitive, readable):
    names = {"QA-001.MP4", "QA-001.NFO", "QA-001-POSTER.JPG", "QA-001-THUMB.JPG"}
    for name in names:
        (tmp_path / name).write_bytes(b"fixture")
    is_file = Path.is_file

    def filesystem_is_file(path):
        if path.parent == tmp_path:
            if not readable:
                raise PermissionError("unreadable fixture")
            return path.name in names if case_sensitive else path.name.upper() in names
        return is_file(path)

    monkeypatch.setattr(Path, "is_file", filesystem_is_file)
    video = tmp_path / "QA-001.mp4"
    service = LocalMovieLibraryService(str(tmp_path / "library.json"))
    state = service._scan_file_states([{"path": str(video)}])[str(video)]
    assert {key: state[key] for key in ("exists", "nfo", "poster", "thumbnail")} == dict.fromkeys(
        ("exists", "nfo", "poster", "thumbnail"), readable and not case_sensitive,
    )
