import asyncio

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from modules.movies.router import local_movie_library_service, router
from modules.movies.subtitles import MAX_SUBTITLE_BYTES, subtitle_files


def test_container_specific_subtitles_override_shared_tracks_without_cross_loading(tmp_path):
    mp4, mkv = tmp_path / "QA-001.mp4", tmp_path / "QA-001.mkv"
    for path in (mp4, mkv):
        path.write_bytes(b"video")
    for name in ("QA-001.zh-Hans.vtt", "QA-001.mp4.zh-Hans.srt", "QA-001.mkv.zh-Hans.vtt"):
        (tmp_path / name).write_text("subtitle")
    assert [(p.name, language) for _, p, language, _ in subtitle_files(mp4)] == [("QA-001.mp4.zh-Hans.srt", "zh-Hans")]
    assert [(p.name, language) for _, p, language, _ in subtitle_files(mkv)] == [("QA-001.mkv.zh-Hans.vtt", "zh-Hans")]
    (tmp_path / "QA-001.mp4.zh-Hans.vtt").write_text("subtitle")
    assert subtitle_files(mp4)[0][1].name == "QA-001.mp4.zh-Hans.vtt"


def test_indexed_sidecars_are_deduplicated_scoped_and_served_as_webvtt(tmp_path, monkeypatch):
    video = tmp_path / "QA-001.mp4"
    second = tmp_path / "QA-001-CD2.mp4"
    video.write_bytes(b"video")
    second.write_bytes(b"video")
    vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n测试中文字幕\n"
    (tmp_path / "QA-001.zh-Hans.vtt").write_text(vtt, encoding="utf-8")
    (tmp_path / "QA-001.zh-Hans.srt").write_text("duplicate", encoding="utf-8")
    (tmp_path / "QA-001.ja.srt").write_text("1\r\n00:00:00,100 --> 00:00:02,200\r\nテスト\r\n", encoding="utf-8-sig")
    (tmp_path / "QA-001-CD2.zh-Hans.srt").write_text("1\n00:00:00,000 --> 00:00:01,000\n第二段", encoding="utf-8")
    (tmp_path / "QA-0010.zh.vtt").write_text(vtt)
    outside = tmp_path.parent / (tmp_path.name + "-private.txt")
    outside.write_text("private")
    (tmp_path / "QA-001.en.vtt").symlink_to(outside)
    oversized = tmp_path / "QA-001.huge.vtt"
    with oversized.open("wb") as file:
        file.truncate(MAX_SUBTITLE_BYTES + 1)

    async def indexed_file(movie_id, file_index):
        return [video, second][file_index] if movie_id == "QA-001" and file_index in (0, 1) else None

    monkeypatch.setattr(local_movie_library_service, "get_video_file_path", indexed_file)
    app = FastAPI()
    app.include_router(router)

    async def check():
        async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
            base = "/api/movies/local-library/QA-001/subtitles"
            response = await client.get(base)
            assert response.status_code == 200
            tracks = response.json()["subtitles"]
            assert [(track["language"], track["default"]) for track in tracks] == [("zh-Hans", True), ("ja", False)]
            assert all(set(track) == {"id", "label", "language", "default"} for track in tracks)
            response = await client.get(base + "/" + tracks[0]["id"])
            assert response.text == vtt
            assert response.headers["content-type"] == "text/vtt; charset=utf-8"
            japanese = await client.get(base + "/" + tracks[1]["id"])
            assert japanese.text.startswith("WEBVTT\n\n")
            assert "00:00:00.100 --> 00:00:02.200" in japanese.text
            assert "テスト" in japanese.text
            assert (await client.get(base + "/" + tracks[0]["id"] + "?file_index=1")).status_code == 404
            assert len((await client.get(base + "?file_index=1")).json()["subtitles"]) == 1
            assert (await client.get(base + "?file_index=-1")).status_code == 404
            assert (await client.get(base.replace("QA-001", "unknown"))).status_code == 404
            assert (await client.get(base + "/arbitrary-file")).status_code == 404
            (tmp_path / "QA-001.zh-Hans.vtt").write_bytes(b"invalid vtt")
            assert (await client.get(base + "/" + tracks[0]["id"])).status_code == 422
            (tmp_path / "QA-001.zh-Hans.vtt").unlink()
            assert (await client.get(base + "/" + tracks[0]["id"])).status_code == 404
            (tmp_path / "QA-001-CD2.zh-Hans.srt").unlink()
            assert (await client.get(base + "?file_index=1")).json() == {"subtitles": []}

    asyncio.run(check())
