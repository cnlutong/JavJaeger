# JavJaeger

JavJaeger 是一个面向本地自用和私有部署的 JAV 自动化工具。它把影片发现、元数据检索、磁力选择、PikPak 离线下载、WebDAV 浏览、Aria2 派发、本地影片库和自动化任务串在一个 FastAPI + React 应用里。

项目当前的工程约束是 Harness Engineering 和严格 TDD：有行为变化就先补可执行测试或等价验证，再改实现。仓库边界、模块归属和安全规则以 [AGENTS.md](AGENTS.md) 为准。

## 能做什么

- 通过内置 JavBus API-compatible provider 检索影片列表、详情、演员、类别和磁力信息。
- 按关键词、番号、演员、类别、制作商、发行商、系列等条件筛选影片。
- 在 JavBus 和 Cilisiusou 磁力来源之间切换，并支持字幕、4K 排除和批量选择。
- 将磁力任务派发到 PikPak 或 Aria2。
- 浏览 WebDAV 目录，把文件或目录批量发送给 Aria2。
- 扫描本地媒体目录，维护本地影片库和下载历史，用于避免重复下载。
- 通过自动模式保存发现、筛选、磁力选择和下载派发流程，并按计划执行。
- 在设置页热更新 JavBus 访问参数。

## 技术栈

| 部分 | 技术 |
| --- | --- |
| 后端 | Python 3.11+、FastAPI、Uvicorn |
| 前端 | React 18、Ant Design、esbuild |
| 数据 | `data/` 下的本地 JSON 状态文件 |
| 下载 | PikPak API、WebDAV、Aria2 JSON-RPC |
| 部署 | Docker、docker compose、可选 Nginx 反向代理 |

## 快速开始

### Docker 运行

Docker 是最省事的运行方式。容器内应用监听 `5000`，仓库里的 `docker-compose.yml` 默认把宿主机 `8000` 映射到容器 `5000`。

```bash
docker-compose up -d --build
docker-compose logs -f javjaeger
```

访问：

```text
http://localhost:8000
```

停止：

```bash
docker-compose down
```

常用维护命令：

```bash
docker-compose logs --tail=100 javjaeger
docker-compose restart
docker-compose build --no-cache
docker-compose up -d
```

更多 Docker 说明见 [DOCKER.md](DOCKER.md)。

### 源码运行

```bash
pip install -r requirements.txt
npm install
npm run build:frontend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

访问：

```text
http://localhost:8000
```

也可以直接运行：

```bash
python main.py
```

这种方式会监听 `5000`。

## 配置

复制示例配置：

```bash
cp config.example.json config.json
```

Windows PowerShell：

```powershell
Copy-Item config.example.json config.json
```

示例结构：

```json
{
  "session_secret": "replace-this-in-production",
  "javbus": {
    "base_url": "https://www.javbus.com",
    "timeout_seconds": 8,
    "proxy": "",
    "request_interval_seconds": 0.5,
    "cache_expire_seconds": 3600,
    "cache_max_size": 1000
  },
  "webdav": {
    "enabled": false,
    "url": "",
    "username": "",
    "password": "",
    "auto_connect": false
  },
  "aria2": {
    "enabled": false,
    "url": "http://127.0.0.1:6800/jsonrpc",
    "secret": "",
    "auto_connect": false
  },
  "pikpak": {
    "enabled": false,
    "username": "",
    "password": "",
    "auto_login": false
  }
}
```

配置要点：

- `session_secret` 用于 FastAPI session 签名，生产环境必须替换。
- `webdav.enabled`、`aria2.enabled`、`pikpak.enabled` 控制前端是否显示“使用配置连接/登录”能力。
- `webdav.auto_connect` 和 `aria2.auto_connect` 会在页面加载后尝试使用服务端配置连接。
- `pikpak.auto_login` 会在页面加载后尝试使用服务端配置登录。
- `/api/client-config` 只返回前端需要的脱敏默认值，不返回密码和 RPC secret。

### 环境变量

环境变量优先级高于 `config.json` 中对应的 JavBus 和 session 配置。

| 变量 | 作用 |
| --- | --- |
| `APP_SESSION_SECRET` | 覆盖 `config.session_secret` |
| `JAVJAEGER_CONFIG_PATH` | 指定配置文件路径，默认 `config.json` |
| `JAVBUS_BASE_URL` | 覆盖 JavBus 站点地址 |
| `JAVBUS_PROXY` | 给内置 JavBus provider 配置代理 |
| `JAVBUS_REQUEST_INTERVAL_SECONDS` | 覆盖 JavBus 请求间隔，`0` 表示关闭限流 |
| `APP_ENV` | `development`、`dev`、`test`、`testing` 会关闭前端缓存 |
| `JAVJAEGER_DISABLE_FRONTEND_CACHE` | 显式控制前端缓存 |
| `JAVJAEGER_ENABLE_FRONTEND_AUTO_RELOAD` | 显式控制前端资源自动刷新 |

Docker compose 示例：

```yaml
environment:
  - APP_SESSION_SECRET=change-this-session-secret
  # - JAVBUS_PROXY=http://127.0.0.1:7890
```

如需让容器读取本地 `config.json`：

```yaml
volumes:
  - ./data:/app/data
  - ./config.json:/app/config.json:ro
```

## 数据文件

运行状态默认保存在 `data/`。这些是运行数据，不是架构或设计输入。

| 文件 | 说明 |
| --- | --- |
| `data/downloaded_movies.json` | 下载历史 |
| `data/local_movie_library.json` | 本地影片库索引 |
| `data/automation_tasks.json` | 自动化任务和运行记录 |

Docker compose 默认挂载：

```yaml
volumes:
  - ./data:/app/data
```

## 使用说明

### 影片检索和下载

1. 在主页面输入番号或筛选条件。
2. 选择磁力来源、字幕过滤和 4K 排除策略。
3. 选择下载工具：PikPak 或 Aria2。
4. 对单片、本页结果或批量番号执行下载。

PikPak 需要手动登录，或在 `config.json` 中启用 `pikpak` 配置。Aria2 需要先连接 JSON-RPC，或在 `config.json` 中启用 `aria2` 配置。

### WebDAV 到 Aria2

1. 打开 WebDAV 下载中心。
2. 连接 WebDAV 和 Aria2。
3. 浏览目录，选择文件或目录。
4. 按需开启“仅视频”和最小文件大小过滤。
5. 批量发送到 Aria2。

WebDAV 和 Aria2 连接状态是 session-scoped；一个浏览器会话不会覆盖另一个会话的下载器状态。

### 本地影片库

本地影片库用于记录本机已有影片，配合下载历史避免重复派发。路径必须是服务端进程能访问的路径：

- Windows 直接运行：`D:\Media\JAV`
- Linux/macOS 直接运行：`/media/JAV`
- Docker 运行：填写容器内路径，例如把宿主机目录挂载到 `/media/JAV` 后，在页面中填写 `/media/JAV`

如果服务端运行在 Docker 或 Linux 中，不能直接填写宿主机 Windows 路径，除非该路径已经通过 volume、SMB、NFS 或 WSL 等方式挂载到服务端可见的位置。

### 自动模式

自动模式保存发现、磁力选择和下载派发流程。任务支持手动运行、定时运行和间隔运行。任务状态与运行记录保存在 `data/automation_tasks.json`。

自动派发前会复用下载历史和本地影片库，降低重复下载概率。

## API 速览

前端已经封装常用 API。下面是主要 HTTP 入口：

```text
GET    /                         # HTML shell
GET    /api/system/info           # 系统和版本信息
GET    /api/client-config         # 前端可见的脱敏配置
GET    /api/system/directories    # 服务端目录浏览
GET    /api/system/settings       # 系统设置摘要
PUT    /api/system/settings/javbus

GET    /api/movies
GET    /api/movies/all
GET    /api/movies/search
GET    /api/movies/{movie_id}
POST   /api/movies/batch
POST   /api/movies/batch-stream
POST   /api/movies/recognize
POST   /api/movies/download-by-codes

GET    /api/movies/local-library
POST   /api/movies/local-library/scan
DELETE /api/movies/local-library
GET    /api/movies/local-library/information/check
POST   /api/movies/local-library/information/download
GET    /api/movies/local-library/poster/{movie_id}
GET    /api/movies/local-library/{movie_id}
POST   /api/movies/local-scrape/preview
POST   /api/movies/local-scrape/delete
POST   /api/movies/local-scrape/apply

GET    /api/magnets/{movie_id}
GET    /api/stars/{star_id}

GET    /api/history
DELETE /api/history
GET    /api/downloaded-movies
GET    /api/downloaded-movies/{movie_id}

POST   /api/pikpak/login
POST   /api/pikpak/login-config
POST   /api/pikpak/download

POST   /api/webdav/connect
POST   /api/webdav/connect-config
GET    /api/webdav/status
GET    /api/webdav/files
POST   /api/webdav/download

POST   /api/aria2/connect
POST   /api/aria2/connect-config
GET    /api/aria2/status
GET    /api/aria2/downloads
POST   /api/aria2/download-magnets
POST   /api/aria2/pause/{gid}
POST   /api/aria2/resume/{gid}
DELETE /api/aria2/remove/{gid}

GET    /api/automation/tasks
POST   /api/automation/tasks
GET    /api/automation/tasks/{task_id}
PUT    /api/automation/tasks/{task_id}
DELETE /api/automation/tasks/{task_id}
POST   /api/automation/tasks/{task_id}/run
GET    /api/automation/tasks/{task_id}/runs
```

`/api/{path:path}` 是最后注册的代理 catch-all。新增具体 API 时必须放在代理路由之前。

## 开发约定

### 目录结构

```text
JavJaeger/
├── main.py                  # FastAPI app assembly only
├── modules/
│   ├── common/              # shared runtime, config, templates, version info
│   ├── javbus_api/          # in-process JavBus-compatible provider
│   ├── ui/                  # HTML shell route
│   ├── system/              # diagnostics and settings APIs
│   ├── history/             # download history and local library persistence
│   ├── movies/              # movie list, detail, batch, recognition workflows
│   ├── magnets/             # magnet lookup and selection policy
│   ├── pikpak/              # PikPak login and download dispatch
│   ├── webdav/              # WebDAV browsing, Aria2 dispatch, session state
│   ├── automation/          # saved workflow tasks and scheduler
│   └── proxy/               # final catch-all API route
├── frontend/src/            # editable frontend source
├── static/                  # static assets and generated frontend bundle
├── templates/index.html     # HTML shell only
├── tests/                   # executable harnesses
├── docs/                    # contributor-facing architecture notes
├── archive/                 # historical reference only
└── data/                    # runtime state
```

### 前端构建

只编辑 `frontend/src/**`。不要手改 `static/app.js`。

```bash
npm run build:frontend
```

`templates/index.html` 只负责加载 CDN、注入版本信息和引用 `/static/app.js`。

### 测试和验证

常用命令：

```bash
python -m pytest
npm run test:frontend
npm run build:frontend
npm run check
```

后端变更至少执行：

```bash
python -m py_compile main.py
python -c "import main; print(len(main.app.routes))"
python -m pytest
```

前端变更至少执行：

```bash
npm run build:frontend
npm run test:frontend
```

## 安全边界

- WebDAV 和 Aria2 连接状态必须保持 session-scoped。
- 不要生成包含 `username:password@host` 的下载 URL。
- 不要把新 secret 默认持久化到浏览器长期存储。
- 不要在日志、错误响应或 API payload 中回显密码、token、RPC secret。
- 生产环境必须设置强 `APP_SESSION_SECRET` 或 `config.session_secret`。
- `config.json` 可能包含真实凭据，不应提交到公共仓库。

## 常见问题

### 页面里为什么没有“使用配置连接/登录”按钮？

检查 `config.json` 中对应模块是否同时满足：

- `enabled: true`
- 必要字段已填写

例如 WebDAV 至少需要 `url`，Aria2 至少需要 `url`，PikPak 需要 `username` 和 `password`。

### Docker 里页面没有更新？

前端会在镜像构建阶段打包。修改 `frontend/src/` 后需要重新构建镜像：

```bash
docker-compose up -d --build
```

源码运行时则执行：

```bash
npm run build:frontend
```

### 访问 JavBus 失败怎么办？

如果运行环境不能直接访问 JavBus，配置代理：

```bash
JAVBUS_PROXY=http://127.0.0.1:7890
```

或在 `config.json` 的 `javbus.proxy` 中填写代理地址。

### 本地路径扫描不到文件？

确认填写的是服务端进程可访问的路径。Docker 中要填写容器内路径，不是宿主机路径。

### 反向代理出现 502？

容器内服务端口是 `5000`。如果使用仓库中的 `nginx.conf`，上游应指向：

```nginx
server javjaeger:5000;
```

不要把 Nginx 上游写成宿主机映射端口 `8000`。

## 许可证

本项目采用 [MIT License](LICENSE)。

## 免责声明

本项目仅供学习和研究使用。请遵守所在地法律法规以及相关服务条款，自行承担使用风险。
