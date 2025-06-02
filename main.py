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
from pikpakapi import PikPakApi

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)

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

# 下载记录管理函数
async def load_downloaded_movies():
    """加载已下载的影片记录"""
    try:
        if os.path.exists(DOWNLOADED_MOVIES_FILE):
            with open(DOWNLOADED_MOVIES_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []
    except Exception as e:
        logging.error(f"加载下载记录失败: {str(e)}")
        return []

async def save_downloaded_movies(movie_ids):
    """保存已下载的影片记录"""
    try:
        downloaded_movies = await load_downloaded_movies()
        current_time = datetime.datetime.now().isoformat()
        
        for movie_id in movie_ids:
            if movie_id not in [record['movie_id'] for record in downloaded_movies]:
                downloaded_movies.append({
                    'movie_id': movie_id,
                    'download_time': current_time
                })
        
        with open(DOWNLOADED_MOVIES_FILE, 'w', encoding='utf-8') as f:
            json.dump(downloaded_movies, f, ensure_ascii=False, indent=2)
        
        logging.info(f"保存下载记录: {movie_ids}")
    except Exception as e:
        logging.error(f"保存下载记录失败: {str(e)}")

async def is_movie_downloaded(movie_id):
    """检查影片是否已下载"""
    downloaded_movies = await load_downloaded_movies()
    return movie_id in [record['movie_id'] for record in downloaded_movies]

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
    api_url = "http://10.0.0.20:3000/api/movies"
    
    # 转发所有查询参数
    query_params = dict(request.query_params)
    
    try:
        # 发送请求到JavBus API
        async with httpx.AsyncClient() as client:
            response = await client.get(api_url, params=query_params)
            
            # 记录请求日志
            logging.info(f"[{datetime.datetime.now()}] 请求URL: {api_url}, 响应状态: {response.status_code}")
            
        # 返回API响应
        return response.json()
    except httpx.HTTPError as e:
        # 处理API请求错误
        return {"error": str(e), "message": "获取影片列表失败"}

@app.get("/api/movies/{movieId}")
async def get_movie(movieId: str, request: Request):
    """
    获取特定影片信息
    :param movieId: 影片ID
    :param request: 请求对象
    :return: 影片信息
    """
    # 构建目标API URL
    api_url = f"http://10.0.0.20:3000/api/movies/{movieId}"
    
    try:
        # 发送请求到JavBus API
        async with httpx.AsyncClient() as client:
            response = await client.get(api_url)
            
            # 记录请求日志
            logging.info(f"[{datetime.datetime.now()}] 请求URL: {api_url}, 响应状态: {response.status_code}")
            
        # 返回API响应
        return response.json()
    except httpx.HTTPError as e:
        # 处理API请求错误
        return {"error": str(e), "message": "请求影片信息失败"}

@app.get("/api/magnets/{movieId}")
async def get_magnets(movieId: str, request: Request):
    """
    获取特定影片的磁力链接
    :param movieId: 影片ID
    :param request: 请求对象
    :return: 磁力链接数据
    """
    # 构建目标API URL
    api_url = f"http://10.0.0.20:3000/api/magnets/{movieId}"
    
    # 转发查询参数
    query_params = dict(request.query_params)
    
    try:
        # 发送请求到JavBus API
        async with httpx.AsyncClient() as client:
            response = await client.get(api_url, params=query_params)
            
            # 记录请求日志
            logging.info(f"[{datetime.datetime.now()}] 请求URL: {api_url}, 响应状态: {response.status_code}")
            
        # 返回API响应
        return response.json()
    except httpx.HTTPError as e:
        # 处理API请求错误
        return {"error": str(e), "message": "请求磁力链接失败"}

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
    api_url = f"http://10.0.0.20:3000/api/{path}"
    
    # 转发查询参数
    query_params = dict(request.query_params)
    
    try:
        # 发送请求到JavBus API
        async with httpx.AsyncClient() as client:
            response = await client.get(api_url, params=query_params)
            
            # 记录请求日志
            logging.info(f"[{datetime.datetime.now()}] 请求URL: {api_url}, 响应状态: {response.status_code}")
            
        # 返回API响应
        return response.json()
    except httpx.HTTPError as e:
        # 处理API请求错误
        return {"error": str(e), "message": "请求JavBus API失败"}

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