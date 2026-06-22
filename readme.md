# JavJaeger

JavJaeger 是一个面向本地自用和私有部署的 JAV 自动化工具。它把影片发现、元数据检索、磁力选择、PikPak/115 离线下载、WebDAV 浏览、Aria2 派发、本地影片库和自动化任务串在一个 FastAPI + React 应用里。

项目当前的工程约束是 Harness Engineering 和严格 TDD：有行为变化就先补可执行测试或等价验证，再改实现。仓库边界、模块归属和安全规则以 [AGENTS.md](AGENTS.md) 为准。

## 能做什么

- 通过内置 JavBus API-compatible provider 检索影片列表、详情、演员、类别和磁力信息。
- 按关键词、番号、演员、类别、制作商、发行商、系列等条件筛选影片。
- 在 JavBus、Cilisiusou 和 YHG007 磁力来源之间切换，并支持字幕、4K 排除和批量选择。
- 将磁力任务派发到 PikPak、115 网盘或 Aria2。
- 在网盘管理中浏览 WebDAV、115 网盘目录和服务端本地文件夹，并把 WebDAV 文件或目录批量发送给 Aria2。
- 维护本地影片库和下载历史，用于浏览已有影片并避免重复下载。
- 通过自动模式保存发现、筛选、磁力选择和下载派发流程，并按计划执行。
- 在设置页热更新 JavBus 访问参数。

## 技术栈

| 部分 | 技术 |
| --- | --- |
| 后端 | Python 3.11+、FastAPI、Uvicorn |
| 前端 | React 18、Ant Design、esbuild |
| 数据 | `data/` 下的本地 JSON 状态文件 |
| 下载 | PikPak API、115 扫码/Cookie 离线下载、WebDAV、Aria2 JSON-RPC |
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

完整部署、验收和排障流程见 [DOCKER.md 部署 SOP](DOCKER.md#部署-sop)。

### 源码运行

本地刮削的“保留分辨率高的”和“保留码率高的”冲突策略依赖系统可执行的 `ffprobe`。源码运行时请先安装 FFmpeg，并确认 `ffprobe -version` 可用。

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
    "cache_max_size": 1000,
    "image_retry_attempts": 3,
    "image_retry_backoff_seconds": 0.25
  },
  "scrapers": {
    "priority": ["javbus", "r18dev", "dmm", "libredmm", "javlibrary", "javdb", "jav321", "mgstage", "tokyohot", "aventertainment", "dlgetchu", "caribbeancom", "fc2", "javstash"],
    "javbus": {
      "enabled": true,
      "language": "zh",
      "request_delay": 500,
      "base_url": "https://www.javbus.com"
    },
    "r18dev": { "enabled": false, "language": "en", "request_delay": 1500 },
    "dmm": { "enabled": false, "language": "ja", "request_delay": 1500 },
    "libredmm": { "enabled": true, "language": "ja", "request_delay": 1500 },
    "javlibrary": { "enabled": false, "language": "cn", "request_delay": 1500 },
    "javdb": { "enabled": false, "language": "zh", "request_delay": 1500 },
    "jav321": { "enabled": true, "language": "zh", "request_delay": 1500 },
    "mgstage": { "enabled": false, "language": "ja", "request_delay": 1500 },
    "tokyohot": { "enabled": true, "language": "zh", "request_delay": 1500 },
    "aventertainment": { "enabled": false, "language": "en", "request_delay": 1500 },
    "dlgetchu": { "enabled": true, "language": "ja", "request_delay": 1500 },
    "caribbeancom": { "enabled": false, "language": "ja", "request_delay": 1500 },
    "fc2": { "enabled": true, "language": "ja", "request_delay": 1500 },
    "javstash": {
      "enabled": false,
      "language": "en",
      "request_delay": 1500,
      "base_url": "https://javstash.org/graphql",
      "api_key": ""
    }
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
  },
  "pan115": {
    "enabled": false,
    "cookie": "",
    "save_dir_id": "0",
    "login_app": "wechatmini",
    "batch_size": 20,
    "batch_interval_seconds": 25.0,
    "jitter_seconds": 5.0,
    "failure_backoff_seconds": [120.0, 600.0]
  },
  "magnet_health": {
    "enabled": false,
    "probe_with_aria2": false,
    "min_seeders": 1,
    "min_peers": 1,
    "min_availability": 1.0,
    "min_score": 1.0,
    "probe_timeout_seconds": 20.0,
    "allow_unknown": true
  }
}
```

配置要点：

- `session_secret` 用于 FastAPI session 签名，生产环境必须替换。
- `webdav.enabled`、`aria2.enabled`、`pikpak.enabled` 控制前端是否显示“使用配置连接/登录”能力。
- `pan115.enabled` 和 `pan115.cookie` 允许网盘管理浏览 115 目录，并在服务端解析 115 下载地址后派发给 Aria2。
- `webdav.auto_connect` 和 `aria2.auto_connect` 会在页面加载后尝试使用服务端配置连接。
- `pikpak.auto_login` 会在页面加载后尝试使用服务端配置登录。
- `magnet_health.enabled` 会在最佳磁力派发前按阈值剔除低健康度候选；`probe_with_aria2` 启用后会使用已配置 Aria2 做 metadata-only 探测并自动清理探测任务。
- `/api/client-config` 只返回前端需要的脱敏默认值，不返回密码和 RPC secret。

`scrapers.priority` 控制本地刮削的元数据 provider 顺序。配置结构参考 javinizer-go 的多 scraper 设计；当前 JavJaeger 已接入全部内置 provider：JavBus、R18.dev、DMM、LibreDMM、JAVLibrary、JavDB、JAV321、MGStage、TokyoHot、AVEntertainment、DLGetchu、Caribbeancom、FC2 和 JavStash。默认启用本环境实测可用的 JavBus、LibreDMM、JAV321、TokyoHot、DLGetchu 和 FC2；JavStash 需要配置 `api_key`，部分站点仍可能因地区、Cloudflare 或年龄验证拦截而在运行时不可达。

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
  - JAVJAEGER_CONFIG_PATH=/app/data/config.json
  # - JAVBUS_PROXY=http://127.0.0.1:7890
```

如需让容器读取并保存本地配置，请把配置文件放在持久化且可写的 `data/` 目录：

```yaml
environment:
  - JAVJAEGER_CONFIG_PATH=/app/data/config.json
volumes:
  - ./data:/app/data
```

设置页会写入 `JAVJAEGER_CONFIG_PATH` 指向的文件。不要把该文件以只读方式挂载，否则保存设置和按测试结果启停刮削源会失败。

## 数据文件

运行状态默认保存在 `data/`。这些是运行数据，不是架构或设计输入。

| 文件 | 说明 |
| --- | --- |
| `data/downloaded_movies.json` | 下载历史 |
| `data/local_movie_library.json` | 本地影片库索引 |
| `data/local_actor_library.json` | 本地演员信息库索引 |
| `data/actor_images/` | 本地演员头像文件 |
| `data/automation_tasks.json` | 自动化任务和运行记录 |
| `data/config.json` | Docker 默认可写运行配置 |

Docker compose 默认挂载：

```yaml
volumes:
  - ./data:/app/data
```

## 使用说明

### 影片检索和下载

1. 在主页面输入番号或筛选条件。
2. 选择磁力来源、字幕过滤和 4K 排除策略。
3. 选择下载工具：PikPak、115 网盘或 Aria2。
4. 对单片、本页结果或批量番号执行下载。

PikPak 需要手动登录，或在 `config.json` 中启用 `pikpak` 配置。115 网盘支持在下载工具抽屉扫码登录，也可以在设置页或 `config.json` 中启用 `pan115` 并提供 115 Cookie。115 批量离线会按 `batch_size` 合并多个链接为一次请求，超过一批后按 `batch_interval_seconds ± jitter_seconds` 等待；请求失败会按 `failure_backoff_seconds` 退避重试。Aria2 需要先连接 JSON-RPC，或在 `config.json` 中启用 `aria2` 配置。

### 网盘管理到 Aria2

1. 打开网盘管理，添加或选择已保存的 WebDAV 网盘；如果已经配置 115 Cookie，也可以直接打开 115 网盘浏览目录。
2. 打开下载管理并连接 Aria2，或使用 `config.json` 中的 Aria2 配置自动连接。
3. 回到网盘管理浏览目录，选择 WebDAV 或 115 网盘文件/目录。
4. 按需开启“仅视频”和最小文件大小过滤。
5. 单个或批量发送到 Aria2。

115 网盘文件通过服务端 Cookie 和 115 Android 下载接口换取下载地址后派发给当前浏览器会话的 Aria2；下载 URL 和 Cookie header 不会返回给浏览器。
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
GET    /api/system/files          # 服务端本地文件夹资源管理器浏览
GET    /api/system/settings       # 系统设置摘要
PUT    /api/system/settings       # 更新 JavBus、刮削员、WebDAV、Aria2、PikPak 和 115 配置
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
DELETE /api/movies/local-library/{movie_id}
GET    /api/movies/local-library/information/check
POST   /api/movies/local-library/information/download
POST   /api/movies/local-library/clean-invalid
GET    /api/movies/local-library/actors
GET    /api/movies/local-library/actors/{actor_key}/movies
GET    /api/movies/local-library/actors/{actor_key}/avatar
GET    /api/movies/local-library/actor-avatar/{movie_id}/{actor_name}
GET    /api/movies/local-library/poster/{movie_id}
GET    /api/movies/local-library/thumbnail/{movie_id}
GET    /api/movies/local-library/{movie_id}/play
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

POST   /api/115/qrcode/start
GET    /api/115/qrcode/{session_id}/status
GET    /api/115/status
POST   /api/115/cookie
POST   /api/115/download
GET    /api/115/files

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

`/api/movies/local-library/information/check` 会检查元数据以及默认本地资料文件（NFO、本地封面）是否缺失，可通过逗号分隔的 `fields` 指定检查标准：`title`、`date`、`stars`、`genres`、`cover_url`、`nfo`、`poster_file`。`/api/movies/local-library/information/download` 支持传入同样的 `fields`，并支持与本地刮削执行相同的资料产物开关：`write_nfo`、`download_images`、`download_sample_images`、`download_actor_images`、`download_list_thumbnail` 和 `overwrite_existing`。

本地影视库扫描、本地刮削入库，以及 `/api/movies/local-library/information/download` 补全 API 元数据时，后端会对可访问的视频文件运行 `ffprobe`，记录分辨率、码率、编码、封装格式和时长等媒体信息。写入 NFO 时会同步写入 `fileinfo/streamdetails/video`，影视库接口也会在每个文件记录和影片级 `media_info` 中返回可展示的分辨率、码率、编码和封装格式。

`/api/movies/local-library/clean-invalid` 会重新探测影视库索引中的本地视频文件；如果一个现存视频文件仍读取不到分辨率、码率等媒体信息，则删除该物理文件并同步移除影视库文件记录。若 `ffprobe` 不可用，接口会失败返回且不会删除文件。

本地影视库在刮削或补全影片元数据时会同步维护 `data/local_actor_library.json`。演员以独立索引保存关联影片，头像保存在 `data/actor_images/`；如果演员已有本地头像，后续刮削会复用并跳过下载。

`/api/movies/local-scrape/preview` 在目标文件冲突时返回 `source_file` 和 `target_file` 详情，包含大小、修改时间以及通过 `ffprobe` 可探测到的分辨率和码率；`/api/movies/local-scrape/apply` 的 item 可传 `conflict_resolution` 为 `skip`、`keep_newer`、`keep_older`、`keep_larger`、`keep_higher_resolution`、`keep_higher_bitrate`，旧的 `keep_source` 和 `keep_target` 仍兼容。分辨率或码率无法探测、两边相同或缺少冲突策略时，后端不会自动覆盖文件。

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
│   ├── pan115/              # 115 QR/Cookie, offline dispatch, direct-link resolution
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
- 115 Cookie 只在服务端配置中保存和使用，前端接口只返回是否已登录/已配置。
- 生产环境必须设置强 `APP_SESSION_SECRET` 或 `config.session_secret`。
- `config.json` 可能包含真实凭据，不应提交到公共仓库。

## 常见问题

### 页面里为什么没有“使用配置连接/登录”按钮？

检查 `config.json` 中对应模块是否同时满足：

- `enabled: true`
- 必要字段已填写

例如 WebDAV 至少需要 `url`，Aria2 至少需要 `url`，PikPak 需要 `username` 和 `password`，115 网盘需要扫码登录或配置 Cookie。

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
