from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import List, Dict, Any
import json
import os
import logging
from webdav_client import WebDavClient, Aria2Client, WebDavFile

# 配置日志
logger = logging.getLogger(__name__)

# 视频文件扩展名列表
VIDEO_EXTENSIONS = {
    '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v',
    '.3gp', '.3g2', '.asf', '.rm', '.rmvb', '.vob', '.ts', '.mts',
    '.m2ts', '.divx', '.xvid', '.ogv', '.f4v', '.mpg', '.mpeg',
    '.m1v', '.m2v', '.mpe', '.mpv', '.mp2', '.mpa', '.mpu', '.mpg2'
}

def is_video_file(filename: str) -> bool:
    """检查文件是否为视频文件"""
    if not filename:
        return False
    
    # 获取文件扩展名并转换为小写
    extension = os.path.splitext(filename.lower())[1]
    return extension in VIDEO_EXTENSIONS

app = FastAPI(title="WebDAV网盘监控工具", description="监控WebDAV网盘并支持批量下载到Aria2")

# 创建静态文件和模板目录
os.makedirs("static", exist_ok=True)
os.makedirs("templates", exist_ok=True)

# 挂载静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")

# 模板配置
templates = Jinja2Templates(directory="templates")

# 全局客户端实例
webdav_client = None
aria2_client = None

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """主页"""
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/api/connect/webdav")
async def connect_webdav(
    webdav_url: str = Form(...),
    username: str = Form(""),
    password: str = Form("")
):
    """连接WebDAV服务器"""
    global webdav_client
    
    try:
        # 初始化WebDAV客户端
        webdav_client = WebDavClient(webdav_url, username, password)
        
        # 测试WebDAV连接
        webdav_client.list_directory("/")
        
        return JSONResponse({
            "success": True,
            "message": "WebDAV连接成功"
        })
        
    except Exception as e:
        logger.error(f"WebDAV连接失败: {e}")
        return JSONResponse({
            "success": False,
            "message": f"WebDAV连接失败: {str(e)}"
        })

@app.post("/api/connect/aria2")
async def connect_aria2(
    aria2_url: str = Form(...),
    aria2_secret: str = Form("")
):
    """连接Aria2服务器"""
    global aria2_client
    
    try:
        # 初始化Aria2客户端
        aria2_client = Aria2Client(aria2_url, aria2_secret)
        
        # 测试Aria2连接
        aria2_connected = aria2_client.test_connection()
        
        if aria2_connected:
            return JSONResponse({
                "success": True,
                "message": "Aria2连接成功"
            })
        else:
            return JSONResponse({
                "success": False,
                "message": "Aria2连接失败"
            })
        
    except Exception as e:
        logger.error(f"Aria2连接失败: {e}")
        return JSONResponse({
            "success": False,
            "message": f"Aria2连接失败: {str(e)}"
        })

@app.get("/api/status")
async def get_connection_status():
    """获取连接状态"""
    webdav_status = webdav_client is not None
    aria2_status = aria2_client is not None and aria2_client.test_connection()
    
    return JSONResponse({
        "webdav_connected": webdav_status,
        "aria2_connected": aria2_status
    })

@app.get("/api/files")
async def list_files(path: str = "/"):
    """获取文件列表"""
    if not webdav_client:
        raise HTTPException(status_code=400, detail="请先连接WebDAV服务器")
    
    try:
        files = webdav_client.list_directory(path)
        
        # 转换为JSON格式
        file_list = []
        for file in files:
            file_list.append({
                "name": file.name,
                "path": file.path,
                "is_directory": file.is_directory,
                "size": file.size,
                "download_url": file.download_url
            })
        
        return {
            "success": True,
            "files": file_list,
            "current_path": path
        }
        
    except Exception as e:
        return {
            "success": False,
            "message": f"获取文件列表失败: {str(e)}"
        }

@app.post("/api/download")
async def add_downloads(request: Dict[str, Any]):
    """批量添加下载任务到Aria2"""
    if not webdav_client:
        raise HTTPException(status_code=400, detail="WebDAV未连接")
    
    if not aria2_client:
        raise HTTPException(status_code=400, detail="Aria2未连接")
    
    files = request.get("files", [])
    video_filter = request.get("video_filter", False)
    min_file_size_mb = request.get("min_file_size_mb", 300)  # 默认300MB
    
    results = []
    
    for file_info in files:
        try:
            file_path = file_info.get("path")
            filename = file_info.get("name")
            is_directory = file_info.get("is_directory", False)
            file_size = file_info.get("size", 0)
            
            if not file_path:
                results.append({
                    "filename": filename,
                    "success": False,
                    "message": "文件路径为空"
                })
                continue
            
            # 如果是文件夹，递归获取所有文件并下载
            if is_directory:
                try:
                    folder_results = download_folder_recursive(file_path, filename, video_filter, min_file_size_mb)
                    results.extend(folder_results)
                except Exception as e:
                    results.append({
                        "filename": filename,
                        "success": False,
                        "message": f"文件夹下载失败: {str(e)}"
                    })
            else:
                # 单个文件下载
                # 如果启用视频筛选，检查是否符合条件
                if video_filter:
                    if not is_video_file(filename) or file_size < min_file_size_mb * 1024 * 1024:
                        results.append({
                            "filename": filename,
                            "success": False,
                            "message": f"不符合视频文件筛选条件（非视频文件或小于{min_file_size_mb}MB）"
                        })
                        continue
                
                # 构建下载URL
                download_url = webdav_client._build_download_url(file_path)
                
                # 添加到Aria2（保留原始文件名，使用默认下载路径）
                gid = aria2_client.add_download(download_url, {"out": filename})
                
                if gid:
                    results.append({
                        "filename": filename,
                        "success": True,
                        "gid": gid,
                        "message": "添加成功"
                    })
                else:
                    results.append({
                        "filename": filename,
                        "success": False,
                        "message": "添加下载任务失败"
                    })
            
        except Exception as e:
            results.append({
                "filename": file_info.get("name", "未知文件"),
                "success": False,
                "message": f"添加失败: {str(e)}"
            })
    
    return {
        "success": True,
        "results": results
    }

def download_folder_recursive(folder_path: str, folder_name: str, video_filter: bool, min_file_size_mb: int) -> List[Dict[str, Any]]:
    """递归下载文件夹中的所有文件"""
    results = []
    
    try:
        print(f"开始处理文件夹: {folder_path}")
        
        # 获取文件夹中的所有文件
        all_files = get_folder_files_recursive(folder_path)
        print(f"找到 {len(all_files)} 个文件")
        
        # 统计符合条件的文件数量
        eligible_files = []
        skipped_files = []
        
        for file in all_files:
            print(f"检查文件: {file.name}, 大小: {file.size}, 是否目录: {file.is_directory}")
            
            if file.is_directory:
                continue  # 跳过子文件夹
            
            # 如果启用视频筛选，检查文件是否符合条件
            if video_filter:
                if not is_video_file(file.name):
                    skipped_files.append(f"{file.name} (非视频文件)")
                    print(f"跳过非视频文件: {file.name}")
                    continue
                if file.size < min_file_size_mb * 1024 * 1024:
                    skipped_files.append(f"{file.name} (小于{min_file_size_mb}MB)")
                    print(f"跳过小文件: {file.name} ({file.size} bytes < {min_file_size_mb * 1024 * 1024} bytes)")
                    continue
            
            eligible_files.append(file)
            print(f"符合条件的文件: {file.name}")
        
        print(f"符合条件的文件数量: {len(eligible_files)}")
        print(f"跳过的文件数量: {len(skipped_files)}")
        
        # 如果启用了视频筛选但没有符合条件的文件
        if video_filter and len(eligible_files) == 0:
            message = f"文件夹中没有符合条件的视频文件（≥{min_file_size_mb}MB）。共检查了{len(all_files)}个文件。"
            if len(skipped_files) > 0:
                message += f" 跳过的文件: {', '.join(skipped_files[:5])}"
                if len(skipped_files) > 5:
                    message += f" 等{len(skipped_files)}个文件"
            
            results.append({
                "filename": folder_name,
                "success": False,
                "message": message
            })
            return results
        
        # 如果没有启用视频筛选但文件夹为空
        if not video_filter and len(eligible_files) == 0:
            results.append({
                "filename": folder_name,
                "success": False,
                "message": f"文件夹为空或无法访问文件。共检查了{len(all_files)}个文件。"
            })
            return results
        
        # 处理符合条件的文件
        for file in eligible_files:
            try:
                print(f"开始下载文件: {file.name}")
                
                # 构建下载URL
                download_url = webdav_client._build_download_url(file.path)
                print(f"下载URL: {download_url}")
                
                # 添加到Aria2（保留原始文件名，使用默认下载路径）
                options = {"out": file.name}
                print(f"Aria2选项: {options}")
                
                gid = aria2_client.add_download(download_url, options)
                
                if gid:
                    results.append({
                        "filename": file.name,
                        "success": True,
                        "gid": gid,
                        "message": "添加成功"
                    })
                    print(f"成功添加下载任务: {gid}")
                else:
                    results.append({
                        "filename": file.name,
                        "success": False,
                        "message": "添加下载任务失败"
                    })
                    print(f"添加下载任务失败: {file.name}")
                    
            except Exception as e:
                error_msg = f"添加失败: {str(e)}"
                results.append({
                    "filename": file.name,
                    "success": False,
                    "message": error_msg
                })
                print(f"处理文件时出错: {file.name}, 错误: {e}")
    
    except Exception as e:
        error_msg = f"获取文件夹内容失败: {str(e)}"
        results.append({
            "filename": folder_name,
            "success": False,
            "message": error_msg
        })
        print(f"处理文件夹时出错: {folder_path}, 错误: {e}")
    
    print(f"文件夹处理完成，结果数量: {len(results)}")
    return results

def get_folder_files_recursive(folder_path: str) -> List[WebDavFile]:
    """递归获取文件夹中的所有文件"""
    all_files = []
    
    try:
        print(f"正在扫描文件夹: {folder_path}")
        files = webdav_client.list_directory(folder_path)
        print(f"在 {folder_path} 中找到 {len(files)} 个项目")
        
        for file in files:
            print(f"处理项目: {file.name}, 路径: {file.path}, 是否目录: {file.is_directory}")
            
            if file.is_directory:
                print(f"进入子文件夹: {file.path}")
                # 递归获取子文件夹内容
                sub_files = get_folder_files_recursive(file.path)
                all_files.extend(sub_files)
                print(f"从子文件夹 {file.path} 获得 {len(sub_files)} 个文件")
            else:
                all_files.append(file)
                print(f"添加文件: {file.name}, 大小: {file.size}")
                
    except Exception as e:
        print(f"递归获取文件夹内容失败: {folder_path}, 错误: {e}")
        logger.error(f"递归获取文件夹内容失败: {e}")
    
    print(f"文件夹 {folder_path} 扫描完成，总共找到 {len(all_files)} 个文件")
    return all_files

@app.get("/api/aria2/status")
async def aria2_status():
    """获取Aria2状态"""
    if not aria2_client:
        return {"connected": False}
    
    try:
        version_info = aria2_client.get_version()
        return {
            "connected": True,
            "version": version_info
        }
    except:
        return {"connected": False}

@app.get("/api/aria2/downloads")
async def get_aria2_downloads():
    """获取Aria2下载列表"""
    if not aria2_client:
        raise HTTPException(status_code=400, detail="Aria2未连接")
    
    try:
        downloads = aria2_client.get_downloads()
        return {
            "success": True,
            "downloads": downloads
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"获取下载列表失败: {str(e)}"
        }

@app.post("/api/aria2/pause/{gid}")
async def pause_download(gid: str):
    """暂停下载"""
    if not aria2_client:
        raise HTTPException(status_code=400, detail="Aria2未连接")
    
    try:
        success = aria2_client.pause_download(gid)
        return {
            "success": success,
            "message": "暂停成功" if success else "暂停失败"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"暂停失败: {str(e)}"
        }

@app.post("/api/aria2/resume/{gid}")
async def resume_download(gid: str):
    """恢复下载"""
    if not aria2_client:
        raise HTTPException(status_code=400, detail="Aria2未连接")
    
    try:
        success = aria2_client.resume_download(gid)
        return {
            "success": success,
            "message": "恢复成功" if success else "恢复失败"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"恢复失败: {str(e)}"
        }

@app.delete("/api/aria2/remove/{gid}")
async def remove_download(gid: str):
    """删除下载任务"""
    if not aria2_client:
        raise HTTPException(status_code=400, detail="Aria2未连接")
    
    try:
        success = aria2_client.remove_download(gid)
        return {
            "success": success,
            "message": "删除成功" if success else "删除失败"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"删除失败: {str(e)}"
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)