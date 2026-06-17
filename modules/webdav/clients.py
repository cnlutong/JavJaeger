import logging
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Any, Dict, List
from urllib.parse import unquote, urljoin, urlparse

try:
    import aria2p
except ModuleNotFoundError:
    aria2p = None
try:
    import requests
except ModuleNotFoundError:
    requests = None


logger = logging.getLogger(__name__)


@dataclass
class WebDavFile:
    name: str
    path: str
    is_directory: bool
    size: int = 0
    modified: str = ""
    download_url: str = ""


class WebDavClient:
    def __init__(self, base_url: str, username: str = "", password: str = "", timeout_seconds: float = 30.0):
        if requests is None:
            raise RuntimeError("未安装 requests，请先执行 pip install -r requirements.txt")
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.timeout_seconds = timeout_seconds
        self.session = requests.Session()

        if username and password:
            self.session.auth = (username, password)

    def close(self) -> None:
        self.session.close()

    def _build_download_url(self, href: str) -> str:
        return urljoin(self.base_url, href)

    def build_aria2_options(self, options: Dict[str, str] | None = None) -> Dict[str, str]:
        aria2_options: Dict[str, str] = {}
        if options:
            for key, value in options.items():
                if value is not None:
                    aria2_options[key] = str(value)

        if self.username:
            aria2_options["http-user"] = self.username
        if self.password:
            aria2_options["http-passwd"] = self.password

        return aria2_options

    def _make_request(self, method: str, path: str, **kwargs) -> requests.Response:
        url = urljoin(self.base_url, path.lstrip("/"))
        kwargs.setdefault("timeout", self.timeout_seconds)
        response = self.session.request(method, url, **kwargs)
        response.raise_for_status()
        return response

    def list_directory(self, path: str = "/") -> List[WebDavFile]:
        headers = {"Depth": "1", "Content-Type": "application/xml"}
        propfind_body = """<?xml version="1.0" encoding="utf-8" ?>
        <D:propfind xmlns:D="DAV:">
            <D:allprop/>
        </D:propfind>"""

        try:
            response = self._make_request("PROPFIND", path, headers=headers, data=propfind_body)
            return self._parse_propfind_response(response.text, path)
        except Exception as exc:
            logger.error("列出目录失败: %s", exc)
            return self._try_http_directory_listing(path)

    def _parse_propfind_response(self, xml_content: str, base_path: str) -> List[WebDavFile]:
        files: List[WebDavFile] = []
        namespaces = {"D": "DAV:", "d": "DAV:"}

        try:
            root = ET.fromstring(xml_content)
        except ET.ParseError as exc:
            logger.error("XML解析失败: %s", exc)
            return self._parse_propfind_response_regex(xml_content, base_path)

        responses = root.findall(".//D:response", namespaces) or root.findall(".//d:response", namespaces)
        for response in responses:
            try:
                href_elem = response.find(".//D:href", namespaces) or response.find(".//d:href", namespaces)
                if href_elem is None or not href_elem.text:
                    continue

                href = unquote(href_elem.text.strip())
                if href.rstrip("/") == base_path.rstrip("/"):
                    continue

                name = href.split("/")[-1] if not href.endswith("/") else href.split("/")[-2]
                if not name:
                    continue

                resourcetype = response.find(".//D:resourcetype", namespaces) or response.find(
                    ".//d:resourcetype", namespaces
                )
                is_directory = False
                if resourcetype is not None:
                    collection = resourcetype.find(".//D:collection", namespaces) or resourcetype.find(
                        ".//d:collection", namespaces
                    )
                    is_directory = collection is not None
                elif href.endswith("/"):
                    is_directory = True

                size = 0
                if not is_directory:
                    size_elem = response.find(".//D:getcontentlength", namespaces) or response.find(
                        ".//d:getcontentlength", namespaces
                    )
                    if size_elem is not None and size_elem.text:
                        try:
                            size = int(size_elem.text)
                        except ValueError:
                            size = 0

                modified = ""
                modified_elem = response.find(".//D:getlastmodified", namespaces) or response.find(
                    ".//d:getlastmodified", namespaces
                )
                if modified_elem is not None and modified_elem.text:
                    modified = modified_elem.text

                files.append(
                    WebDavFile(
                        name=name,
                        path=href,
                        is_directory=is_directory,
                        size=size,
                        modified=modified,
                        download_url=self._build_download_url(href),
                    )
                )
            except Exception as exc:
                logger.warning("解析单个WebDAV文件失败: %s", exc)

        return files

    def _parse_propfind_response_regex(self, xml_content: str, base_path: str) -> List[WebDavFile]:
        files: List[WebDavFile] = []
        hrefs = re.findall(r"<[Dd]:href[^>]*>([^<]+)</[Dd]:href>", xml_content)
        size_pattern = r"<[Dd]:getcontentlength[^>]*>([^<]+)</[Dd]:getcontentlength>"

        for href in hrefs:
            href = unquote(href.strip())
            if href.rstrip("/") == base_path.rstrip("/"):
                continue

            name = href.split("/")[-1] if not href.endswith("/") else href.split("/")[-2]
            if not name:
                continue

            is_directory = href.endswith("/")
            size = 0
            if not is_directory:
                response_start = xml_content.find(f"<D:href>{href}</D:href>")
                if response_start == -1:
                    response_start = xml_content.find(f"<d:href>{href}</d:href>")
                if response_start != -1:
                    response_end = xml_content.find("</D:response>", response_start)
                    if response_end == -1:
                        response_end = xml_content.find("</d:response>", response_start)
                    if response_end != -1:
                        size_matches = re.findall(size_pattern, xml_content[response_start:response_end])
                        if size_matches:
                            try:
                                size = int(size_matches[0])
                            except ValueError:
                                size = 0

            files.append(
                WebDavFile(
                    name=name,
                    path=href,
                    is_directory=is_directory,
                    size=size,
                    download_url=self._build_download_url(href),
                )
            )

        return files

    def _try_http_directory_listing(self, path: str) -> List[WebDavFile]:
        response = self._make_request("GET", path)
        matches = re.findall(r'<a\s+href="([^"]+)"[^>]*>([^<]+)</a>', response.text, re.IGNORECASE)
        files: List[WebDavFile] = []

        for href, name in matches:
            if name in {"../", ".."}:
                continue

            is_directory = href.endswith("/")
            full_path = urljoin(path.rstrip("/") + "/", href)
            clean_name = name.rstrip("/")
            if not clean_name:
                continue

            files.append(
                WebDavFile(
                    name=clean_name,
                    path=full_path,
                    is_directory=is_directory,
                    download_url=self._build_download_url(full_path),
                )
            )

        return files


class Aria2Client:
    def __init__(self, rpc_url: str, secret: str = ""):
        if aria2p is None:
            raise RuntimeError("未安装 aria2p，请先执行 pip install -r requirements.txt")
        self.rpc_url = rpc_url
        self.secret = secret
        self.aria2 = None
        self._connect()

    def _connect(self) -> None:
        parsed = urlparse(self.rpc_url)
        host_with_protocol = f"{parsed.scheme}://{parsed.hostname}"
        port = parsed.port or 6800
        client = aria2p.Client(host=host_with_protocol, port=port, secret=self.secret)
        self.aria2 = aria2p.API(client)

    def test_connection(self) -> bool:
        if not self.aria2:
            return False
        try:
            self.aria2.client.get_version()
            return True
        except Exception as exc:
            logger.error("Aria2连接测试失败: %s", exc)
            return False

    def add_download(self, url: str, options: Dict[str, str] | None = None) -> str:
        if not self.aria2:
            raise RuntimeError("Aria2未连接")

        aria2_options: Dict[str, str] = {}
        if options:
            for key, value in options.items():
                if value is not None:
                    aria2_options[key] = str(value)

        download = self.aria2.add_uris([url], options=aria2_options)
        return download.gid

    def get_version(self) -> Dict[str, Any]:
        if not self.aria2:
            raise RuntimeError("Aria2未连接")
        return self.aria2.client.get_version()

    def get_downloads(self) -> List[Dict[str, Any]]:
        if not self.aria2:
            raise RuntimeError("Aria2未连接")

        result: List[Dict[str, Any]] = []
        for download in self.aria2.get_downloads():
            item: Dict[str, Any] = {
                "gid": download.gid,
                "status": download.status,
                "name": download.name or "未知文件",
                "totalLength": download.total_length,
                "completedLength": download.completed_length,
                "downloadSpeed": download.download_speed,
                "progress": download.progress,
            }

            files = []
            if hasattr(download, "files") and download.files:
                for file in download.files:
                    files.append(
                        {
                            "path": getattr(file, "path", ""),
                            "uris": [{"uri": uri["uri"]} for uri in getattr(file, "uris", [])],
                        }
                    )
            if files:
                item["files"] = files
            else:
                item["files"] = [{"path": "", "uris": [{"uri": download.name or "未知文件"}]}]

            result.append(item)

        return result

    def pause_download(self, gid: str) -> bool:
        if not self.aria2:
            raise RuntimeError("Aria2未连接")
        self.aria2.get_download(gid).pause()
        return True

    def resume_download(self, gid: str) -> bool:
        if not self.aria2:
            raise RuntimeError("Aria2未连接")
        self.aria2.get_download(gid).resume()
        return True

    def remove_download(self, gid: str) -> bool:
        if not self.aria2:
            raise RuntimeError("Aria2未连接")
        self.aria2.get_download(gid).remove()
        return True
