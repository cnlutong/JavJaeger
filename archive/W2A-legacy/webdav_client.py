import asyncio
import json
import logging
from typing import List, Dict, Any, Optional
from urllib.parse import urljoin, urlparse, unquote
import requests
from dataclasses import dataclass
import re
import xml.etree.ElementTree as ET
from datetime import datetime
import aria2p

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class WebDavFile:
    """WebDAV文件信息"""
    name: str
    path: str
    is_directory: bool
    size: int = 0
    modified: str = ""
    download_url: str = ""

class WebDavClient:
    """WebDAV客户端，用于连接和操作WebDAV服务器"""
    
    def __init__(self, base_url: str, username: str = "", password: str = ""):
        self.base_url = base_url.rstrip('/')
        self.username = username
        self.password = password
        self.session = requests.Session()
        
        if username and password:
            self.session.auth = (username, password)
    
    def _build_download_url(self, href: str) -> str:
        """构建包含认证信息的下载URL"""
        from urllib.parse import urlparse, urlunparse
        
        # 构建基本URL
        download_url = urljoin(self.base_url, href)
        
        # 如果有用户名和密码，将其嵌入到URL中
        if self.username and self.password:
            parsed = urlparse(download_url)
            # 构建包含认证信息的URL
            netloc = f"{self.username}:{self.password}@{parsed.hostname}"
            if parsed.port:
                netloc += f":{parsed.port}"
            
            download_url = urlunparse((
                parsed.scheme,
                netloc,
                parsed.path,
                parsed.params,
                parsed.query,
                parsed.fragment
            ))
        
        return download_url
    
    def _make_request(self, method: str, path: str, **kwargs) -> requests.Response:
        """发送HTTP请求"""
        url = urljoin(self.base_url, path.lstrip('/'))
        try:
            response = self.session.request(method, url, **kwargs)
            response.raise_for_status()
            return response
        except requests.RequestException as e:
            logger.error(f"请求失败: {e}")
            raise
    
    def list_directory(self, path: str = "/") -> List[WebDavFile]:
        """列出目录内容"""
        try:
            # WebDAV PROPFIND请求
            headers = {
                'Depth': '1',
                'Content-Type': 'application/xml'
            }
            
            propfind_body = '''<?xml version="1.0" encoding="utf-8" ?>
            <D:propfind xmlns:D="DAV:">
                <D:allprop/>
            </D:propfind>'''
            
            response = self._make_request('PROPFIND', path, headers=headers, data=propfind_body)
            
            # 解析WebDAV响应
            files = self._parse_propfind_response(response.text, path)
            return files
            
        except Exception as e:
            logger.error(f"列出目录失败: {e}")
            # 如果WebDAV失败，尝试简单的HTTP目录列表
            return self._try_http_directory_listing(path)
    
    def _parse_propfind_response(self, xml_content: str, base_path: str) -> List[WebDavFile]:
        """解析WebDAV PROPFIND响应"""
        files = []
        
        try:
            # 使用XML解析器
            root = ET.fromstring(xml_content)
            
            # 定义命名空间
            namespaces = {
                'D': 'DAV:',
                'd': 'DAV:'
            }
            
            # 查找所有response元素
            responses = root.findall('.//D:response', namespaces) or root.findall('.//d:response', namespaces)
            
            for response in responses:
                try:
                    # 获取href
                    href_elem = response.find('.//D:href', namespaces) or response.find('.//d:href', namespaces)
                    if href_elem is None:
                        continue
                    
                    href = unquote(href_elem.text.strip())
                    
                    # 跳过当前目录
                    if href.rstrip('/') == base_path.rstrip('/'):
                        continue
                    
                    # 提取文件名
                    name = href.split('/')[-1] if not href.endswith('/') else href.split('/')[-2]
                    if not name:
                        continue
                    
                    # 判断是否为目录
                    resourcetype = response.find('.//D:resourcetype', namespaces) or response.find('.//d:resourcetype', namespaces)
                    is_directory = False
                    if resourcetype is not None:
                        collection = resourcetype.find('.//D:collection', namespaces) or resourcetype.find('.//d:collection', namespaces)
                        is_directory = collection is not None
                    
                    # 如果没有resourcetype，通过URL判断
                    if resourcetype is None:
                        is_directory = href.endswith('/')
                    
                    # 获取文件大小
                    size = 0
                    if not is_directory:
                        size_elem = response.find('.//D:getcontentlength', namespaces) or response.find('.//d:getcontentlength', namespaces)
                        if size_elem is not None and size_elem.text:
                            try:
                                size = int(size_elem.text)
                            except ValueError:
                                size = 0
                    
                    # 获取修改时间
                    modified = ""
                    modified_elem = response.find('.//D:getlastmodified', namespaces) or response.find('.//d:getlastmodified', namespaces)
                    if modified_elem is not None and modified_elem.text:
                        modified = modified_elem.text
                    
                    # 构建下载URL（包含认证信息）
                    download_url = self._build_download_url(href)
                    
                    files.append(WebDavFile(
                        name=name,
                        path=href,
                        is_directory=is_directory,
                        size=size,
                        modified=modified,
                        download_url=download_url
                    ))
                    
                except Exception as e:
                    logger.warning(f"解析单个文件信息失败: {e}")
                    continue
            
            return files
            
        except ET.ParseError as e:
            logger.error(f"XML解析失败: {e}")
            # 回退到正则表达式解析
            return self._parse_propfind_response_regex(xml_content, base_path)
        except Exception as e:
            logger.error(f"解析PROPFIND响应失败: {e}")
            return []
    
    def _parse_propfind_response_regex(self, xml_content: str, base_path: str) -> List[WebDavFile]:
        """使用正则表达式解析WebDAV PROPFIND响应（备用方案）"""
        files = []
        
        # 简单的正则表达式解析
        href_pattern = r'<[Dd]:href[^>]*>([^<]+)</[Dd]:href>'
        getcontentlength_pattern = r'<[Dd]:getcontentlength[^>]*>([^<]+)</[Dd]:getcontentlength>'
        
        hrefs = re.findall(href_pattern, xml_content)
        
        for href in hrefs:
            href = unquote(href.strip())
            
            if href.rstrip('/') == base_path.rstrip('/'):
                continue  # 跳过当前目录
                
            # 提取文件名
            name = href.split('/')[-1] if not href.endswith('/') else href.split('/')[-2]
            if not name:
                continue
            
            # 判断是否为目录
            is_directory = href.endswith('/')
            
            # 尝试获取文件大小
            size = 0
            if not is_directory:
                # 在当前response块中查找大小信息
                response_start = xml_content.find(f'<D:href>{href}</D:href>')
                if response_start == -1:
                    response_start = xml_content.find(f'<d:href>{href}</d:href>')
                
                if response_start != -1:
                    response_end = xml_content.find('</D:response>', response_start)
                    if response_end == -1:
                        response_end = xml_content.find('</d:response>', response_start)
                    
                    if response_end != -1:
                        response_block = xml_content[response_start:response_end]
                        size_matches = re.findall(getcontentlength_pattern, response_block)
                        if size_matches:
                            try:
                                size = int(size_matches[0])
                            except ValueError:
                                size = 0
            
            # 构建下载URL（包含认证信息）
            download_url = self._build_download_url(href)
            
            files.append(WebDavFile(
                name=name,
                path=href,
                is_directory=is_directory,
                size=size,
                download_url=download_url
            ))
        
        return files
    
    def _try_http_directory_listing(self, path: str) -> List[WebDavFile]:
        """尝试HTTP目录列表（备用方案）"""
        try:
            response = self._make_request('GET', path)
            html_content = response.text
            
            # 解析HTML目录列表
            files = []
            
            # 查找链接
            link_pattern = r'<a\s+href="([^"]+)"[^>]*>([^<]+)</a>'
            matches = re.findall(link_pattern, html_content, re.IGNORECASE)
            
            for href, display_name in matches:
                if href in ['..', '../', './']:
                    continue
                
                is_directory = href.endswith('/')
                name = display_name.strip()
                
                if not name:
                    name = href.rstrip('/')
                
                full_path = urljoin(path, href)
                download_url = self._build_download_url(full_path)
                
                files.append(WebDavFile(
                    name=name,
                    path=full_path,
                    is_directory=is_directory,
                    download_url=download_url
                ))
            
            return files
            
        except Exception as e:
            logger.error(f"HTTP目录列表解析失败: {e}")
            return []

class Aria2Client:
    """Aria2客户端，使用aria2p库"""
    
    def __init__(self, rpc_url: str = "http://localhost:6800/jsonrpc", secret: str = ""):
        self.rpc_url = rpc_url
        self.secret = secret
        self.aria2 = None
        self._connect()
    
    def _connect(self):
        """连接到Aria2"""
        try:
            # 确保URL包含协议
            rpc_url = self.rpc_url
            if not rpc_url.startswith(('http://', 'https://')):
                rpc_url = 'http://' + rpc_url
            
            # 解析RPC URL
            from urllib.parse import urlparse
            parsed_url = urlparse(rpc_url)
            
            # 构建完整的host URL（包含协议）
            host_with_protocol = f"{parsed_url.scheme}://{parsed_url.hostname}"
            port = parsed_url.port or 6800
            
            logger.info(f"尝试连接Aria2: {host_with_protocol}:{port}")
            
            # 创建aria2p客户端 - host参数需要包含协议
            client = aria2p.Client(
                host=host_with_protocol,
                port=port,
                secret=self.secret if self.secret else None
            )
            
            self.aria2 = aria2p.API(client)
            
        except Exception as e:
            logger.error(f"连接Aria2失败: {e}")
            self.aria2 = None
    
    def test_connection(self) -> bool:
        """测试连接"""
        try:
            if not self.aria2:
                self._connect()
            
            if self.aria2:
                # 尝试获取版本信息来测试连接
                version = self.aria2.client.get_version()
                return True
        except Exception as e:
            logger.error(f"Aria2连接测试失败: {e}")
            return False
        
        return False
    
    def add_download(self, url: str, options: Dict[str, str] = None) -> str:
        """添加下载任务"""
        try:
            if not self.aria2:
                raise Exception("Aria2未连接")
            
            # 转换选项格式
            aria2_options = {}
            if options:
                for key, value in options.items():
                    aria2_options[key] = value
            
            # 添加下载
            download = self.aria2.add_uris([url], options=aria2_options)
            return download.gid
            
        except Exception as e:
            logger.error(f"添加下载任务失败: {e}")
            raise
    
    def get_version(self) -> Dict[str, Any]:
        """获取Aria2版本信息"""
        try:
            if not self.aria2:
                raise Exception("Aria2未连接")
            
            version_info = self.aria2.client.get_version()
            return version_info
            
        except Exception as e:
            logger.error(f"获取版本信息失败: {e}")
            raise
    
    def get_downloads(self) -> List[Dict[str, Any]]:
        """获取下载列表"""
        try:
            if not self.aria2:
                raise Exception("Aria2未连接")
            
            downloads = self.aria2.get_downloads()
            result = []
            
            for download in downloads:
                # 构建兼容的数据结构
                download_data = {
                    "gid": download.gid,
                    "status": download.status,
                    "name": download.name or "未知文件",
                    "totalLength": download.total_length,
                    "completedLength": download.completed_length,
                    "downloadSpeed": download.download_speed,
                    "progress": download.progress,
                    "files": []
                }
                
                # 添加文件信息
                if hasattr(download, 'files') and download.files:
                    for file in download.files:
                        file_data = {
                            "uris": []
                        }
                        if hasattr(file, 'uris') and file.uris:
                            for uri in file.uris:
                                file_data["uris"].append({
                                    "uri": uri.uri if hasattr(uri, 'uri') else str(uri)
                                })
                        download_data["files"].append(file_data)
                else:
                    # 如果没有files信息，创建一个默认的
                    download_data["files"] = [{
                        "uris": [{
                            "uri": download.name or "未知文件"
                        }]
                    }]
                
                result.append(download_data)
            
            return result
            
        except Exception as e:
            logger.error(f"获取下载列表失败: {e}")
            raise
    
    def pause_download(self, gid: str) -> bool:
        """暂停下载"""
        try:
            if not self.aria2:
                raise Exception("Aria2未连接")
            
            download = self.aria2.get_download(gid)
            download.pause()
            return True
            
        except Exception as e:
            logger.error(f"暂停下载失败: {e}")
            return False
    
    def resume_download(self, gid: str) -> bool:
        """恢复下载"""
        try:
            if not self.aria2:
                raise Exception("Aria2未连接")
            
            download = self.aria2.get_download(gid)
            download.resume()
            return True
            
        except Exception as e:
            logger.error(f"恢复下载失败: {e}")
            return False
    
    def remove_download(self, gid: str) -> bool:
        """删除下载任务"""
        try:
            if not self.aria2:
                raise Exception("Aria2未连接")
            
            download = self.aria2.get_download(gid)
            download.remove()
            return True
            
        except Exception as e:
            logger.error(f"删除下载任务失败: {e}")
            return False