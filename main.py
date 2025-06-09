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
import base64
import aria2p

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
    username: str
    password: str
    movie_ids: list[str] = []

class Aria2Config(BaseModel):
    host: str
    port: int
    secret: str = ""

class Aria2DownloadRequest(BaseModel):
    magnet_links: list[str]
    pikpak_username: str
    pikpak_password: str
    movie_ids: list[str] = []
    aria2_config: Aria2Config

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
            # 检查文件是否为空
            if os.path.getsize(DOWNLOADED_MOVIES_FILE) == 0:
                logging.warning("下载记录文件为空，初始化为空列表")
                return []
            
            with open(DOWNLOADED_MOVIES_FILE, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if not content:
                    logging.warning("下载记录文件内容为空，初始化为空列表")
                    return []
                return json.loads(content)
        return []
    except json.JSONDecodeError as e:
        logging.error(f"下载记录文件JSON格式错误: {str(e)}，重新初始化")
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

async def is_movie_downloaded(movie_id: str) -> bool:
    """检查影片是否已下载"""
    downloaded_movies = await load_downloaded_movies()
    return movie_id in [record['movie_id'] for record in downloaded_movies]

async def get_pikpak_download_links(client: PikPakApi, task_ids: list[str]) -> list[dict]:
    """从PikPak获取下载链接"""
    download_links = []
    try:
        # 获取所有离线任务列表
        offline_tasks_result = await client.offline_list()
        
        # 处理API返回结果
        if isinstance(offline_tasks_result, dict):
            all_tasks = offline_tasks_result.get('tasks', [])
        else:
            all_tasks = offline_tasks_result or []

        if not all_tasks:
            logging.warning("PikPak离线任务列表为空或获取失败")
            return []

        # 创建任务ID到任务信息的映射
        tasks_map = {task.get('id'): task for task in all_tasks if task.get('id')}
        logging.info(f"找到 {len(tasks_map)} 个离线任务")

        for task_id in task_ids:
            task_info = tasks_map.get(task_id)
            if not task_info:
                logging.warning(f"在离线列表中未找到任务ID: {task_id}")
                continue
            
            # 检查任务状态
            task_phase = task_info.get('phase', '')
            logging.info(f"任务 {task_id} 状态: {task_phase}")
            
            # 检查是否为完成状态
            if task_phase == 'PHASE_TYPE_COMPLETE':
                # 获取任务关联的文件ID
                file_id = task_info.get('file_id')
                if not file_id:
                    # 尝试从其他字段获取文件ID
                    if 'params' in task_info and 'file_id' in task_info['params']:
                        file_id = task_info['params']['file_id']
                    elif 'reference_resource' in task_info:
                        file_id = task_info['reference_resource'].get('id')
                
                if file_id:
                    try:
                        # 使用pikpakapi库获取下载URL
                        download_url = await client.get_download_url(file_id)
                        if download_url:
                            file_name = task_info.get('name', f'file_{file_id}')
                            file_size = task_info.get('file_size', 0)
                            
                            download_links.append({
                                'task_id': task_id,
                                'file_id': file_id,
                                'filename': file_name,
                                'download_url': download_url,
                                'size': file_size
                            })
                            logging.info(f"成功获取文件 {file_name} 的下载链接")
                        else:
                            logging.warning(f"无法获取文件 {file_id} 的下载链接")
                    except Exception as e:
                        logging.error(f"获取文件 {file_id} 下载链接时出错: {e}")
                else:
                    logging.warning(f"任务 {task_id} 已完成但未找到关联的文件ID")
            else:
                logging.info(f"任务 {task_id} 状态为 {task_phase}，跳过")

    except Exception as e:
        logging.error(f"获取PikPak下载链接过程中发生错误: {str(e)}")
    
    return download_links

async def add_aria2_download(aria2_config: Aria2Config, download_url: str, filename: str) -> dict:
    """使用aria2p库添加Aria2下载任务"""
    try:
        # 构建Aria2连接
        if aria2_config.secret:
            aria2 = aria2p.API(
                aria2p.Client(
                    host=f"http://{aria2_config.host}",
                    port=aria2_config.port,
                    secret=aria2_config.secret
                )
            )
        else:
            aria2 = aria2p.API(
                aria2p.Client(
                    host=f"http://{aria2_config.host}",
                    port=aria2_config.port
                )
            )
        
        # 设置下载选项
        options = {
            "out": filename,
            "dir": "/downloads"  # 默认下载目录
        }
        
        # 添加下载任务
        download = aria2.add_uris([download_url], options=options)
        
        if download:
            return {
                "success": True,
                "gid": download.gid,
                "filename": filename
            }
        else:
            return {
                "success": False,
                "error": "添加下载任务失败"
            }
                
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

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
    api_url = "http://10.0.0.10:3000/api/movies"
    
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
    api_url = f"http://10.0.0.10:3000/api/movies/{movieId}"
    
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
    api_url = f"http://10.0.0.10:3000/api/magnets/{movieId}"
    
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
            "movie_id": movie_id,
            "is_downloaded": is_downloaded
        }
    except Exception as e:
        logging.error(f"检查下载状态失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"检查下载状态失败: {str(e)}")

@app.post("/api/aria2/test")
async def test_aria2_connection(config: Aria2Config):
    """
    使用aria2p库测试Aria2连接
    :param config: Aria2配置
    :return: 连接测试结果
    """
    try:
        # 构建Aria2连接
        if config.secret:
            aria2 = aria2p.API(
                aria2p.Client(
                    host=f"http://{config.host}",
                    port=config.port,
                    secret=config.secret
                )
            )
        else:
            aria2 = aria2p.API(
                aria2p.Client(
                    host=f"http://{config.host}",
                    port=config.port
                )
            )
        
        # 测试连接 - 获取版本信息
        version_info = aria2.client.get_version()
        
        return {
            "success": True,
            "message": "连接成功",
            "version": version_info.get("version", "未知版本")
        }
                
    except Exception as e:
        return {
            "success": False,
            "message": f"连接失败: {str(e)}"
        }

@app.post("/api/aria2/download")
async def aria2_download(request: Aria2DownloadRequest):
    """
    通过PikPak获取下载链接并添加到Aria2
    :param request: Aria2下载请求
    :return: 下载结果
    """
    try:
        # 1. 先通过PikPak添加离线下载任务
        pikpak_client = PikPakApi(
            username=request.pikpak_username,
            password=request.pikpak_password
        )
        await pikpak_client.login()
        
        # 添加PikPak离线下载任务
        pikpak_results = []
        task_ids = []
        successful_movie_ids = []
        
        for i, magnet_link in enumerate(request.magnet_links):
            try:
                result = await pikpak_client.offline_download(magnet_link)
                task_id = result.get("task", {}).get("id") if result else None
                if task_id:
                    task_ids.append(task_id)
                    pikpak_results.append({
                        "magnet": magnet_link,
                        "success": True,
                        "task_id": task_id
                    })
                    # 记录成功的影片ID
                    if i < len(request.movie_ids):
                        successful_movie_ids.append(request.movie_ids[i])
                else:
                    pikpak_results.append({
                        "magnet": magnet_link,
                        "success": False,
                        "error": "未获取到任务ID"
                    })
                logging.info(f"PikPak任务添加成功: {magnet_link[:50]}...")
            except Exception as e:
                pikpak_results.append({
                    "magnet": magnet_link,
                    "success": False,
                    "error": str(e)
                })
                logging.error(f"PikPak任务添加失败: {magnet_link[:50]}... - {str(e)}")
        
        # 2. 等待PikPak任务完成并获取下载链接
        aria2_results = []
        if task_ids:
            # 等待一段时间让PikPak处理
            await asyncio.sleep(5)
            
            # 获取下载链接
            download_links = await get_pikpak_download_links(pikpak_client, task_ids)
            
            # 3. 添加到Aria2
            for link_info in download_links:
                try:
                    aria2_result = await add_aria2_download(
                        request.aria2_config,
                        link_info['download_url'],
                        link_info['filename']
                    )
                    aria2_results.append({
                        "filename": link_info['filename'],
                        "success": aria2_result['success'],
                        "gid": aria2_result.get('gid'),
                        "error": aria2_result.get('error')
                    })
                    if aria2_result['success']:
                        logging.info(f"Aria2任务添加成功: {link_info['filename']}")
                    else:
                        logging.error(f"Aria2任务添加失败: {link_info['filename']} - {aria2_result.get('error')}")
                except Exception as e:
                    aria2_results.append({
                        "filename": link_info['filename'],
                        "success": False,
                        "error": str(e)
                    })
                    logging.error(f"Aria2任务添加异常: {link_info['filename']} - {str(e)}")
        
        # 保存下载记录
        if successful_movie_ids:
            await save_downloaded_movies(successful_movie_ids)
        
        pikpak_success = sum(1 for r in pikpak_results if r["success"])
        aria2_success = sum(1 for r in aria2_results if r["success"])
        
        return {
            "success": pikpak_success > 0,
            "message": f"PikPak: {pikpak_success}/{len(request.magnet_links)} 个任务成功，Aria2: {aria2_success}/{len(aria2_results)} 个文件成功",
            "pikpak_results": pikpak_results,
            "aria2_results": aria2_results
        }
        
    except Exception as e:
        logging.error(f"Aria2下载失败: {str(e)}")
        raise HTTPException(status_code=400, detail=f"下载失败: {str(e)}")