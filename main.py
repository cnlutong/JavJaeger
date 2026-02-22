from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import httpx
import logging
import datetime
import asyncio
import json
import os
import hashlib
import subprocess
from typing import List, Dict, Optional
from pikpakapi import PikPakApi
import re
from cilisousuo_cli import get_best_magnet as cilisousuo_get_best_magnet, is_4k_resource

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)

# 版本信息获取函数
def get_version_info():
    """
    从Git获取版本信息
    :return: 包含版本号和构建日期的字典
    """
    version_info = {
        'version': 'v1.0.0',  # 默认版本
        'build_date': datetime.datetime.now().strftime('%Y-%m-%d')  # 默认构建日期
    }
    
    try:
        # 获取Git标签作为版本号
        try:
            git_tag = subprocess.check_output(
                ['git', 'describe', '--tags', '--abbrev=0'], 
                stderr=subprocess.DEVNULL,
                cwd=os.path.dirname(os.path.abspath(__file__))
            ).decode('utf-8').strip()
            if git_tag:
                version_info['version'] = git_tag if git_tag.startswith('v') else f'v{git_tag}'
        except (subprocess.CalledProcessError, FileNotFoundError):
            # 如果没有标签或Git不可用，使用提交哈希的前7位
            try:
                git_hash = subprocess.check_output(
                    ['git', 'rev-parse', '--short=7', 'HEAD'],
                    stderr=subprocess.DEVNULL,
                    cwd=os.path.dirname(os.path.abspath(__file__))
                ).decode('utf-8').strip()
                if git_hash:
                    version_info['version'] = f'v1.0.0-{git_hash}'
            except (subprocess.CalledProcessError, FileNotFoundError):
                logging.warning("Git不可用，使用默认版本信息")
        
        # 获取最后一次提交的日期作为构建日期
        try:
            git_date = subprocess.check_output(
                ['git', 'log', '-1', '--format=%cd', '--date=short'],
                stderr=subprocess.DEVNULL,
                cwd=os.path.dirname(os.path.abspath(__file__))
            ).decode('utf-8').strip()
            if git_date:
                version_info['build_date'] = git_date
        except (subprocess.CalledProcessError, FileNotFoundError):
            logging.warning("无法获取Git提交日期，使用当前日期")
            
    except Exception as e:
        logging.warning(f"获取Git版本信息失败: {str(e)}")
    
    return version_info

# 获取版本信息
VERSION_INFO = get_version_info()
logging.info(f"应用版本信息: {VERSION_INFO}")

# 内存缓存（替代Redis以保持轻量化）
memory_cache = {}
CACHE_EXPIRE_TIME = 3600  # 缓存1小时

# 加载配置文件
def load_config():
    """加载配置文件"""
    try:
        with open('config.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logging.error(f"加载配置文件失败: {str(e)}")
        # 返回默认配置
        return {
            "javbus_api": {
                "host": "10.0.0.20",
                "port": 3000,
                "base_url": "http://10.0.0.20:3000"
            }
        }

# 全局配置
config = load_config()
# 优先使用环境变量，如果没有则使用配置文件
JAVBUS_API_BASE_URL = os.getenv('JAVBUS_API_BASE_URL', config['javbus_api']['base_url'])

# 初始化FastAPI应用
app = FastAPI(title="JavJaeger", description="基于JavBus的高效影片系统")

# 应用启动事件
@app.on_event("startup")
async def startup_event():
    """应用启动时的初始化操作"""
    logging.info("JavJaeger 应用启动中...")
    # 初始化下载记录文件
    await load_downloaded_movies()
    logging.info("JavJaeger 应用启动完成")

# PikPak客户端实例
pikpak_client = None

# 数据模型
class PikPakCredentials(BaseModel):
    username: str
    password: str

class DownloadRequest(BaseModel):
    magnet_links: list[str]
    movie_ids: list[str]  # 影片番号列表
    username: str
    password: str

class MovieRecognitionRequest(BaseModel):
    html_content: str
    auto_download: bool = True
    username: Optional[str] = None
    password: Optional[str] = None
    exclude_4k: bool = False  # 是否排除4K资源

class MovieCodeDownloadRequest(BaseModel):
    movie_codes: str  # 用户输入的番号字符串
    auto_download: bool = True
    username: Optional[str] = None
    password: Optional[str] = None
    exclude_4k: bool = False  # 是否排除4K资源

# 挂载静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")

# 模板配置
templates = Jinja2Templates(directory="templates")

# 下载记录文件路径
DOWNLOADED_MOVIES_FILE = "data/downloaded_movies.json"

# 缓存管理函数
def get_cache_key(url: str, params: dict = None) -> str:
    """生成缓存键"""
    cache_string = url
    if params:
        cache_string += str(sorted(params.items()))
    return hashlib.md5(cache_string.encode()).hexdigest()

def get_from_cache(key: str):
    """从缓存获取数据"""
    if key in memory_cache:
        data, timestamp = memory_cache[key]
        if datetime.datetime.now().timestamp() - timestamp < CACHE_EXPIRE_TIME:
            return data
        else:
            del memory_cache[key]
    return None

def set_cache(key: str, data):
    """设置缓存数据"""
    memory_cache[key] = (data, datetime.datetime.now().timestamp())

async def fetch_with_cache(url: str, params: dict = None):
    """带缓存的API请求"""
    cache_key = get_cache_key(url, params)
    
    # 尝试从缓存获取
    cached_data = get_from_cache(cache_key)
    if cached_data is not None:
        logging.info(f"缓存命中: {url}")
        return cached_data
    
    # 缓存未命中，发起请求
    try:
        # 最大安全频率：1秒间隔，避免API限制
        await asyncio.sleep(1.0)  # 1000ms间隔
        
        # 构建完整的请求URL用于日志记录
        full_url = url
        if params:
            query_string = "&".join([f"{k}={v}" for k, v in params.items()])
            full_url = f"{url}?{query_string}"
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params)
            logging.info(f"API请求: {full_url} 状态: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                set_cache(cache_key, data)
                return data
            else:
                logging.warning(f"API请求失败: {full_url} 状态: {response.status_code} 响应: {response.text[:200]}")
                return None
    except Exception as e:
        logging.error(f"API请求异常: {url} 错误: {str(e)}")
        return None

# 下载记录管理（使用内存存储以保持轻量化）
downloaded_movies_cache = {}
downloaded_movies_loaded = False

async def load_downloaded_movies():
    """加载已下载的影片记录"""
    global downloaded_movies_cache, downloaded_movies_loaded
    
    if downloaded_movies_loaded:
        return list(downloaded_movies_cache.values())
    
    try:
        # 确保data目录存在
        os.makedirs(os.path.dirname(DOWNLOADED_MOVIES_FILE), exist_ok=True)
        
        if os.path.exists(DOWNLOADED_MOVIES_FILE):
            with open(DOWNLOADED_MOVIES_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                downloaded_movies_cache = {record['movie_id']: record for record in data}
                logging.info(f"已加载 {len(downloaded_movies_cache)} 条下载记录")
        else:
            # 如果文件不存在，创建一个空的JSON文件
            empty_data = []
            with open(DOWNLOADED_MOVIES_FILE, 'w', encoding='utf-8') as f:
                json.dump(empty_data, f, ensure_ascii=False, indent=2)
            logging.info(f"已创建空的下载记录文件: {DOWNLOADED_MOVIES_FILE}")
            downloaded_movies_cache = {}
            
        downloaded_movies_loaded = True
        return list(downloaded_movies_cache.values())
    except Exception as e:
        logging.error(f"加载下载记录失败: {str(e)}")
        downloaded_movies_cache = {}
        return []

async def save_downloaded_movies(movie_ids: List[str]):
    """保存已下载的影片记录，保留原有时间并补全详细信息"""
    global downloaded_movies_cache
    
    try:
        # 确保data目录存在
        os.makedirs(os.path.dirname(DOWNLOADED_MOVIES_FILE), exist_ok=True)
        
        current_time = datetime.datetime.now().isoformat()
        
        for movie_id in movie_ids:
            if movie_id not in downloaded_movies_cache or 'title' not in downloaded_movies_cache[movie_id]:
                # 尝试获取详细信息
                try:
                    movie_url = f"{JAVBUS_API_BASE_URL}/api/movies/{movie_id}"
                    movie_data = await fetch_with_cache(movie_url)
                    if not movie_data: movie_data = {}
                except Exception as e:
                    logging.warning(f"获取影片 {movie_id} 详情失败: {str(e)}")
                    movie_data = {}
                
                record = downloaded_movies_cache.get(movie_id, {
                    'movie_id': movie_id,
                    'download_time': current_time
                })
                
                # 更新详细信息
                record['title'] = movie_data.get('title', '')
                record['date'] = movie_data.get('date', '')
                
                stars = movie_data.get('stars', [])
                record['stars'] = [s.get('name', '') for s in stars] if isinstance(stars, list) else []
                
                genres = movie_data.get('genres', [])
                record['genres'] = [g.get('name', '') for g in genres] if isinstance(genres, list) else []
                
                record['cover'] = movie_data.get('cover', '')
                
                downloaded_movies_cache[movie_id] = record
        
        # 转换为列表保存
        downloaded_movies = list(downloaded_movies_cache.values())
        
        # 按下载时间降序排序
        downloaded_movies.sort(key=lambda x: x.get('download_time', ''), reverse=True)
        
        with open(DOWNLOADED_MOVIES_FILE, 'w', encoding='utf-8') as f:
            json.dump(downloaded_movies, f, ensure_ascii=False, indent=2)
        
        logging.info(f"保存下载记录: {movie_ids}")
    except Exception as e:
        logging.error(f"保存下载记录失败: {str(e)}")

async def is_movie_downloaded(movie_id: str) -> bool:
    """
    检查影片是否已下载
    """
    global downloaded_movies_cache, downloaded_movies_loaded
    
    if not downloaded_movies_loaded:
        await load_downloaded_movies()
    
    return movie_id in downloaded_movies_cache

def parse_movie_codes(movie_codes_input: str) -> List[str]:
    """
    解析用户输入的番号字符串，支持多种分隔符
    :param movie_codes_input: 用户输入的番号字符串
    :return: 番号列表
    """
    if not movie_codes_input or not movie_codes_input.strip():
        return []
    
    # 清理输入并转换为大写
    cleaned_input = movie_codes_input.strip().upper()
    
    # 使用正则表达式分割，支持空格、换行、逗号、分号等分隔符
    movie_codes = re.split(r'[,，\s\n\r\t;；]+', cleaned_input)
    
    # 过滤空字符串并去除首尾空格
    movie_codes = [code.strip() for code in movie_codes if code.strip()]
    
    # 验证番号格式（基本的字母数字组合）
    valid_codes = []
    for code in movie_codes:
        # 基本的番号格式验证：包含字母和数字
        if re.match(r'^[A-Z0-9\-]+$', code) and len(code) >= 3:
            valid_codes.append(code)
        else:
            logging.warning(f"跳过无效番号格式: {code}")
    
    logging.info(f"解析到 {len(valid_codes)} 个有效番号: {valid_codes}")
    return valid_codes

def parse_movies_from_html(html_content: str) -> List[Dict[str, str]]:
    """
    从HTML内容中解析影片信息
    :param html_content: HTML源代码
    :return: 影片信息列表
    """
    movies = []
    
    try:
        # 查找videothumblist区域
        videothumblist_match = re.search(
            r'<div class="videothumblist">(.*?)</div><!-- end of videothumblist -->',
            html_content, re.DOTALL
        )
        
        if not videothumblist_match:
            logging.warning("未找到videothumblist区域")
            return movies
        
        videothumblist_content = videothumblist_match.group(1)
        
        # 匹配每个video div，包含内部的toolbar
        video_pattern = r'<div class="video"[^>]*?>(.*?)<div class="toolbar".*?</div>\s*</div>'
        video_matches = re.findall(video_pattern, html_content, re.DOTALL)
        
        logging.info(f"找到 {len(video_matches)} 个影片匹配项")
        
        for i, video_content in enumerate(video_matches):
            # 提取title属性
            title_match = re.search(r'title="([^"]+)"', video_content)
            # 提取影片编号
            id_match = re.search(r'<div class="id">([^<]+)</div>', video_content)
            
            if title_match and id_match:
                full_title = title_match.group(1).strip()
                movie_id = id_match.group(1).strip()
                
                # 处理标题，提取简短标题
                title_parts = full_title.split(' ', 1)
                title = title_parts[1] if len(title_parts) > 1 else full_title
                
                movie_info = {
                    "id": movie_id,
                    "title": title,
                    "full_title": full_title,
                    "rank": i + 1
                }
                
                movies.append(movie_info)
                logging.info(f"成功添加影片: {movie_id} - {title}")
        
        logging.info(f"总共解析到 {len(movies)} 部影片")
        
    except Exception as e:
        logging.error(f"解析HTML内容失败: {str(e)}")
    
    return movies

# 主页路由
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """
    主页路由
    :param request: 请求对象
    :return: 渲染后的主页模板
    """
    return templates.TemplateResponse("index.html", {
        "request": request,
        "version_info": VERSION_INFO
    })

@app.get("/api/system/info")
async def get_system_info():
    """
    获取系统信息，用于诊断环境差异
    :return: 系统信息
    """
    import platform
    import sys
    
    system_info = {
        "version": VERSION_INFO,
        "python_version": sys.version,
        "platform": platform.platform(),
        "architecture": platform.architecture(),
        "hostname": platform.node(),
        "javbus_api_base_url": JAVBUS_API_BASE_URL,
        "cache_size": len(memory_cache),
        "downloaded_movies_count": len(downloaded_movies_cache),
        "config": config,
        "environment_variables": {
            "JAVBUS_API_BASE_URL": os.getenv('JAVBUS_API_BASE_URL'),
        }
    }
    
    return system_info

@app.get("/api/history")
async def get_history():
    """
    获取历史下载记录
    :return: 历史下载记录列表
    """
    try:
        if os.path.exists(DOWNLOADED_MOVIES_FILE):
            with open(DOWNLOADED_MOVIES_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # 按下载时间降序排序（以防文件中的顺序不是最新的在最前）
                data.sort(key=lambda x: x.get('download_time', ''), reverse=True)
                return data
        return []
    except Exception as e:
        logging.error(f"读取历史记录失败: {str(e)}")
        return []

@app.get("/api/movies")
async def get_movies(request: Request):
    """
    获取影片列表，支持筛选和分页
    :param request: 请求对象
    :return: 影片列表数据
    """
    # 构建目标API URL
    api_url = f"{JAVBUS_API_BASE_URL}/api/movies"
    
    # 提取演员人数筛选参数
    actor_count_filter = request.query_params.get('actorCountFilter')
    
    # 转发除演员人数筛选和字幕筛选外的所有查询参数
    # 字幕筛选不在影片列表级别进行，而是在磁力链接级别进行
    query_params = dict(request.query_params)
    if 'actorCountFilter' in query_params:
        del query_params['actorCountFilter']
    if 'hasSubtitle' in query_params:
        del query_params['hasSubtitle']
    
    # 使用缓存获取数据
    data = await fetch_with_cache(api_url, query_params)
    if data is None:
        return {"error": "获取影片列表失败", "message": "API请求失败"}
    
    # 如果有演员人数筛选条件，需要获取每个影片的详细信息进行筛选
    if actor_count_filter and data.get('movies'):
        filtered_movies = []
        
        # 并发获取影片详情以检查演员数量
        async def check_movie_filters(movie):
            try:
                movie_url = f"{JAVBUS_API_BASE_URL}/api/movies/{movie['id']}"
                movie_detail = await fetch_with_cache(movie_url)
                
                if not movie_detail:
                    return None
                
                # 检查演员人数筛选条件
                if actor_count_filter:
                    if 'stars' not in movie_detail:
                        return None
                    
                    actor_count = len(movie_detail['stars'])
                    
                    if actor_count_filter == '1' and actor_count != 1:
                        return None
                    elif actor_count_filter == '2' and actor_count != 2:
                        return None
                    elif actor_count_filter == '3' and actor_count != 3:
                        return None
                    elif actor_count_filter == '<=2' and actor_count > 2:
                        return None
                    elif actor_count_filter == '<=3' and actor_count > 3:
                        return None
                    elif actor_count_filter == '>=3' and actor_count < 3:
                        return None
                    elif actor_count_filter == '>=4' and actor_count < 4:
                        return None
                
                return movie
                
            except Exception as e:
                logging.error(f"检查影片 {movie['id']} 筛选条件失败: {str(e)}")
                return None
        
        # 限制并发数量以避免过多请求
        semaphore = asyncio.Semaphore(3)
        
        async def limited_check(movie):
            async with semaphore:
                return await check_movie_filters(movie)
        
        # 并发检查所有影片
        tasks = [limited_check(movie) for movie in data['movies']]
        results = await asyncio.gather(*tasks)
        
        # 过滤掉None结果
        filtered_movies = [movie for movie in results if movie is not None]
        
        # 更新返回数据
        data['movies'] = filtered_movies
        
        # 更新分页信息（如果存在）
        if 'pagination' in data:
            data['pagination']['total'] = len(filtered_movies)
    
    return data

@app.get("/api/movies/all")
async def get_all_movies(request: Request):
    """
    获取所有页面的影片列表，支持筛选
    :param request: 请求对象
    :return: 所有页面的影片列表数据
    """
    # 提取演员人数筛选参数
    actor_count_filter = request.query_params.get('actorCountFilter')
    
    # 转发除演员人数筛选、字幕筛选和页码外的所有查询参数
    query_params = dict(request.query_params)
    if 'actorCountFilter' in query_params:
        del query_params['actorCountFilter']
    if 'hasSubtitle' in query_params:
        del query_params['hasSubtitle']
    if 'page' in query_params:
        del query_params['page']
    
    all_movies = []
    current_page = 1
    total_pages = None
    
    try:
        while True:
            # 构建当前页的API URL
            api_url = f"{JAVBUS_API_BASE_URL}/api/movies"
            page_params = query_params.copy()
            page_params['page'] = str(current_page)
            
            # 获取当前页数据
            data = await fetch_with_cache(api_url, page_params)
            if data is None or not data.get('movies'):
                break
            
            # 添加当前页的影片到总列表
            all_movies.extend(data['movies'])
            
            # 获取总页数信息
            if total_pages is None and data.get('pagination'):
                total_pages = data['pagination'].get('totalPages')
                if total_pages is None:
                    # 如果没有总页数信息，尝试从页面列表获取
                    pages = data['pagination'].get('pages', [])
                    if pages:
                        total_pages = max(pages)
            
            # 检查是否还有下一页
            if total_pages and current_page >= total_pages:
                break
            elif not total_pages and len(data['movies']) < 30:  # 假设每页30个影片
                break
            
            current_page += 1
            
            # 安全限制：最多获取100页，避免无限循环
            if current_page > 100:
                logging.warning("达到最大页数限制(100页)，停止获取")
                break
        
        # 如果有演员人数筛选条件，需要获取每个影片的详细信息进行筛选
        if actor_count_filter and all_movies:
            filtered_movies = []
            
            # 并发获取影片详情以检查演员数量
            async def check_movie_filters(movie):
                try:
                    movie_url = f"{JAVBUS_API_BASE_URL}/api/movies/{movie['id']}"
                    movie_detail = await fetch_with_cache(movie_url)
                    
                    if not movie_detail:
                        return None
                    
                    # 检查演员人数筛选条件
                    if actor_count_filter:
                        if 'stars' not in movie_detail:
                            return None
                        
                        actor_count = len(movie_detail['stars'])
                        
                        if actor_count_filter == '1' and actor_count != 1:
                            return None
                        elif actor_count_filter == '2' and actor_count != 2:
                            return None
                        elif actor_count_filter == '3' and actor_count != 3:
                            return None
                        elif actor_count_filter == '<=2' and actor_count > 2:
                            return None
                        elif actor_count_filter == '<=3' and actor_count > 3:
                            return None
                        elif actor_count_filter == '>=3' and actor_count < 3:
                            return None
                        elif actor_count_filter == '>=4' and actor_count < 4:
                            return None
                    
                    return movie
                    
                except Exception as e:
                    logging.error(f"检查影片 {movie['id']} 筛选条件失败: {str(e)}")
                    return None
            
            # 限制并发数量以避免过多请求
            semaphore = asyncio.Semaphore(5)
            
            async def limited_check(movie):
                async with semaphore:
                    return await check_movie_filters(movie)
            
            # 分批处理以避免内存问题
            batch_size = 50
            for i in range(0, len(all_movies), batch_size):
                batch = all_movies[i:i + batch_size]
                tasks = [limited_check(movie) for movie in batch]
                results = await asyncio.gather(*tasks)
                
                # 过滤掉None结果
                batch_filtered = [movie for movie in results if movie is not None]
                filtered_movies.extend(batch_filtered)
            
            all_movies = filtered_movies
        
        return {
            "movies": all_movies,
            "total_count": len(all_movies),
            "total_pages": current_page - 1,
            "is_all_pages": True,
            "pagination": {
                "currentPage": "all",
                "totalPages": current_page - 1,
                "total": len(all_movies)
            }
        }
        
    except Exception as e:
        logging.error(f"获取所有页面影片失败: {str(e)}")
        return {"error": "获取所有页面影片失败", "message": str(e)}

@app.get("/api/movies/{movieId}")
async def get_movie(movieId: str, request: Request):
    """
    获取特定影片信息
    :param movieId: 影片ID
    :param request: 请求对象
    :return: 影片信息
    """
    # 构建目标API URL
    api_url = f"{JAVBUS_API_BASE_URL}/api/movies/{movieId}"
    
    # 使用缓存获取数据
    data = await fetch_with_cache(api_url)
    if data is None:
        return {"error": "获取影片信息失败", "message": "影片不存在或API请求失败"}
    
    return data

def select_best_magnet_with_subtitle_filter(magnet_data, has_subtitle_filter=None, exclude_4k=False):
    """
    根据字幕筛选条件选择最佳磁力链接
    :param magnet_data: 磁力链接数据列表
    :param has_subtitle_filter: 字幕筛选条件 ('true', 'false', 或 None)
    :param exclude_4k: 是否排除4K资源
    :return: 最佳磁力链接
    """
    if not magnet_data or len(magnet_data) == 0:
        return None
    
    # 如果需要排除4K资源，先过滤
    if exclude_4k:
        filtered_data = []
        for magnet in magnet_data:
            title = magnet.get('title', '')
            if not is_4k_resource(title):
                filtered_data.append(magnet)
        if filtered_data:
            magnet_data = filtered_data
            logging.info(f"排除4K后剩余 {len(magnet_data)} 个磁力链接")
        else:
            logging.warning("排除4K后没有可用的磁力链接，将使用原始列表")
    
    # 如果没有字幕筛选条件，返回第一个（按大小排序的最大的）
    if not has_subtitle_filter:
        return magnet_data[0]
    
    # 根据字幕筛选条件过滤磁力链接
    filtered_magnets = []
    for magnet in magnet_data:
        magnet_has_subtitle = magnet.get('hasSubtitle', False)
        
        if has_subtitle_filter == 'true' and magnet_has_subtitle:
            filtered_magnets.append(magnet)
        elif has_subtitle_filter == 'false' and not magnet_has_subtitle:
            filtered_magnets.append(magnet)
    
    # 如果有符合条件的磁力链接，返回第一个（最大的）
    if filtered_magnets:
        return filtered_magnets[0]
    
    # 如果没有符合条件的磁力链接，返回None
    return None

@app.get("/api/magnets/{movieId}")
async def get_magnets(movieId: str, request: Request):
    """
    获取特定影片的磁力链接
    :param movieId: 影片ID
    :param request: 请求对象
    :return: 磁力链接数据
    """
    # 检查是否使用 cilisousuo 作为磁力链接来源
    magnet_source = request.query_params.get('source', 'javbus')
    
    if magnet_source == 'cilisousuo':
        # 使用 cilisousuo 获取磁力链接
        try:
            magnet_link = await cilisousuo_get_best_magnet(movieId)
            if magnet_link:
                # 返回符合前端期望的格式
                return [{
                    "link": magnet_link,
                    "title": f"{movieId} - 最佳资源",
                    "size": "未知",
                    "date": "未知",
                    "hasSubtitle": False  # cilisousuo 不提供字幕信息
                }]
            else:
                return []
        except Exception as e:
            logging.error(f"从 cilisousuo 获取磁力链接失败: {str(e)}")
            return {"error": "从 cilisousuo 获取磁力链接失败", "message": str(e)}
    
    # 默认使用 javbus-api
    # 构建目标API URL
    api_url = f"{JAVBUS_API_BASE_URL}/api/magnets/{movieId}"
    
    # 提取字幕筛选参数
    has_subtitle_filter = request.query_params.get('hasSubtitle')
    exclude_4k = request.query_params.get('exclude4k', 'false').lower() == 'true'
    
    # 转发除字幕筛选、source和exclude4k外的所有查询参数
    query_params = dict(request.query_params)
    if 'hasSubtitle' in query_params:
        del query_params['hasSubtitle']
    if 'source' in query_params:
        del query_params['source']
    if 'exclude4k' in query_params:
        del query_params['exclude4k']
    
    # 如果缺少 gid 或 uc，自动从影片详情获取（javbus-api 需要这些参数才能获取磁力链接）
    if 'gid' not in query_params or 'uc' not in query_params:
        try:
            movie_url = f"{JAVBUS_API_BASE_URL}/api/movies/{movieId}"
            movie_data = await fetch_with_cache(movie_url)
            if movie_data and 'gid' in movie_data and 'uc' in movie_data:
                query_params['gid'] = str(movie_data['gid'])
                query_params['uc'] = str(movie_data['uc'])
            else:
                logging.warning(f"无法从影片详情获取必需的 gid/uc 参数: {movieId}")
        except Exception as e:
            logging.error(f"获取影片详情(为了gid/uc)失败: {movieId} - {str(e)}")
    
    # 使用缓存获取数据
    data = await fetch_with_cache(api_url, query_params)
    if data is None:
        return {"error": "获取磁力链接失败", "message": "API请求失败"}
    
    # 如果需要排除4K资源，先过滤
    if exclude_4k and data:
        filtered_data = []
        for magnet in data:
            title = magnet.get('title', '')
            if not is_4k_resource(title):
                filtered_data.append(magnet)
        if filtered_data:
            logging.info(f"排除4K后剩余 {len(filtered_data)} 个磁力链接")
            data = filtered_data
        else:
            logging.warning("排除4K后没有可用的磁力链接，将返回原始列表")
    
    # 如果有字幕筛选条件，根据条件筛选磁力链接
    if has_subtitle_filter and data:
        filtered_data = []
        for magnet in data:
            magnet_has_subtitle = magnet.get('hasSubtitle', False)
            
            if has_subtitle_filter == 'true' and magnet_has_subtitle:
                filtered_data.append(magnet)
            elif has_subtitle_filter == 'false' and not magnet_has_subtitle:
                filtered_data.append(magnet)
        
        return filtered_data
    
    return data

@app.post("/api/movies/batch")
async def get_movies_batch(movie_ids: List[str], has_subtitle_filter: str = None):
    """
    批量获取影片信息和最佳磁力链接
    :param movie_ids: 影片ID列表
    :param has_subtitle_filter: 字幕筛选条件 ('true', 'false', 或 None)
    :return: 批量影片信息
    """
    results = []
    
    # 并发获取影片信息
    async def get_movie_with_magnet(movie_id: str):
        try:
            # 获取影片详情
            movie_url = f"{JAVBUS_API_BASE_URL}/api/movies/{movie_id}"
            movie_data = await fetch_with_cache(movie_url)
            
            if not movie_data or not movie_data.get('gid') or movie_data.get('uc') is None:
                return {
                    "movie_id": movie_id,
                    "success": False,
                    "error": "影片不存在或无法获取参数"
                }
            
            # 获取磁力链接
            magnet_url = f"{JAVBUS_API_BASE_URL}/api/magnets/{movie_id}"
            magnet_params = {
                'gid': movie_data['gid'],
                'uc': movie_data['uc'],
                'sortBy': 'size',
                'sortOrder': 'desc'
            }
            magnet_data = await fetch_with_cache(magnet_url, magnet_params)
            
            # 检查下载状态
            is_downloaded = await is_movie_downloaded(movie_id)
            
            # 根据字幕筛选条件获取最佳磁力链接
            best_magnet = select_best_magnet_with_subtitle_filter(magnet_data, has_subtitle_filter)
            
            return {
                "movie_id": movie_id,
                "success": True,
                "title": movie_data.get('title', ''),
                "date": movie_data.get('date', ''),
                "is_downloaded": is_downloaded,
                "best_magnet": best_magnet
            }
            
        except Exception as e:
            logging.error(f"获取影片 {movie_id} 信息失败: {str(e)}")
            return {
                "movie_id": movie_id,
                "success": False,
                "error": str(e)
            }
    
    # 并发处理，但限制并发数量
    semaphore = asyncio.Semaphore(3)  
    
    async def limited_get_movie(movie_id: str):
        async with semaphore:
            return await get_movie_with_magnet(movie_id)
    
    # 执行并发请求
    tasks = [limited_get_movie(movie_id) for movie_id in movie_ids]
    results = await asyncio.gather(*tasks)
    
    return {
        "success": True,
        "results": results,
        "total_count": len(results)
    }

@app.post("/api/movies/batch-stream")
async def get_movies_batch_stream(request: Request):
    """
    流式批量获取影片信息和最佳磁力链接，逐个返回结果
    :param request: 请求对象，包含movie_ids和has_subtitle_filter
    :return: 流式影片信息
    """
    from fastapi.responses import StreamingResponse
    import json
    
    # 解析请求体
    try:
        body = await request.json()
        if isinstance(body, list):
            # 兼容旧格式（直接传递影片ID列表）
            movie_ids = body
            has_subtitle_filter = None
            magnet_source = 'javbus'
        else:
            # 新格式（包含movie_ids和has_subtitle_filter）
            movie_ids = body.get('movie_ids', [])
            has_subtitle_filter = body.get('has_subtitle_filter')
            magnet_source = body.get('magnet_source', 'javbus')
    except Exception as e:
        logging.error(f"解析请求体失败: {str(e)}")
        return {"error": "请求格式错误"}
    
    async def generate_results():
        # 并发获取影片信息的函数
        async def get_movie_with_magnet(movie_id: str):
            try:
                # 检查下载状态
                is_downloaded = await is_movie_downloaded(movie_id)
                
                # 如果使用 cilisousuo，直接从 cilisousuo 获取磁力链接
                if magnet_source == 'cilisousuo':
                    try:
                        magnet_link = await cilisousuo_get_best_magnet(movie_id)
                        if magnet_link:
                            best_magnet = {
                                "link": magnet_link,
                                "title": f"{movie_id} - 最佳资源",
                                "size": "未知",
                                "date": "未知",
                                "hasSubtitle": False
                            }
                            # 获取影片标题（用于显示）
                            movie_url = f"{JAVBUS_API_BASE_URL}/api/movies/{movie_id}"
                            movie_data = await fetch_with_cache(movie_url)
                            
                            return {
                                "movie_id": movie_id,
                                "success": True,
                                "title": movie_data.get('title', movie_id) if movie_data else movie_id,
                                "date": movie_data.get('date', '未知') if movie_data else '未知',
                                "is_downloaded": is_downloaded,
                                "best_magnet": best_magnet
                            }
                        else:
                            return {
                                "movie_id": movie_id,
                                "success": False,
                                "error": "未找到磁力链接"
                            }
                    except Exception as e:
                        logging.error(f"从 cilisousuo 获取影片 {movie_id} 磁力链接失败: {str(e)}")
                        return {
                            "movie_id": movie_id,
                            "success": False,
                            "error": f"cilisousuo 获取失败: {str(e)}"
                        }
                
                # 默认使用 javbus-api
                # 获取影片详情
                movie_url = f"{JAVBUS_API_BASE_URL}/api/movies/{movie_id}"
                movie_data = await fetch_with_cache(movie_url)
                
                if not movie_data or not movie_data.get('gid') or movie_data.get('uc') is None:
                    return {
                        "movie_id": movie_id,
                        "success": False,
                        "error": "影片不存在或无法获取参数"
                    }
                
                # 获取磁力链接
                magnet_url = f"{JAVBUS_API_BASE_URL}/api/magnets/{movie_id}"
                magnet_params = {
                    'gid': movie_data['gid'],
                    'uc': movie_data['uc'],
                    'sortBy': 'size',
                    'sortOrder': 'desc'
                }
                magnet_data = await fetch_with_cache(magnet_url, magnet_params)
                
                # 根据字幕筛选条件获取最佳磁力链接
                best_magnet = select_best_magnet_with_subtitle_filter(magnet_data, has_subtitle_filter)
                
                return {
                    "movie_id": movie_id,
                    "success": True,
                    "title": movie_data.get('title', ''),
                    "date": movie_data.get('date', ''),
                    "is_downloaded": is_downloaded,
                    "best_magnet": best_magnet
                }
                
            except Exception as e:
                logging.error(f"获取影片 {movie_id} 信息失败: {str(e)}")
                return {
                    "movie_id": movie_id,
                    "success": False,
                    "error": str(e)
                }
        
        # 发送开始信号
        yield f"data: {json.dumps({'type': 'start', 'total': len(movie_ids)})}\n\n"
        
        # 并发处理，但限制并发数量
        semaphore = asyncio.Semaphore(3)  # 限制并发数量到3
        
        async def limited_get_movie(movie_id: str, index: int):
            async with semaphore:
                result = await get_movie_with_magnet(movie_id)
                result['index'] = index + 1
                result['type'] = 'progress'
                return result
        
        # 批量处理影片，每批处理5个
        batch_size = 5
        for i in range(0, len(movie_ids), batch_size):
            batch_movie_ids = movie_ids[i:i + batch_size]
            batch_indices = list(range(i, min(i + batch_size, len(movie_ids))))
            
            # 并发处理当前批次
            tasks = [limited_get_movie(movie_id, idx) for movie_id, idx in zip(batch_movie_ids, batch_indices)]
            batch_results = await asyncio.gather(*tasks)
            
            # 按顺序发送结果
            for result in batch_results:
                yield f"data: {json.dumps(result)}\n\n"
            
            # 减少延迟时间以加快响应
            await asyncio.sleep(0.02)
        
        # 发送完成信号
        yield f"data: {json.dumps({'type': 'complete'})}\n\n"
    
    return StreamingResponse(
        generate_results(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*"
        }
    )

# API代理路由
@app.get("/api/{path:path}")
async def proxy_api(path: str, request: Request):
    """
    JavBus API代理路由
    :param path: API路径
    :param request: 请求对象
    :return: API响应数据
    """
    # 构建目标API URL
    api_url = f"{JAVBUS_API_BASE_URL}/api/{path}"
    
    # 转发查询参数
    query_params = dict(request.query_params)
    
    # 使用缓存获取数据
    data = await fetch_with_cache(api_url, query_params)
    if data is None:
        return {"error": "请求JavBus API失败", "message": "API请求失败"}
    
    return data

# PikPak相关API端点
@app.post("/api/pikpak/login")
async def pikpak_login(credentials: PikPakCredentials):
    """
    PikPak登录验证
    :param credentials: 用户凭据
    :return: 登录结果
    """
    global pikpak_client
    try:
        pikpak_client = PikPakApi(
            username=credentials.username,
            password=credentials.password
        )
        await pikpak_client.login()
        logging.info(f"PikPak登录成功: {credentials.username}")
        return {"success": True, "message": "登录成功"}
    except Exception as e:
        logging.error(f"PikPak登录失败: {str(e)}")
        return {"success": False, "message": f"登录失败: {str(e)}"}

@app.post("/api/pikpak/download")
async def pikpak_download(request: DownloadRequest):
    """
    通过PikPak下载磁力链接
    :param request: 下载请求
    :return: 下载结果
    """
    try:
        # 创建新的客户端实例
        client = PikPakApi(
            username=request.username,
            password=request.password
        )
        await client.login()
        
        # 批量添加下载任务
        results = []
        successful_movie_ids = []
        
        for i, magnet_link in enumerate(request.magnet_links):
            try:
                # 添加离线下载任务
                result = await client.offline_download(magnet_link)
                results.append({
                    "magnet": magnet_link,
                    "success": True,
                    "task_id": result.get("task", {}).get("id") if result else None
                })
                # 记录成功下载的影片番号
                if i < len(request.movie_ids):
                    successful_movie_ids.append(request.movie_ids[i])
                logging.info(f"成功添加下载任务: {magnet_link[:50]}...")
            except Exception as e:
                results.append({
                    "magnet": magnet_link,
                    "success": False,
                    "error": str(e)
                })
                logging.error(f"添加下载任务失败: {magnet_link[:50]}... - {str(e)}")
        
        # 保存下载记录
        if successful_movie_ids:
            await save_downloaded_movies(successful_movie_ids)
        
        success_count = sum(1 for r in results if r["success"])
        total_count = len(results)
        
        return {
            "success": success_count > 0,
            "message": f"成功添加 {success_count}/{total_count} 个下载任务",
            "results": results
        }
    except Exception as e:
        logging.error(f"PikPak下载失败: {str(e)}")
        raise HTTPException(status_code=400, detail=f"下载失败: {str(e)}")

@app.get("/api/downloaded-movies")
async def get_downloaded_movies():
    """
    获取已下载的影片列表
    :return: 已下载影片的番号列表
    """
    try:
        downloaded_movies = await load_downloaded_movies()
        return {
            "success": True,
            "downloaded_movies": [record['movie_id'] for record in downloaded_movies],
            "total_count": len(downloaded_movies)
        }
    except Exception as e:
        logging.error(f"获取下载记录失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取下载记录失败: {str(e)}")

@app.get("/api/downloaded-movies/{movie_id}")
async def check_movie_downloaded(movie_id: str):
    """
    检查特定影片是否已下载
    :param movie_id: 影片番号
    :return: 是否已下载
    """
    try:
        is_downloaded = await is_movie_downloaded(movie_id)
        return {
            "success": True,
            "movie_id": movie_id,
            "is_downloaded": is_downloaded
        }
    except Exception as e:
        logging.error(f"检查下载状态失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"检查下载状态失败: {str(e)}")

@app.post("/api/movies/recognize")
async def recognize_movies(request: MovieRecognitionRequest):
    """
    识别影片并可选择自动下载
    :param request: 影片识别请求
    :return: 识别和下载结果
    """
    try:
        # 解析HTML内容获取影片信息
        movies = parse_movies_from_html(request.html_content)
        
        if not movies:
            return {"error": "未能从HTML内容中解析到任何影片信息"}
        
        logging.info(f"成功解析到 {len(movies)} 部影片")
        
        # 如果启用自动下载且提供了登录信息
        if request.auto_download and request.username and request.password:
            # 获取影片番号列表
            movie_ids = [movie["id"] for movie in movies]
            
            # 批量获取磁力链接
            magnet_results = []
            for movie_id in movie_ids:
                try:
                    # 检查是否已下载
                    if await is_movie_downloaded(movie_id):
                        logging.info(f"影片 {movie_id} 已下载，跳过")
                        continue
                    
                    # 获取影片详情
                    movie_url = f"{JAVBUS_API_BASE_URL}/api/movies/{movie_id}"
                    movie_data = await fetch_with_cache(movie_url)
                    
                    if not movie_data or not movie_data.get('gid') or movie_data.get('uc') is None:
                        logging.warning(f"影片 {movie_id} 不存在或无法获取参数")
                        continue
                    
                    # 获取磁力链接
                    magnet_url = f"{JAVBUS_API_BASE_URL}/api/magnets/{movie_id}"
                    magnet_params = {
                        'gid': movie_data['gid'],
                        'uc': movie_data['uc'],
                        'sortBy': 'size',
                        'sortOrder': 'desc'
                    }
                    magnet_data = await fetch_with_cache(magnet_url, magnet_params)
                    
                    # 选择最佳磁力链接（优先无字幕的最大文件）
                    best_magnet = select_best_magnet_with_subtitle_filter(magnet_data, 'false', request.exclude_4k)
                    if not best_magnet:
                        # 如果没有无字幕的，选择任意最大的
                        best_magnet = select_best_magnet_with_subtitle_filter(magnet_data, None, request.exclude_4k)
                    
                    if best_magnet:
                        # 检查磁力链接字段是否存在
                        magnet_link = best_magnet.get("magnet_link") or best_magnet.get("magnetLink") or best_magnet.get("link")
                        if magnet_link:
                            magnet_results.append({
                                "movie_id": movie_id,
                                "magnet_link": magnet_link,
                                "title": best_magnet.get("title", ""),
                                "size": best_magnet.get("size", "")
                            })
                            logging.info(f"为影片 {movie_id} 找到磁力链接")
                        else:
                            logging.warning(f"影片 {movie_id} 的磁力数据中缺少链接字段: {list(best_magnet.keys())}")
                    else:
                        logging.warning(f"未找到影片 {movie_id} 的磁力链接")
                        
                except Exception as e:
                    logging.error(f"获取影片 {movie_id} 磁力链接失败: {str(e)}")
            
            # 如果有磁力链接，进行下载
            if magnet_results:
                magnet_links = [result["magnet_link"] for result in magnet_results]
                download_movie_ids = [result["movie_id"] for result in magnet_results]
                
                # 调用下载功能
                download_request = DownloadRequest(
                    magnet_links=magnet_links,
                    movie_ids=download_movie_ids,
                    username=request.username,
                    password=request.password
                )
                
                download_result = await pikpak_download(download_request)
                
                return {
                    "success": True,
                    "movies": movies,
                    "magnet_results": magnet_results,
                    "download_result": download_result
                }
            else:
                return {
                    "success": True,
                    "movies": movies,
                    "message": "解析成功，但未找到可下载的磁力链接"
                }
        else:
            # 仅返回解析结果
            return {
                "success": True,
                "movies": movies
            }
    
    except Exception as e:
        logging.error(f"影片识别失败: {str(e)}")
        return {"error": f"识别失败: {str(e)}"}

@app.post("/api/movies/download-by-codes")
async def download_movies_by_codes(request: MovieCodeDownloadRequest):
    """
    根据番号自动查找最佳影片并添加下载
    :param request: 番号下载请求
    :return: 搜索和下载结果
    """
    try:
        # 解析番号
        movie_codes = parse_movie_codes(request.movie_codes)
        
        if not movie_codes:
            return {"error": "未能解析到有效的番号"}
        
        logging.info(f"开始处理 {len(movie_codes)} 个番号: {movie_codes}")
        
        # 搜索影片信息
        found_movies = []
        not_found_codes = []
        
        for movie_code in movie_codes:
            try:
                # 检查是否已下载
                if await is_movie_downloaded(movie_code):
                    logging.info(f"影片 {movie_code} 已下载，跳过")
                    found_movies.append({
                        "id": movie_code,
                        "title": "已下载",
                        "status": "already_downloaded"
                    })
                    continue
                
                # 搜索影片
                movie_url = f"{JAVBUS_API_BASE_URL}/api/movies/{movie_code}"
                movie_data = await fetch_with_cache(movie_url)
                
                if movie_data and movie_data.get('id'):
                    found_movies.append({
                        "id": movie_data.get('id'),
                        "title": movie_data.get('title', ''),
                        "date": movie_data.get('date', ''),
                        "cover": movie_data.get('cover', ''),
                        "status": "found"
                    })
                    logging.info(f"找到影片: {movie_code} - {movie_data.get('title', '')}")
                else:
                    not_found_codes.append(movie_code)
                    logging.warning(f"未找到影片: {movie_code}")
                    
            except Exception as e:
                logging.error(f"搜索影片 {movie_code} 失败: {str(e)}")
                not_found_codes.append(movie_code)
        
        # 如果启用自动下载且提供了登录信息
        if request.auto_download and request.username and request.password:
            # 获取需要下载的影片（排除已下载的）
            movies_to_download = [movie for movie in found_movies if movie["status"] == "found"]
            
            if movies_to_download:
                # 批量获取磁力链接
                magnet_results = []
                for movie in movies_to_download:
                    try:
                        movie_id = movie["id"]
                        
                        # 获取影片详情以获取gid和uc参数
                        movie_url = f"{JAVBUS_API_BASE_URL}/api/movies/{movie_id}"
                        movie_data = await fetch_with_cache(movie_url)
                        
                        if not movie_data or not movie_data.get('gid') or movie_data.get('uc') is None:
                            logging.warning(f"影片 {movie_id} 不存在或无法获取参数")
                            continue
                        
                        # 获取磁力链接
                        magnet_url = f"{JAVBUS_API_BASE_URL}/api/magnets/{movie_id}"
                        magnet_params = {
                            'gid': movie_data['gid'],
                            'uc': movie_data['uc'],
                            'sortBy': 'size',
                            'sortOrder': 'desc'
                        }
                        magnet_data = await fetch_with_cache(magnet_url, magnet_params)
                        
                        # 选择最佳磁力链接（优先无字幕的最大文件）
                        best_magnet = select_best_magnet_with_subtitle_filter(magnet_data, 'false', request.exclude_4k)
                        if not best_magnet:
                            # 如果没有无字幕的，选择任意最大的
                            best_magnet = select_best_magnet_with_subtitle_filter(magnet_data, None, request.exclude_4k)
                        
                        if best_magnet:
                            # 检查磁力链接字段是否存在
                            magnet_link = best_magnet.get("magnet_link") or best_magnet.get("magnetLink") or best_magnet.get("link")
                            if magnet_link:
                                magnet_results.append({
                                    "movie_id": movie_id,
                                    "magnet_link": magnet_link,
                                    "title": best_magnet.get("title", ""),
                                    "size": best_magnet.get("size", "")
                                })
                                logging.info(f"为影片 {movie_id} 找到磁力链接")
                            else:
                                logging.warning(f"影片 {movie_id} 的磁力数据中缺少链接字段")
                        else:
                            logging.warning(f"未找到影片 {movie_id} 的磁力链接")
                            
                    except Exception as e:
                        logging.error(f"获取影片 {movie['id']} 磁力链接失败: {str(e)}")
                
                # 如果有磁力链接，进行下载
                if magnet_results:
                    magnet_links = [result["magnet_link"] for result in magnet_results]
                    download_movie_ids = [result["movie_id"] for result in magnet_results]
                    
                    # 调用下载功能
                    download_request = DownloadRequest(
                        magnet_links=magnet_links,
                        movie_ids=download_movie_ids,
                        username=request.username,
                        password=request.password
                    )
                    
                    download_result = await pikpak_download(download_request)
                    
                    return {
                        "success": True,
                        "total_codes": len(movie_codes),
                        "found_movies": found_movies,
                        "not_found_codes": not_found_codes,
                        "magnet_results": magnet_results,
                        "download_result": download_result
                    }
                else:
                    return {
                        "success": True,
                        "total_codes": len(movie_codes),
                        "found_movies": found_movies,
                        "not_found_codes": not_found_codes,
                        "message": "找到影片但未找到可下载的磁力链接"
                    }
            else:
                return {
                    "success": True,
                    "total_codes": len(movie_codes),
                    "found_movies": found_movies,
                    "not_found_codes": not_found_codes,
                    "message": "没有需要下载的新影片"
                }
        else:
            # 仅返回搜索结果
            return {
                "success": True,
                "total_codes": len(movie_codes),
                "found_movies": found_movies,
                "not_found_codes": not_found_codes
            }
    
    except Exception as e:
        logging.error(f"番号下载失败: {str(e)}")
        return {"error": f"处理失败: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)