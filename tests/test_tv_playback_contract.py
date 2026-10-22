"""The native TV player consumes the same indexed original-file HTTP endpoint."""
import asyncio

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from modules.movies.router import local_movie_library_service, router


def test_tv_player_can_seek_indexed_files_and_receives_missing_file_errors(tmp_path, monkeypatch):
    video = tmp_path / "fixture.mp4"
    video.write_bytes(b"0123456789")

    async def indexed_file(movie_id, file_index):
        return video if movie_id == "TV-001" and file_index == 2 else None

    monkeypatch.setattr(local_movie_library_service, "get_video_file_path", indexed_file)
    app = FastAPI()
    app.include_router(router)

    async def check():
        async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
            url = "/api/movies/local-library/TV-001/play?file_index=2"
            response = await client.get(url)
            assert response.status_code == 200
            assert response.content == b"0123456789"
            etag = response.headers["etag"]
            response = await client.get(url, headers={"Range": "bytes=2-5"})
            assert response.status_code == 206
            assert response.headers["content-range"] == "bytes 2-5/10"
            assert response.content == b"2345"
            response = await client.get(url, headers={"Range": "bytes=-3", "If-Range": etag})
            assert response.status_code == 206
            assert response.content == b"789"
            response = await client.get(url, headers={"Range": "bytes=2-5", "If-Range": '"old-file"'})
            assert response.status_code == 200
            assert response.content == b"0123456789"
            assert (await client.get(url, headers={"Range": "bytes=100-"})).status_code == 416
            assert (await client.get(url.replace("index=2", "index=1"))).status_code == 404

    asyncio.run(check())
