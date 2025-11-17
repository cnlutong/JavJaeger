<div align="center">

# JavJaeger

<img src="static/logo.jpg" alt="JavJaeger Logo" width="150" height="150">

**一个聚合多资源站、支持高级筛选和云端下载的 Jav 影片信息与磁力检索工具**

*"人类的一切痛苦，都是因为性欲得不到满足"*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.95%2B-green.svg)](https://fastapi.tiangolo.com/)

</div>

---

## ✨ 项目简介

JavJaeger 是一个基于 FastAPI + 前端静态页面的高效影片信息聚合与筛选工具。它通过代理/聚合 JavBus API，提供演员、类别、字幕、多人出演等维度的高级筛选，并可集成 PikPak 实现一键云端离线下载。内置轻量级内存缓存、批量任务与流式返回能力，适合本地自用或私有化部署。

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
> 登录后批量离线下载，自动记录已下片单

⚡ **性能优化**
> 内存级缓存与并发限流，减少 API 压力

🎨 **现代界面**
> 单页静态前端，交互流畅，移动端良好体验

</td>
</tr>
</table>

## 🚀 快速开始

### 💻 源码直接运行（Windows/macOS/Linux）

```bash
# 1️⃣ 安装依赖
pip install -r requirements.txt

# 2️⃣ 启动应用（开发模式端口默认为 8000）
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 3️⃣ 访问应用
# 🔗 http://localhost:8000

# 可选：直接运行 main.py（内置端口为 5000）
python main.py  # http://localhost:5000
```

## ⚙️ 配置与环境变量

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
| 📥 **PikPak下载** | 登录后一键下载到云盘 | 前端登录后批量下载 |

### 🔐 PikPak 登录与下载
1. 在前端页面登录 PikPak（仅保存在会话用于当次任务）。
2. 选择目标影片或批量模式发起下载。
3. 成功下发后，系统将把番号写入 `data/downloaded_movies.json`，避免重复下载。

### 🚀 推荐配套工具

为了实现更高效的下载体验，推荐配合使用 [**W2A (WebDAV To Aria2)**](https://github.com/cnlutong/W2A) 工具：

- 🌐 **WebDAV网盘支持** - 特别支持PikPak等WebDAV协议网盘
- ⬇️ **Aria2多线程下载** - 批量添加到Aria2进行高速多线程下载  
- 🎯 **完美配合** - JavJaeger负责搜索筛选，W2A负责高效下载
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
POST /api/movies/batch      # 批量获取详情+最佳磁力（JSON 列表）
POST /api/movies/batch-stream    # 批量流式获取（SSE 风格 text/plain）
POST /api/movies/recognize       # 从 HTML 解析影片并可选自动下载
POST /api/movies/download-by-codes   # 传入番号字符串，自动查找并下发下载

POST /api/pikpak/login      # PikPak 登录
POST /api/pikpak/download   # PikPak 批量离线下载

GET  /api/downloaded-movies             # 已下载番号列表
GET  /api/downloaded-movies/{movie_id}  # 检查是否已下载
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
| **前端** | HTML/CSS/JavaScript |
| **部署** | Nginx |
| **API** | JavBus API |
| **下载** | PikPak API |

</div>

## 🧱 目录结构（节选）

```text
JavJaeger/
├─ main.py                  # FastAPI 入口（含缓存、路由、PikPak集成）
├─ static/                  # 前端静态资源（app.js / app_optimized.js / 样式 / 头像）
├─ templates/
│  └─ index.html            # 首页模板
├─ data/
│  └─ downloaded_movies.json# 已下载记录
├─ config.json              # API 配置（可被环境变量覆盖）
└─ cilisousuo_cli.py        # 备用磁力源（cilisousuo）
```

## 🧪 开发与调试

- 开启热重载：`uvicorn main:app --reload`（默认 8000 端口）
- 本地修改静态文件与模板可即时生效（源码运行时）。
- 日志等级已设为 INFO，可在 `main.py` 中调整。

## 📦 生产部署建议

- 使用 `uvicorn` 以单进程运行，前置 Nginx 静态与反向代理（仓库含 `nginx.conf` 可参考自配）。
- 设置 `JAVBUS_API_BASE_URL` 为内网可达地址，减少跨网延迟。
- 确保 `data/` 目录可持久化保存下载记录。

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

A: 检查 `config.json` 中的 API 地址是否正确，确保 JavBus API 服务正常运行
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