<div align="center">

# JavJaeger

<img src="static/logo.jpg" alt="JavJaeger Logo" width="150" height="150">

**一个聚合影片检索、PikPak 离线下载、WebDAV 浏览与 Aria2 下发的 Jav 工具箱**

*"人类的一切痛苦，都是因为性欲得不到满足"*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.95%2B-green.svg)](https://fastapi.tiangolo.com/)

</div>

---

## ✨ 项目简介

JavJaeger 是一个基于 FastAPI + React 前端的本地自用工具。它通过代理/聚合 JavBus API，提供演员、类别、字幕、多人出演等维度的高级筛选，并可集成 PikPak 实现一键云端离线下载；同时内建 WebDAV 下载分页，可浏览网盘目录并将下载任务直接发送到 Aria2。项目包含轻量级内存缓存、批量任务与流式返回能力，适合本地自用或私有化部署。

## 🔑 核心功能

<table>
<tr>
<td width="50%">

🔍 **批量下载**
> 按番号/搜索条件批量查询，合并去重并统一下发下载

🎯 **智能筛选** 
> 演员、类别、发行日期、多人出演等多维度组合

🧲 **磁力查询**
> 获取并按体积排序；可筛选是否带字幕

</td>
<td width="50%">

📥 **支持PikPak**
> 可手动登录，也可由服务端配置文件自动登录

⚡ **性能优化**
> 内存级缓存与并发限流，减少 API 压力

🎨 **现代界面**
> React 单页应用，支持影片检索页与 WebDAV 下载页切换

</td>
</tr>
</table>

## 🚀 快速开始

### 🐳 Docker 运行（推荐）

```bash
# 1️⃣ 配置 JavBus API 地址（必需）
# 编辑 docker-compose.yml，修改 JAVBUS_API_BASE_URL 环境变量：
# environment:
#   - JAVBUS_API_BASE_URL=http://your-api-host:port

# 2️⃣ 构建并启动容器
docker-compose up -d

# 3️⃣ 查看日志
docker-compose logs -f

# 4️⃣ 访问应用
# 🔗 http://localhost:8000

# 停止服务
docker-compose down
```

**常用 Docker 命令：**
```bash
# 查看实时日志
docker-compose logs -f javjaeger

# 查看最近 100 行日志
docker-compose logs --tail=100 javjaeger

# 进入容器调试
docker-compose exec javjaeger bash

# 重启服务
docker-compose restart

# 重新构建镜像
docker-compose build --no-cache
docker-compose up -d
```

**配置说明：**
- 端口配置：主机端口 8000 映射到容器端口 5000
- 数据持久化：`data/` 目录已挂载，下载记录会自动保存
- 环境变量：`JAVBUS_API_BASE_URL` 优先级高于 `config.json`

> 📖 更多详细信息请参考 [DOCKER.md](DOCKER.md) 文件

### 💻 源码直接运行（Windows/macOS/Linux）

```bash
# 1️⃣ 安装依赖
pip install -r requirements.txt
npm install

# 2️⃣ 构建前端
npm run build:frontend

# 3️⃣ 启动应用（开发模式端口默认为 8000）
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 4️⃣ 访问应用
# 🔗 http://localhost:8000

# 可选：直接运行 main.py（内置端口为 5000）
python main.py  # http://localhost:5000
```

## ⚙️ 配置与环境变量

### 📄 config.json

当前项目支持通过 `config.json` 提前写入运行所需信息。这样前端页面可以直接使用默认配置完成连接或登录，无需每次手动填写。

建议做法：

- 提交仓库时保留 [config.example.json](/D:/code/JavJaeger/config.example.json) 作为模板
- 本地复制为 `config.json` 后再填入真实配置

示例：

```json
{
  "session_secret": "replace-this-in-production",
  "javbus_api": {
    "base_url": "http://10.0.0.20:3000"
  },
  "webdav": {
    "enabled": true,
    "url": "https://dav.example.com/",
    "username": "your-webdav-user",
    "password": "your-webdav-password",
    "auto_connect": true
  },
  "aria2": {
    "enabled": true,
    "url": "http://127.0.0.1:6800/jsonrpc",
    "secret": "your-aria2-secret",
    "auto_connect": true
  },
  "pikpak": {
    "enabled": true,
    "username": "your-pikpak-user",
    "password": "your-pikpak-password",
    "auto_login": false
  }
}
```

配置说明：

- `session_secret`：FastAPI SessionMiddleware 使用的会话密钥；生产环境必须修改
- `webdav.enabled` / `aria2.enabled` / `pikpak.enabled`：显式启用后，前端才会显示“使用配置连接/登录”
- `webdav.auto_connect` / `aria2.auto_connect`：页面加载后自动尝试连接
- `pikpak.auto_login`：页面加载后自动尝试使用配置登录
- 敏感字段不会通过 `/api/client-config` 返回给浏览器，服务端只下发脱敏后的默认值

### 📡 JavBus API 配置

修改 `config.json` 中的 JavBus API 地址：

```json
{
  "javbus_api": {
    "base_url": "http://your-api-server:3000"
  }
}
```

或使用环境变量覆盖（优先级高于 config.json）：

```bash
JAVBUS_API_BASE_URL=http://10.0.0.20:3000
```

### 🔐 环境变量

- `JAVBUS_API_BASE_URL`：覆盖 `config.json` 中的 JavBus API 地址
- `APP_SESSION_SECRET`：覆盖 `config.json` 中的 `session_secret`

### 📁 数据与静态资源
- 下载记录持久化文件：`data/downloaded_movies.json`
- 前端静态资源目录：`static/`
- 模板目录：`templates/`

## 📖 使用指南

| 功能 | 描述 | 操作 |
|------|------|------|
| 🎬 **影片搜索** | 输入番号快速查找 | 在搜索框输入番号 |
| 🎯 **筛选功能** | 按演员、类别等条件筛选 | 选择筛选条件并输入值 |
| 🧲 **磁力查询** | 获取影片下载链接 | 输入番号/在影片详情内查询 |
| 🧾 **批量模式** | 支持粘贴番号列表逐个查询 | 支持流式返回、逐条展示 |
| 📥 **PikPak下载** | 登录后一键下载到云盘 | 手动登录或使用配置登录后批量下载 |
| 🌐 **WebDAV下载页** | 浏览 WebDAV 目录并发送到 Aria2 | 切换到 `WebDAV 下载中心` 分页 |

### 🔐 PikPak 登录与下载
1. 在前端页面手动登录 PikPak，或在 `config.json` 中配置 `pikpak` 并使用“使用配置登录”。
2. 选择目标影片或批量模式发起下载。
3. 成功下发后，系统将把番号写入 `data/downloaded_movies.json`，避免重复下载。

### 🌐 WebDAV 与 Aria2
1. 在 `config.json` 中配置 `webdav` 和 `aria2`，或在页面中手动填写。
2. 进入 `WebDAV 下载中心` 分页。
3. 使用“连接”或“使用配置连接”建立会话级连接。
4. 浏览目录、选择文件或文件夹，并将任务发送到 Aria2。

### 🚀 推荐配套工具

为了实现更高效的下载体验，当前仓库已经内建 `WebDAV -> Aria2` 下载分页；原 `W2A` 独立入口已归档到 `archive/W2A-legacy/`，不再作为主运行方式。核心能力仍然包括：

- 🌐 **WebDAV网盘支持** - 特别支持PikPak等WebDAV协议网盘
- ⬇️ **Aria2多线程下载** - 批量添加到Aria2进行高速多线程下载  
- 🎯 **完美配合** - JavJaeger负责搜索筛选与分页集成，WebDAV下载页负责高效下载
- 📁 **批量管理** - 支持文件夹批量选择和下载管理

## 🖼️ 界面预览

下面为部分界面截图（截图存放于 `demo photo/` 目录）：

<div align="center">

<img src="demo photo/演员刷选0.png" alt="演员筛选-网格" width="45%" />
<img src="demo photo/演员刷选1.png" alt="演员筛选-详情" width="45%" />

<img src="demo photo/演员刷选2.png" alt="演员筛选-多条件" width="45%" />
<img src="demo photo/类别筛选0.png" alt="类别筛选" width="45%" />

<img src="demo photo/排行榜获取影片0.png" alt="排行榜获取影片" width="90%" />

</div>

## 🧩 API 速览

后端提供了若干 HTTP API，前端已封装常用路径：

```text
GET  /                      # 前端主页
GET  /api/system/info       # 系统与版本信息
GET  /api/movies            # 影片列表（分页），支持多条件筛选（支持 actorCountFilter）
GET  /api/movies/all        # 聚合所有页结果（含限流与最大页数保护）
GET  /api/movies/{id}       # 单片详情
GET  /api/magnets/{id}      # 磁力列表（支持 hasSubtitle=true/false；source=javbus|cilisousuo）
POST /api/movies/batch      # 批量获取详情+最佳磁力（JSON 列表；支持 source/字幕/4K）
POST /api/movies/batch-stream    # 批量流式获取（标准 SSE: text/event-stream）
POST /api/movies/recognize       # 从 HTML 解析影片并可选自动下载
POST /api/movies/download-by-codes   # 传入番号字符串，自动查找并下发下载

POST /api/pikpak/login      # PikPak 登录
POST /api/pikpak/login-config   # 使用 config.json 中的 PikPak 配置登录
POST /api/pikpak/download   # PikPak 批量离线下载

GET  /api/client-config         # 返回前端可见的脱敏默认配置

GET  /api/downloaded-movies             # 已下载番号列表
GET  /api/downloaded-movies/{movie_id}  # 检查是否已下载

POST /api/webdav/connect           # 手动连接 WebDAV
POST /api/webdav/connect-config    # 使用 config.json 连接 WebDAV
GET  /api/webdav/status            # 当前会话连接状态
GET  /api/webdav/files             # 浏览 WebDAV 目录
POST /api/webdav/download          # 将 WebDAV 文件/目录发送到 Aria2

POST /api/aria2/connect            # 手动连接 Aria2
POST /api/aria2/connect-config     # 使用 config.json 连接 Aria2
GET  /api/aria2/status             # 当前会话 Aria2 状态
GET  /api/aria2/downloads          # 下载任务列表
```

参数说明要点：
- `actorCountFilter`：'1' | '2' | '3' | '<=2' | '<=3' | '>=3' | '>=4'
- `hasSubtitle`：'true' | 'false'
- `source`：'javbus'（默认）| 'cilisousuo'

## 🛠️ 技术栈

<div align="center">

| 类别 | 技术 |
|------|------|
| **后端** | FastAPI + Python |
| **前端** | React + esbuild |
| **部署** | Uvicorn / Docker / Nginx |
| **API** | JavBus API |
| **下载** | PikPak API + WebDAV + Aria2 |

</div>

## 🧱 目录结构（节选）

```text
JavJaeger/
├─ main.py                  # FastAPI 应用装配入口
├─ modules/                 # 后端业务模块（movies / magnets / pikpak / webdav / ...）
├─ frontend/src/            # 前端源码
├─ static/                  # 静态资源与前端构建产物
├─ templates/
│  └─ index.html            # 首页模板
├─ data/
│  └─ downloaded_movies.json# 已下载记录
├─ config.json              # 运行配置（JavBus / WebDAV / Aria2 / PikPak）
├─ package.json             # 前端构建脚本
└─ cilisousuo_cli.py        # 备用磁力源（cilisousuo）
```

## 🧪 开发与调试

- 开启热重载：`uvicorn main:app --reload`（默认 8000 端口）
- 修改前端源码后需要重新执行 `npm run build:frontend`
- `templates/index.html` 只作为壳文件，前端逻辑位于 `frontend/src/`
- 日志等级已设为 INFO，可在 `main.py` 中调整。

## 📦 生产部署建议

- 使用 `uvicorn` 运行应用，前置 Nginx 静态与反向代理（仓库含 `nginx.conf` 可参考自配）。
- 设置 `JAVBUS_API_BASE_URL` 为内网可达地址，减少跨网延迟。
- 确保 `data/` 目录可持久化保存下载记录。
- 生产环境务必设置 `APP_SESSION_SECRET` 或 `config.session_secret`。

## ❓ 常见问题

<details>
<summary><strong>Q: 端口被占用怎么办？</strong></summary>

A: 修改启动命令中的端口参数，例如：
```bash
uvicorn main:app --host 0.0.0.0 --port 8001
```
或修改 `main.py` 中的默认端口配置。
</details>

<details>
<summary><strong>Q: API 连接失败？</strong></summary>

A: 检查 `config.json` 中的地址是否正确，并确认对应模块已设置 `enabled: true`。JavBus、WebDAV、Aria2、PikPak 都依赖各自的上游服务可达。
</details>

<details>
<summary><strong>Q: 为什么页面里没有“使用配置连接/登录”按钮？</strong></summary>

A: 只有当 `config.json` 中对应模块设置了 `enabled: true` 且填写了必要字段时，前端才会显示相关按钮。
</details>

<details>
<summary><strong>Q: 如何查看日志？</strong></summary>

A: 日志会直接输出到控制台，如果使用 Nginx 等反向代理，可以查看 Nginx 的访问日志和错误日志。
</details>

<details>
<summary><strong>Q: 为什么我看不到字幕筛选结果？</strong></summary>

A: 字幕筛选在磁力级别实现（`/api/magnets/{id}`），影片列表级别不会体现；若磁力源不提供字幕字段，可能无法筛选（如 `cilisousuo`）。
</details>

<details>
<summary><strong>Q: 批量模式为什么看起来“卡住”？</strong></summary>

A: 批量接口默认串并结合并发（含限流与分页抓取），时间与条目数和上游响应有关。建议使用流式接口 `/api/movies/batch-stream` 获取实时进度。
</details>

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源协议

---

<div align="center">

⚠️ **免责声明**

本项目仅供学习研究使用，请遵守相关法律法规
**如果这个项目对你有帮助，请给个 ⭐ Star！**

</div>
