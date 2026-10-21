"""Isolated Android TV workflow. Requires a disposable emulator, adb and a built APK.

python3 tests/android_tv_smoke.py --serial emulator-5556 --apk android-tv/app/build/outputs/apk/debug/app-debug.apk
The checked-in synthetic MP4 needs no FFmpeg or real server/account at test time.
"""

import argparse
import json
import re
import subprocess
import threading
import time
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


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


class FixtureHandler(BaseHTTPRequestHandler):
    requests = []

    def log_message(self, *_args):
        pass

    def do_GET(self):
        self.requests.append(self.path)
        path = urlsplit(self.path).path
        if path == "/api/movies/local-library":
            self.send_json({"success": True, "records": MOVIES})
        elif path == "/api/movies/local-library/actors":
            self.send_json({"success": True, "actors": [
                {"key": "qa-actor", "name": "QA演员", "movie_count": 1,
                 "avatar_url": "/api/movies/local-library/actors/qa-actor/avatar"},
                {"key": "other-actor", "name": "另一位演员", "movie_count": 1}]})
        elif path == "/api/system/info":
            self.send_json({"version": {"version": "git-1234567", "deployed_at": "2026-10-20T00:00:00Z"}})
        elif path == "/api/movies/local-library/TV-001":
            self.send_json({"success": True, "in_local_library": True, "record": MOVIE})
        elif path.startswith("/api/movies/local-library/poster/") or path.endswith("/avatar") or path == "/api/image-proxy":
            self.send_bytes((Path(__file__).parent / "fixtures/android_tv/poster.png").read_bytes(), "image/png")
        elif path == "/api/movies/local-library/TV-001/play":
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

    def send_json(self, payload):
        self.send_bytes(json.dumps(payload).encode(), "application/json")

    def send_bytes(self, data, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--apk", type=Path, required=True)
    parser.add_argument("--artifacts", type=Path, default=Path("/tmp/javjaeger-tv-smoke"))
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

    def enter(label, value):
        _, node = wait(label)
        x, y = center(node)
        adb("shell", "input", "tap", str(x), str(y))
        key("KEYCODE_MOVE_END")
        if node.get("text"):
            adb("shell", "input", "keyevent", *(["KEYCODE_DEL"] * len(node.get("text"))))
        adb("shell", "input", "text", value)
        key("KEYCODE_BACK")

    def activate(label):
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
            if x1 <= tx <= x2 and y1 <= ty <= y2:
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

    try:
        adb("shell", "am", "start", "-n", f"{PACKAGE}/.MainActivity")
        enter("服务器地址", f"http://127.0.0.1:{port}")
        activate("连接服务器")
        for tab in ("推荐", "全部影片", "标签", "演员", "VR"):
            wait(tab)
        wait("最近入库")
        print("PASS: server connection and cinema home", flush=True)
        (args.artifacts / "home.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        activate("标签")
        wait("搜索标签")
        activate("选择标签：QA 标签")
        activate("查看影片")
        wait("全部标签")
        root, _ = wait("遥控器测试影片")
        assert find(root, "另一部影片") is None, "Tag selection must filter the movie wall"
        (args.artifacts / "tags.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        activate("全部标签")
        activate("选择标签：第二标签")
        activate("匹配全部标签")
        activate("查看影片")
        wait("没有符合条件的影片")
        activate("匹配任一标签")
        wait("遥控器测试影片")
        wait("另一部影片")
        activate("全部标签")
        activate("清空标签选择")
        print("PASS: tag directory, OR/AND and clear", flush=True)
        activate("演员")
        activate("查看演员：QA演员")
        wait("全部演员")
        root, _ = wait("遥控器测试影片")
        assert find(root, "另一部影片") is None, "Actor wall must filter by the selected actor"
        activate("全部演员")
        activate("VR")
        wait("VR 2160p")
        activate("全部影片")
        wait("影院排序")
        activate("筛选影片")
        wait("完成")
        key("KEYCODE_BACK")
        activate("影院排序")
        wait("发行日期")
        key("KEYCODE_BACK")
        enter("搜索影片", "PAGE-")
        print("PASS: actor and VR browsing, filter and sort controls", flush=True)
        activate("搜索")
        wait("第 1 / 2 页 · 共 63 项")
        activate("下一页")
        wait("第 2 / 2 页 · 共 63 项")
        activate("上一页")
        wait("第 1 / 2 页 · 共 63 项")
        enter("搜索影片", "TV-001")
        print("PASS: 60-item paging and search", flush=True)
        activate("搜索")
        root, _ = wait("遥控器测试影片")
        assert find(root, "另一部影片") is None, "Search must filter the library"
        activate("遥控器测试影片")
        wait("播放：part-1.mp4")
        wait("演员：QA演员")
        wait("标签：QA 标签")
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
        key("KEYCODE_DPAD_CENTER")  # Stop returns to the existing detail dialog.
        wait("播放：part-1.mp4")
        key("KEYCODE_BACK")
        root, _ = wait("遥控器测试影片")
        assert find(root, "另一部影片") is None, "Returning must preserve the search"
        assert any(p.startswith("/api/image-proxy?url=") for p in FixtureHandler.requests), "Remote covers must use the server image proxy"
        assert all(p.startswith(("/api/movies/local-library", "/api/image-proxy?url=", "/api/system/info")) for p in FixtureHandler.requests), "TV must only use library, image and deployment APIs"
        adb("shell", "am", "force-stop", PACKAGE)
        adb("shell", "am", "start", "-n", f"{PACKAGE}/.MainActivity")
        wait("遥控器测试影片")  # Credential-free server address survives a process restart.
        (args.artifacts / "library.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        print("PASS: connect, remote search/details, missing-segment skip, playback, back and server persistence")
    finally:
        (args.artifacts / "requests.json").write_text(json.dumps(FixtureHandler.requests, indent=2))
        (args.artifacts / "last-screen.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
        (args.artifacts / "last-screen.xml").write_text(ET.tostring(tree(), encoding="unicode"))
        adb("reverse", "--remove", f"tcp:{port}")
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
