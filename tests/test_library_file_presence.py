import asyncio

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
