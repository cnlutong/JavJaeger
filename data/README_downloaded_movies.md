# 下载记录文件说明

## 文件位置
- **Docker环境**: `/app/data/downloaded_movies.json`
- **本地环境**: `data/downloaded_movies.json`

## 自动创建
程序启动时会自动检查并创建下载记录文件：
- 如果文件不存在，会自动创建一个空的JSON文件
- 如果文件存在，会加载现有的下载记录

## 文件格式
下载记录文件使用JSON格式，包含影片番号和下载时间：

```json
[
  {
    "movie_id": "SSIS-001",
    "download_time": "2025-01-15T10:30:00"
  },
  {
    "movie_id": "PRED-123", 
    "download_time": "2025-01-16T14:20:00"
  }
]
```

## 手动导入历史记录

### 方法1: 直接编辑文件
1. 停止应用：`docker-compose down`
2. 编辑文件：`data/downloaded_movies.json`
3. 按照上述格式添加你的历史记录
4. 重启应用：`docker-compose up`

### 方法2: 容器运行时编辑
```bash
# 进入容器
docker exec -it javjaeger-javjaeger-1 /bin/sh

# 编辑文件
vi /app/data/downloaded_movies.json

# 退出容器
exit

# 重启容器以重新加载
docker-compose restart
```