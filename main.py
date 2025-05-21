from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import httpx
import logging
import datetime

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)

# 初始化FastAPI应用
app = FastAPI(title="JavJaeger", description="基于JavBus的高效影片系统")

# 挂载静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")

# 初始化模板引擎
templates = Jinja2Templates(directory="templates")

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