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
from typing import List, Dict, Optional
from pikpakapi import PikPakApi

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)

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

# 挂载静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")

# 模板配置
templates = Jinja2Templates(directory="templates")

# 下载记录文件路径
DOWNLOADED_MOVIES_FILE = "static/downloaded_movies.json"

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
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params)
            logging.info(f"API请求: {url}, 状态: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                set_cache(cache_key, data)
                return data
            else:
                return None
    except Exception as e:
        logging.error(f"API请求失败: {url}, 错误: {str(e)}")
        return None

# 下载记录管理（使用内存存储以保持轻量化）
downloaded_movies_cache = set()
downloaded_movies_loaded = False

async def load_downloaded_movies():
    """加载已下载的影片记录"""
    global downloaded_movies_cache, downloaded_movies_loaded
    
    if downloaded_movies_loaded:
        return list(downloaded_movies_cache)
    
    try:
        if os.path.exists(DOWNLOADED_MOVIES_FILE):
            with open(DOWNLOADED_MOVIES_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                downloaded_movies_cache = set(record['movie_id'] for record in data)
        downloaded_movies_loaded = True
        return list(downloaded_movies_cache)
    except Exception as e:
        logging.error(f"加载下载记录失败: {str(e)}")
        return []

async def save_downloaded_movies(movie_ids: List[str]):
    """保存已下载的影片记录"""
    global downloaded_movies_cache
    
    try:
        # 更新内存缓存
        downloaded_movies_cache.update(movie_ids)
        
        # 保存到文件
        current_time = datetime.datetime.now().isoformat()
        downloaded_movies = [
            {'movie_id': movie_id, 'download_time': current_time}
            for movie_id in downloaded_movies_cache
        ]
        
        with open(DOWNLOADED_MOVIES_FILE, 'w', encoding='utf-8') as f:
            json.dump(downloaded_movies, f, ensure_ascii=False, indent=2)
        
        logging.info(f"保存下载记录: {movie_ids}")
    except Exception as e:
        logging.error(f"保存下载记录失败: {str(e)}")

async def is_movie_downloaded(movie_id: str) -> bool:
    """检查影片是否已下载"""
    global downloaded_movies_cache, downloaded_movies_loaded
    
    if not downloaded_movies_loaded:
        await load_downloaded_movies()
    
    return movie_id in downloaded_movies_cache

# 主页路由
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """
    主页路由
    :param request: 请求对象
    :return: 渲染后的主页模板
    """
    return templates.TemplateResponse("index.html", {"request": request})

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
    
    # 转发除演员人数筛选外的所有查询参数
    query_params = dict(request.query_params)
    if 'actorCountFilter' in query_params:
        del query_params['actorCountFilter']
    
    # 使用缓存获取数据
    data = await fetch_with_cache(api_url, query_params)
    if data is None:
        return {"error": "获取影片列表失败", "message": "API请求失败"}
    
    # 如果有演员人数筛选条件，需要获取每个影片的详细信息进行筛选
    if actor_count_filter and data.get('movies'):
        filtered_movies = []
        
        # 并发获取影片详情以检查演员数量
        async def check_actor_count(movie):
            try:
                movie_url = f"{JAVBUS_API_BASE_URL}/api/movies/{movie['id']}"
                movie_detail = await fetch_with_cache(movie_url)
                
                if not movie_detail or 'stars' not in movie_detail:
                    return None
                
                actor_count = len(movie_detail['stars'])
                
                # 根据筛选条件判断是否符合要求
                if actor_count_filter == '1' and actor_count == 1:
                    return movie
                elif actor_count_filter == '2' and actor_count == 2:
                    return movie
                elif actor_count_filter == '3' and actor_count == 3:
                    return movie
                elif actor_count_filter == '<=2' and actor_count <= 2:
                    return movie
                elif actor_count_filter == '<=3' and actor_count <= 3:
                    return movie
                elif actor_count_filter == '>=3' and actor_count >= 3:
                    return movie
                elif actor_count_filter == '>=4' and actor_count >= 4:
                    return movie
                
                return None
                
            except Exception as e:
                logging.error(f"检查影片 {movie['id']} 演员数量失败: {str(e)}")
                return None
        
        # 限制并发数量以避免过多请求
        semaphore = asyncio.Semaphore(3)
        
        async def limited_check(movie):
            async with semaphore:
                return await check_actor_count(movie)
        
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

@app.get("/api/magnets/{movieId}")
async def get_magnets(movieId: str, request: Request):
    """
    获取特定影片的磁力链接
    :param movieId: 影片ID
    :param request: 请求对象
    :return: 磁力链接数据
    """
    # 构建目标API URL
    api_url = f"{JAVBUS_API_BASE_URL}/api/magnets/{movieId}"
    
    # 转发查询参数
    query_params = dict(request.query_params)
    
    # 使用缓存获取数据
    data = await fetch_with_cache(api_url, query_params)
    if data is None:
        return {"error": "获取磁力链接失败", "message": "API请求失败"}
    
    return data

@app.post("/api/movies/batch")
async def get_movies_batch(movie_ids: List[str]):
    """
    批量获取影片信息和最佳磁力链接
    :param movie_ids: 影片ID列表
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
            
            # 获取最佳磁力链接
            best_magnet = None
            if magnet_data and len(magnet_data) > 0:
                best_magnet = magnet_data[0]
            
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
    semaphore = asyncio.Semaphore(3)  # 增加并发数量到3，进一步加速查询
    
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
async def get_movies_batch_stream(movie_ids: List[str]):
    """
    流式批量获取影片信息和最佳磁力链接，逐个返回结果
    :param movie_ids: 影片ID列表
    :return: 流式影片信息
    """
    from fastapi.responses import StreamingResponse
    import json
    
    async def generate_results():
        # 并发获取影片信息的函数
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
                
                # 获取最佳磁力链接
                best_magnet = None
                if magnet_data and len(magnet_data) > 0:
                    best_magnet = magnet_data[0]
                
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