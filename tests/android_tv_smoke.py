"""Isolated Android TV workflow. Requires a disposable emulator, adb and a built APK.

python3 tests/android_tv_smoke.py --serial emulator-5556 --apk android-tv/app/build/outputs/apk/debug/app-debug.apk
The checked-in synthetic MP4 needs no FFmpeg or real server/account at test time.
"""

import argparse
import json
import re
import struct
import subprocess
import threading
import time
import xml.etree.ElementTree as ET
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


PACKAGE = "com.javjaeger.tv"
MOVIE = {
    "movie_id": "TV-001", "title": "遥控器测试影片", "date": "2026-01-01",
    "metadata": {"plot": "Synthetic playback fixture", "stars": [{"name": "QA演员"}],
                 "genres": [{"name": "QA 标签"}]},
    "studio": "QA Studio", "updated_at": "2026-10-20", "total_size": 3000000000,
    "media_info": {"height": 1080},
    "files": [{"file_name": "part-1.mp4", "exists": True},
              {"file_name": "missing.mp4", "exists": False},
              {"file_name": "part-3.mp4", "exists": True}],
}
MOVIES = [MOVIE, {
    **MOVIE, "movie_id": "TV-002", "title": "另一部影片", "is_vr": True,
    "metadata": {"stars": ["另一位演员"], "genres": ["第二标签"]},
    "media_info": {"height": 2160}, "cover_url": "https://art.example/cover.jpg",
}] + [{**MOVIE, "movie_id": f"PAGE-{index:03d}", "title": f"分页测试影片 {index}",
       "metadata": {"stars": ["分页演员"], "genres": ["Paging"]},
       "files": [{"file_name": "fixture.mp4", "exists": True}]} for index in range(1, 64)]


def cover_dimensions(movie_id):
    if movie_id in ("TV-002", "ONLINE-002"):
        return 160, 240
    if movie_id.startswith("PAGE-") and int(movie_id.split("-")[1]) % 3 == 1:
        return 240, 240
    return 480, 270


def cover_png(width, height, avatar=False):
    """Synthetic cover corners or a geometric actor avatar; never real artwork."""
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)

    rows = bytearray()
    marker = min(width, height) // 5
    corners = ((245, 45, 45), (45, 235, 85), (55, 95, 245), (245, 215, 45))
    for y in range(height):
        rows.append(0)
        for x in range(width):
            color = (35 + (x * 70 // width), 55 + (y * 70 // height), 100)
            if avatar:
                head = (x - width / 2) ** 2 + (y - height / 3) ** 2 < (width / 5) ** 2
                body = width / 5 < x < width * 4 / 5 and height * .6 < y < height * .9
                color = (245, 75, 205) if head or body else (25, 185, 215)
            elif (x < marker or x >= width - marker) and (y < marker or y >= height - marker):
                color = corners[(2 if y >= height - marker else 0) + (1 if x >= width - marker else 0)]
            rows.extend(color)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(rows))) + chunk(b"IEND", b"")


COVERS = {dimensions: cover_png(*dimensions) for dimensions in ((480, 270), (160, 240), (240, 240))}
AVATAR = cover_png(160, 160, avatar=True)


class FixtureHandler(BaseHTTPRequestHandler):
    requests = []
    job_status = "running"
    job_retried = False

    def do_POST(self):
        self.requests.append(self.path)
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        if self.path == "/api/automation/play-jobs":
            if json.loads(body)["movie_id"] == "ONLINE-002":
                self.send_error(409)
                return
            assert json.loads(body)["movie_id"] == "ONLINE-001"
            self.send_json({"task_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "status": "running", "type": "browse-play"}, session=True)
        elif self.path in ("/api/system/jobs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/cancel", "/api/system/jobs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/retry"):
            if self.headers.get("Cookie") != "session=tv-session":
                self.send_error(403)
                return
            FixtureHandler.job_status = "cancelled" if self.path.endswith("cancel") else "running"
            FixtureHandler.job_retried = self.path.endswith("retry")
            self.send_json({"task_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "status": self.job_status, "type": "browse-play"})
        else:
            self.send_error(404)

    def log_message(self, *_args):
        pass

    def do_GET(self):
        self.requests.append(self.path)
        path = urlsplit(self.path).path
        if path == "/api/movies":
            query = parse_qs(urlsplit(self.path).query)
            page = int(query.get("page", ["1"])[0])
            self.send_json({"movies": [self.artwork({"id": "ONLINE-001", "title": "新片播放测试", "date": "2026-10-22"}),
                                       self.artwork({"id": "ONLINE-002", "title": "另一部新片测试"})] if page == 1 else [],
                            "pagination": {"hasNextPage": page == 1, "nextPage": 2 if page == 1 else None}})
        elif path in ("/api/movies/ONLINE-001", "/api/movies/ONLINE-002"):
            self.send_json(self.artwork({"id": path.rsplit("/", 1)[1], "title": "新片播放测试" if path.endswith("001") else "另一部新片测试", "stars": [{"id": "qa", "name": "在线演员", "avatar": "https://art.example/remote-avatar.png"}],
                            "genres": [{"id": "genre/qa", "name": "在线标签"}], "producer": {"id": "studio/qa", "name": "在线制作商"}}))
        elif path in ("/static/actors.json", "/static/categories.json"):
            self.send_json({"测试": [{"name": "在线演员", "code": "qa", "avatar": "/static/avatars/qa.jpg"}]
                            if "actors" in path else [{"name": "在线标签", "code": "qa"}]})
        elif path == "/static/avatars/qa.jpg":
            self.send_bytes(AVATAR, "image/png")
        elif path == "/api/system/jobs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa":
            if self.headers.get("Cookie") != "session=tv-session":
                self.send_error(403)
                return
            ready = self.job_retried and self.job_status != "cancelled"
            self.send_json({"task_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "type": "browse-play", "status": "success" if ready else self.job_status,
                            "message": "视频已就绪，可以播放" if ready else "115 正在下载：30%", "percent": 30,
                            "can_cancel": self.job_status == "running" and not ready, "can_retry": self.job_status == "cancelled",
                            "result": {"success": ready, "file_name": "online.mp4"}})
        elif path == "/api/movies/local-library":
            self.send_json({"success": True, "records": [self.artwork(movie) for movie in MOVIES]})
        elif path == "/api/movies/local-library/actors":
            self.send_json({"success": True, "actors": [
                {"key": "qa-actor", "name": "QA演员", "movie_count": 1,
                 "avatar_url": "/api/movies/local-library/actors/qa-actor/avatar"},
                {"key": "other-actor", "name": "另一位演员", "movie_count": 1}]})
        elif path == "/api/system/info":
            self.send_json({"version": {"version": "git-1234567", "deployed_at": "2026-10-20T00:00:00Z"}})
        elif path == "/api/movies/local-library/TV-001":
            self.send_json({"success": True, "in_local_library": True, "record": self.artwork(MOVIE)})
        elif path == "/api/movies/local-library/TV-001/subtitles":
            self.send_json({"subtitles": [{"id": "0123456789abcdef01234567", "language": "zh-Hans", "label": "简体中文", "default": True}]})
        elif path == "/api/movies/local-library/TV-001/subtitles/0123456789abcdef01234567":
            self.send_bytes("WEBVTT\n\n00:00:00.000 --> 00:01:00.000\n中文字幕显示测试\n".encode(), "text/vtt; charset=utf-8")
        elif path.startswith(("/api/movies/local-library/poster/", "/fixture-covers/")) or path == "/api/image-proxy":
            image_path = urlsplit(parse_qs(urlsplit(self.path).query).get("url", [""])[0]).path if path == "/api/image-proxy" else path
            movie_id = image_path.rsplit("/", 1)[-1].removesuffix(".png")
            self.send_bytes(AVATAR if image_path == "/remote-avatar.png" else COVERS[cover_dimensions(movie_id)], "image/png")
        elif path.endswith("/avatar"):
            self.send_bytes(AVATAR, "image/png")
        elif path in ("/api/movies/local-library/TV-001/play", "/api/automation/play-jobs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/stream"):
            if path.endswith("/stream") and self.headers.get("Cookie") != "session=tv-session":
                self.send_error(403)
                return
            data = (Path(__file__).parent / "fixtures/android_tv/test-pattern.mp4").read_bytes()
            byte_range = self.headers.get("Range")
            match = re.fullmatch(r"bytes=(\d+)-(\d*)", byte_range or "")
            if match:
                start = int(match[1])
                end = min(int(match[2]) if match[2] else len(data) - 1, len(data) - 1)
                if start > end:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{len(data)}")
                    self.end_headers()
                    return
                self.send_response(206)
                self.send_header("Content-Range", f"bytes {start}-{end}/{len(data)}")
                self.send_header("Content-Type", "video/mp4")
                self.send_header("Content-Length", str(end - start + 1))
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()
                self.wfile.write(data[start:end + 1])
            else:
                self.send_bytes(data, "video/mp4")
        else:
            self.send_error(404)

    def send_json(self, payload, session=False):
        self.send_bytes(json.dumps(payload).encode(), "application/json", session=session)

    def artwork(self, movie):
        movie_id = movie.get("movie_id") or movie["id"]
        url = f"http://127.0.0.1:{self.server.server_port}/fixture-covers/{movie_id}.png"
        return {**movie, "img": url, "cover_url": url}

    def send_bytes(self, data, content_type, session=False):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        if session:
            self.send_header("Set-Cookie", "session=tv-session; Path=/; HttpOnly; SameSite=Lax")
        self.end_headers()
        self.wfile.write(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--apk", type=Path, required=True)
    parser.add_argument("--artifacts", type=Path, default=Path("/tmp/javjaeger-tv-smoke"))
    parser.add_argument("--layout-only", action="store_true", help="Check home, local and online artwork/navigation layouts without playback.")
    parser.add_argument("--actors-only", action="store_true", help="Check actor photos and remote selection in local/online directories and details.")
    parser.add_argument("--playback-only", action="store_true", help="Check local playback, subtitle toggles and file switching only.")
    parser.add_argument("--seek-only", action="store_true", help="Check remote and pointer seeking using the debug androidTest APK.")
    args = parser.parse_args()

    def adb(*command, binary=False):
        return subprocess.check_output(["adb", "-s", args.serial, *command], timeout=30,
                                       text=not binary)

    assert adb("shell", "getprop", "ro.kernel.qemu").strip() == "1", "Use a disposable emulator"
    assert args.apk.is_file(), "Build the debug APK first"
    args.artifacts.mkdir(parents=True, exist_ok=True)
    adb("install", "-r", str(args.apk.resolve()))
    adb("shell", "pm", "clear", PACKAGE)
    server = ThreadingHTTPServer(("127.0.0.1", 0), FixtureHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    port = str(server.server_port)
    adb("reverse", f"tcp:{port}", f"tcp:{port}")

    def key(name):
        adb("shell", "input", "keyevent", name)

    def tree():
        raw = adb("exec-out", "uiautomator", "dump", "/dev/tty")
        if "<?xml" not in raw:
            (args.artifacts / "last-dump.txt").write_text(raw)
            return ET.Element("hierarchy")
        return ET.fromstring(raw[raw.index("<?xml"):raw.rindex("</hierarchy>") + 12])

    def find(root, label):
        found = next((n for n in root.iter("node") if label in (
            n.get("text", ""), n.get("content-desc", ""))), None)
        if found is not None:
            return found
        movie_id = {"遥控器测试影片": "TV-001", "另一部影片": "TV-002"}.get(label)
        return next((n for n in root.iter("node") if movie_id and
                     n.get("content-desc") == f"{movie_id} {label}"), None)

    def wait(label):
        until = time.monotonic() + 25
        while time.monotonic() < until:
            root = tree()
            node = find(root, label)
            if node is not None:
                return root, node
            time.sleep(0.3)
        raise AssertionError(f"Missing UI: {label}")

    def center(node):
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", node.get("bounds")))
        return (x1 + x2) // 2, (y1 + y2) // 2

    def bounds(node):
        return tuple(map(int, re.findall(r"\d+", node.get("bounds"))))

    cover_measurements = []
    actor_measurements = []

    def check_actor_photo(name, action, image_path, stage):
        if "detail" in stage:
            reveal(action)
        activate(action, click=False)
        until = time.monotonic() + 25
        photo_bounds = None
        requested = False
        while time.monotonic() < until:
            root = tree()
            if stage == "local-actors":
                card = find(root, action)
                if card is not None:
                    left, _, right, _ = bounds(card)
                    assert right - left <= bounds(root.find("node"))[2] / 5, "Incomplete actor rows must keep six-column widths"
            requested = any(urlsplit(parse_qs(urlsplit(path).query).get("url", [path])[0]).path == image_path
                            for path in FixtureHandler.requests)
            photo = find(root, "演员照片：" + name)
            if requested and photo is not None:
                photo_bounds = bounds(photo)
                left, top, right, bottom = photo_bounds
                assert right > left and bottom > top, "Actor photo must have visible bounds"
                raw = adb("exec-out", "screencap", binary=True)
                width, height, pixel_format = struct.unpack_from("<III", raw)
                assert pixel_format in (1, 2), "Avatar pixel check expects RGBA/RGBX screenshot"
                pixels = raw[-width * height * 4:]
                matches = 0
                for y in range(3, 8):
                    for x in range(3, 8):
                        offset = ((top + (bottom - top) * y // 10) * width + left + (right - left) * x // 10) * 4
                        rgb = pixels[offset:offset + 3]
                        matches += any(all(abs(rgb[i] - color[i]) <= 6 for i in range(3))
                                       for color in ((245, 75, 205), (25, 185, 215)))
                if matches >= 12:
                    actor_measurements.append({"stage": stage, "name": name, "bounds": photo_bounds,
                                               "image_path": image_path, "matching_pixels": matches})
                    (args.artifacts / (stage + ".png")).write_bytes(adb("exec-out", "screencap", "-p", binary=True))
                    return
            time.sleep(.2)
        raise AssertionError(f"{stage}: actor photo not loaded for {name}; request={requested}, image_bounds={photo_bounds}")

    def check_cover(movie_id, title, stage):
        label = f"{movie_id} {title}"
        activate(label, click=False)
        expected_width, expected_height = cover_dimensions(movie_id)
        until = time.monotonic() + 25
        previous = None
        while time.monotonic() < until:
            root = tree()
            card = find(root, label)
            cover = find(card, "封面：" + movie_id) if card is not None else None
            if cover is not None:
                left, top, right, bottom = bounds(cover)
                width, height = right - left, bottom - top
                error = abs(height - width * expected_height / expected_width)
                if width > 0 and height > 0 and error <= 1 and previous == (width, height):
                    focused = next((node for node in root.iter("node") if node.get("focused") == "true"), None)
                    assert focused is not None and focused.get("content-desc") == label, "Artwork loading must preserve the focused movie card"
                    if stage == "home":
                        card_bounds = bounds(card)
                        assert abs(card_bounds[2] - card_bounds[0] - width) < bounds(root.find("node"))[2] * .02, "Shelf card width must follow its cover without empty columns"
                    cover_measurements.append({"stage": stage, "movie_id": movie_id, "width": width, "height": height,
                                               "source_width": expected_width, "source_height": expected_height, "error_px": error})
                    return root
                previous = (width, height)
            time.sleep(.2)
        raise AssertionError(f"Cover frame must preserve original image ratio within 1 px: {movie_id}, measured={previous}, source={expected_width}x{expected_height}")

    def check_compact_sidebar(root):
        screen = bounds(root.find("node"))
        nav = find(root, "影院导航")
        assert nav is not None, "Collapsed TV sidebar must expose its navigation container"
        left, _, right, _ = bounds(nav)
        assert right - left <= (screen[2] - screen[0]) * .10, "Collapsed sidebar must use at most 10% of screen width while content has focus"

    def enter(label, value):
        _, node = wait(label)
        x, y = center(node)
        adb("shell", "input", "tap", str(x), str(y))
        key("KEYCODE_MOVE_END")
        if node.get("text"):
            adb("shell", "input", "keyevent", *(["KEYCODE_DEL"] * len(node.get("text"))))
        adb("shell", "input", "text", value)
        key("KEYCODE_BACK")

    def activate(label, click=True):
        # Navigate using only a remote, with target bounds read from the UI tree.
        tried = set()
        for _ in range(48):
            root, target = wait(label)
            focused = next((n for n in root.iter("node") if n.get("focused") == "true"), None)
            if focused is None:
                key("KEYCODE_DPAD_DOWN")
                continue
            tx, ty = center(target)
            fx, fy = center(focused)
            x1, y1, x2, y2 = map(int, re.findall(r"\d+", focused.get("bounds")))
            same_target = target.get("focusable") != "true" or (
                focused.get("text"), focused.get("content-desc")) == (target.get("text"), target.get("content-desc"))
            if x1 <= tx <= x2 and y1 <= ty <= y2 and same_target:
                if click:
                    key("KEYCODE_DPAD_CENTER")
                return
            # Android chooses the next row before comparing horizontal centers.
            direction = "DOWN" if ty > y2 else "UP" if ty < y1 else "RIGHT" if tx > fx else "LEFT"
            # FocusFinder can skip a wide button in favor of a narrower row.
            # Explore another direction if the greedy route returns to a visited control.
            state = (focused.get("text"), focused.get("content-desc"), focused.get("bounds"))
            directions = [direction, "RIGHT" if tx > fx else "LEFT", "UP", "DOWN", "RIGHT", "LEFT"]
            direction = next((value for value in directions if (state, value) not in tried), None)
            if direction is None:
                break
            tried.add((state, direction))
            key("KEYCODE_DPAD_" + direction)
        raise AssertionError(f"Remote cannot reach: {label}")

    def reveal(label, direction="DOWN"):
        for _ in range(20):
            if find(tree(), label) is not None:
                return
            key("KEYCODE_DPAD_" + direction)
        raise AssertionError(f"Remote cannot scroll to: {label}")

    def check_local_playback():
        wait("播放：part-1.mp4")
        reveal("演员：QA演员")
        reveal("标签：QA 标签")
        reveal("播放：part-1.mp4", "UP")
        (args.artifacts / "detail.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        root = tree()
        missing = find(root, "播放：missing.mp4")
        assert missing is not None and missing.get("enabled") == "false", "Missing segment must be disabled"
        activate("播放：part-1.mp4")
        until = time.monotonic() + 30
        while not any("/play?file_index=2" in p for p in FixtureHandler.requests) and time.monotonic() < until:
            time.sleep(0.3)
        assert any("/play?file_index=0" in p for p in FixtureHandler.requests), "First segment not requested"
        assert any("/play?file_index=2" in p for p in FixtureHandler.requests), "Next available segment not requested"
        assert not any("/play?file_index=1" in p for p in FixtureHandler.requests), "Missing segment was requested"
        key("KEYCODE_MEDIA_PAUSE")
        time.sleep(0.5)  # Allow the native controller's show animation to finish.
        (args.artifacts / "player.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        assert any("/subtitles/0123456789abcdef01234567?file_index=2" in p for p in FixtureHandler.requests), "Second segment subtitle was not loaded"

        def subtitle_pixels():
            raw = adb("exec-out", "screencap", binary=True)
            width, height, _ = struct.unpack_from("<III", raw)
            pixels = raw[-width * height * 4:]
            return b"".join(pixels[(y * width + width // 8) * 4:(y * width + width * 7 // 8) * 4]
                            for y in range(height * 3 // 5, height * 19 // 20))

        for _ in range(3):
            key("KEYCODE_DPAD_UP")
        key("KEYCODE_DPAD_RIGHT")  # File selector -> explicit subtitle toggle.
        time.sleep(.3)
        subtitles_on = subtitle_pixels()
        play_requests = sum("/play?" in p for p in FixtureHandler.requests)
        key("KEYCODE_DPAD_CENTER")
        time.sleep(.3)
        subtitles_off = subtitle_pixels()
        (args.artifacts / "subtitles-off.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        assert sum(a != b for a, b in zip(subtitles_on, subtitles_off)) > 300, "Disabling subtitles did not remove rendered text"
        key("KEYCODE_DPAD_CENTER")
        time.sleep(.3)
        assert subtitle_pixels() == subtitles_on, "Re-enabling subtitles did not restore the same caption"
        (args.artifacts / "subtitles-on.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        assert sum("/play?" in p for p in FixtureHandler.requests) == play_requests, "Subtitle toggling restarted video"
        key("KEYCODE_DPAD_RIGHT")
        key("KEYCODE_DPAD_CENTER")
        wait("字幕字体")
        key("KEYCODE_DPAD_CENTER")  # Font selector is initially focused.
        wait("等宽字体")
        key("KEYCODE_DPAD_DOWN")
        key("KEYCODE_DPAD_CENTER")
        activate("字幕字号", click=False)
        key("KEYCODE_DPAD_CENTER")
        wait("特大")
        key("KEYCODE_DPAD_DOWN")
        key("KEYCODE_DPAD_DOWN")
        key("KEYCODE_DPAD_CENTER")
        activate("字幕底部留白", click=False)
        key("KEYCODE_DPAD_CENTER")
        wait("12%")
        key("KEYCODE_DPAD_UP")
        key("KEYCODE_DPAD_CENTER")
        wait("字幕底部留白")
        (args.artifacts / "subtitle-appearance-dialog.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        activate("完成")
        time.sleep(.3)
        assert sum(a != b for a, b in zip(subtitle_pixels(), subtitles_on)) > 300, "Subtitle appearance did not change on the paused video"
        (args.artifacts / "subtitle-appearance-large-low.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        saved = ET.fromstring(adb("shell", "run-as", PACKAGE, "cat", "shared_prefs/subtitle-appearance.xml"))
        settings = {item.get("name"): item.get("value") for item in saved}
        assert settings == {"font": "1", "size": "3", "bottom": "0"}, f"Appearance settings were not saved: {settings}"
        assert sum("/play?" in p for p in FixtureHandler.requests) == play_requests, "Subtitle appearance restarted video"
        key("KEYCODE_DPAD_CENTER")
        wait("字幕字体")
        activate("恢复默认")
        time.sleep(.5)  # Wait for the dialog to return focus to the playback bar.
        key("KEYCODE_DPAD_DOWN")
        key("KEYCODE_DPAD_UP")  # Re-enter the bar through its file selector.
        print("PASS: Chinese subtitles render, toggle, change font/size/bottom, save and reset without restarting playback", flush=True)
        # Media3 emits progress accessibility events every second even while paused,
        # so UIAutomator's idle-based dump cannot inspect its visible controller.
        for _ in range(3):
            key("KEYCODE_DPAD_UP")
        key("KEYCODE_DPAD_CENTER")
        time.sleep(0.5)
        (args.artifacts / "player-files.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        before = sum("/play?file_index=2" in path for path in FixtureHandler.requests)
        before_detail = FixtureHandler.requests.count("/api/movies/local-library/TV-001")
        key("KEYCODE_DPAD_DOWN")  # The disabled missing file is skipped.
        key("KEYCODE_DPAD_CENTER")
        until = time.monotonic() + 25
        while (sum("/play?file_index=2" in path for path in FixtureHandler.requests) <= before
               or FixtureHandler.requests.count("/api/movies/local-library/TV-001") <= before_detail) and time.monotonic() < until:
            time.sleep(0.3)
        assert sum("/play?file_index=2" in path for path in FixtureHandler.requests) > before, "Player file selection did not switch to the next available file"
        assert FixtureHandler.requests.count("/api/movies/local-library/TV-001") > before_detail, "File selection must reload the movie before playback"
        assert not any("/play?file_index=1" in path for path in FixtureHandler.requests), "Player file picker selected the missing file"
        key("KEYCODE_MEDIA_PAUSE")
        time.sleep(0.5)
        for _ in range(3):
            key("KEYCODE_DPAD_UP")
        key("KEYCODE_DPAD_RIGHT")
        key("KEYCODE_DPAD_RIGHT")
        key("KEYCODE_DPAD_RIGHT")
        key("KEYCODE_DPAD_CENTER")  # Stop returns to the existing detail dialog.
        wait("播放：part-1.mp4")

    try:
        if args.seek_only:
            test_apk = args.apk.resolve().parents[1] / "androidTest/debug/app-debug-androidTest.apk"
            assert test_apk.is_file(), "Run ./gradlew assembleDebugAndroidTest first"
            adb("install", "-r", str(test_apk))
            result = adb("shell", "am", "instrument", "-w", "-r", "-e", "server", f"http://127.0.0.1:{port}",
                         f"{PACKAGE}.test/{PACKAGE}.PlaybackSeekCheck")
            print(result, flush=True)
            assert "PASS: local and session playback" in result and "INSTRUMENTATION_CODE: -1" in result, result
            return
        adb("shell", "am", "start", "-n", f"{PACKAGE}/.MainActivity")
        enter("服务器地址", f"http://127.0.0.1:{port}")
        activate("连接服务器")
        if args.playback_only:
            wait("最近入库")
            activate("全部影片")
            activate("遥控器测试影片")
            check_local_playback()
            print("PASS: isolated local playback and subtitle workflow", flush=True)
            return
        if args.actors_only:
            wait("最近入库")
            activate("浏览新片")
            activate("浏览筛选")
            activate("浏览演员目录")
            check_actor_photo("在线演员", "在线演员", "/static/avatars/qa.jpg", "online-actors")
            activate("在线演员")
            activate("新片播放测试")
            check_actor_photo("在线演员", "浏览演员：在线演员", "/remote-avatar.png", "online-detail-actors")
            key("KEYCODE_BACK")
            wait("新片播放测试")
            activate("演员")
            check_actor_photo("QA演员", "查看演员：QA演员", "/api/movies/local-library/actors/qa-actor/avatar", "local-actors")
            activate("查看演员：QA演员")
            activate("遥控器测试影片")
            check_actor_photo("QA演员", "演员：QA演员", "/api/movies/local-library/actors/qa-actor/avatar", "local-detail-actors")
            assert any(path.startswith("/api/image-proxy?url=") and "remote-avatar.png" in path for path in FixtureHandler.requests), "Remote actor photos must use the server image proxy"
            print("PASS: actor photo requests, visible synthetic pixels and remote selection in all four entry points", flush=True)
            return
        for tab in ("推荐", "全部影片", "标签", "演员", "VR"):
            wait(tab)
        wait("最近入库")
        root = check_cover("TV-001", "遥控器测试影片", "home")
        check_compact_sidebar(root)
        check_cover("TV-002", "另一部影片", "home")
        activate("TV-001 遥控器测试影片", click=False)
        screen = list(map(int, re.findall(r"\d+", root.find("node").get("bounds"))))
        assert find(root, "搜索影片") is None, "Search input must open on demand"
        print("PASS: server connection and cinema home", flush=True)
        (args.artifacts / "home.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        if args.layout_only:
            activate("全部影片")
            for movie_id, title in (("TV-001", "遥控器测试影片"), ("TV-002", "另一部影片"), ("PAGE-001", "分页测试影片 1")):
                check_compact_sidebar(check_cover(movie_id, title, "library"))
            (args.artifacts / "library.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
            activate("浏览新片")
            check_compact_sidebar(check_cover("ONLINE-001", "新片播放测试", "browse"))
            check_cover("ONLINE-002", "另一部新片测试", "browse")
            (args.artifacts / "browse.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
            activate("演员")
            activate("查看演员：QA演员", click=False)
            actor_root, actor_card = wait("查看演员：QA演员")
            actor_bounds = bounds(actor_card)
            assert actor_bounds[2] - actor_bounds[0] <= bounds(actor_root.find("node"))[2] / 5, "Incomplete actor rows must keep the same six-column card width"
            (args.artifacts / "actors.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
            print("PASS: natural wide/portrait/square artwork and compact sidebar across home/library/discovery", flush=True)
            return
        activate("TV-001 遥控器测试影片")
        wait("播放：part-1.mp4")
        check_actor_photo("QA演员", "演员：QA演员", "/api/movies/local-library/actors/qa-actor/avatar", "local-detail-actors")
        key("KEYCODE_BACK")
        root, _ = wait("TV-001 遥控器测试影片")
        focused = next((node for node in root.iter("node") if node.get("focused") == "true"), None)
        assert focused is not None and focused.get("content-desc") == "TV-001 遥控器测试影片", "Closing home detail must restore the originating movie card's focus"
        print("PASS: home detail returns focus to its movie card", flush=True)
        activate("标签")
        wait("搜索标签")
        activate("选择标签：QA 标签")
        activate("查看影片")
        wait("全部标签")
        root, _ = wait("遥控器测试影片")
        assert find(root, "另一部影片") is None, "Tag selection must filter the movie wall"
        filtered_card = next(node for node in root.iter("node") if node.get("content-desc") == "TV-001 遥控器测试影片")
        assert list(map(int, re.findall(r"\d+", filtered_card.get("bounds"))))[1] < screen[3] * .26, "Filtered walls must keep controls compact"
        (args.artifacts / "tags.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        activate("全部标签")
        activate("选择标签：第二标签")
        activate("匹配全部标签")
        activate("查看影片")
        wait("没有符合条件的影片")
        activate("筛选影片")
        activate("标签")
        activate("匹配任一标签")
        activate("完成")
        wait("遥控器测试影片")
        wait("另一部影片")
        activate("全部标签")
        activate("清空标签选择")
        print("PASS: tag directory, OR/AND and clear", flush=True)
        activate("演员")
        check_actor_photo("QA演员", "查看演员：QA演员", "/api/movies/local-library/actors/qa-actor/avatar", "local-actors")
        activate("查看演员：QA演员")
        wait("全部演员")
        root, _ = wait("遥控器测试影片")
        assert find(root, "另一部影片") is None, "Actor wall must filter by the selected actor"
        activate("全部演员")
        activate("VR")
        wait("VR 2160p")
        activate("全部影片")
        root, _ = wait("遥控器测试影片")
        root = check_cover("TV-001", "遥控器测试影片", "library")
        check_compact_sidebar(root)
        card = next(node for node in root.iter("node") if node.get("content-desc") == "TV-001 遥控器测试影片")
        card_top = list(map(int, re.findall(r"\d+", card.get("bounds"))))[1]
        assert card_top < screen[3] * .26, "Movie wall must reserve at least 74% of screen height for content"
        activate("筛选影片")
        wait("完成")
        activate("影院排序")
        wait("发行日期")
        key("KEYCODE_BACK")
        activate("完成")
        activate("打开搜索")
        enter("搜索影片", "PAGE-")
        print("PASS: actor and VR browsing, filter and sort controls", flush=True)
        activate("搜索")
        wait("第 1 / 2 页 · 共 63 项")
        activate("下一页")
        wait("第 2 / 2 页 · 共 63 项")
        activate("上一页")
        wait("第 1 / 2 页 · 共 63 项")
        activate("打开搜索")
        enter("搜索影片", "TV-001")
        print("PASS: 60-item paging and search", flush=True)
        activate("搜索")
        root, _ = wait("遥控器测试影片")
        assert find(root, "另一部影片") is None, "Search must filter the library"
        activate("遥控器测试影片")
        check_local_playback()
        key("KEYCODE_BACK")
        root, _ = wait("遥控器测试影片")
        assert find(root, "另一部影片") is None, "Returning must preserve the search"
        assert any(p.startswith("/api/image-proxy?url=") for p in FixtureHandler.requests), "Remote covers must use the server image proxy"
        activate("浏览新片")
        check_compact_sidebar(check_cover("ONLINE-001", "新片播放测试", "browse"))
        activate("浏览筛选")
        activate("浏览演员目录")
        check_actor_photo("在线演员", "在线演员", "/static/avatars/qa.jpg", "online-actors")
        activate("在线演员")
        wait("新片播放测试")
        activate("新片播放测试")
        wait("浏览演员：在线演员")
        wait("浏览标签：在线标签")
        check_actor_photo("在线演员", "浏览演员：在线演员", "/remote-avatar.png", "online-detail-actors")
        activate("最佳资源播放")
        activate("取消等待", click=False)
        time.sleep(2)
        focused = next((node for node in tree().iter("node") if node.get("focused") == "true"), None)
        assert focused is not None and focused.get("text") == "取消等待", "Polling must preserve remote action focus"
        key("KEYCODE_BACK")
        wait("最佳资源播放")
        key("KEYCODE_BACK")
        wait("新片播放测试")
        activate("另一部新片测试")
        activate("最佳资源播放")
        activate("继续上一部播放准备")
        activate("取消等待")
        activate("重试播放")
        until = time.monotonic() + 25
        while not any(p.endswith("/stream") for p in FixtureHandler.requests) and time.monotonic() < until:
            time.sleep(0.3)
        assert any(p.endswith("/stream") for p in FixtureHandler.requests), "115 stream must use the same in-memory session"
        (args.artifacts / "online-player.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        key("KEYCODE_BACK")
        wait("最佳资源播放")
        key("KEYCODE_BACK")
        root, _ = wait("新片播放测试")
        assert any('filters=' in p and 'qa' in p for p in FixtureHandler.requests), "Online catalog selection must reach the server"
        allowed = ("/api/movies/local-library", "/api/image-proxy?url=", "/api/system/info", "/api/movies?",
                   "/api/movies/ONLINE-", "/static/actors.json", "/static/categories.json", "/static/avatars/",
                   "/api/automation/play-jobs", "/api/system/jobs/", "/fixture-covers/")
        assert all(path.startswith(allowed) for path in FixtureHandler.requests), "TV must use only its defined server APIs"
        print("PASS: online discovery, facets, session-owned 115 cancellation/retry and native playback", flush=True)
        adb("shell", "am", "force-stop", PACKAGE)
        adb("shell", "am", "start", "-n", f"{PACKAGE}/.MainActivity")
        wait("遥控器测试影片")  # Credential-free server address survives a process restart.
        (args.artifacts / "library.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        print("PASS: connect, remote search/details, missing-segment skip, playback, back and server persistence")
    finally:
        (args.artifacts / "actor-measurements.json").write_text(json.dumps(actor_measurements, indent=2))
        (args.artifacts / "cover-measurements.json").write_text(json.dumps(cover_measurements, indent=2))
        (args.artifacts / "requests.json").write_text(json.dumps(FixtureHandler.requests, indent=2))
        (args.artifacts / "last-screen.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        (args.artifacts / "last-screen.xml").write_text(ET.tostring(tree(), encoding="unicode"))
        adb("reverse", "--remove", f"tcp:{port}")
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
