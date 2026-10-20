# JavJaeger

JavJaeger 是一个面向本地自用和私有部署的 JAV 自动化工具。它把影片发现、元数据检索、磁力选择、PikPak/115 离线下载、WebDAV 浏览、Aria2 派发、本地影片库、后台转码和自动化任务串在一个 FastAPI + React 应用里。

项目当前的工程约束是 Harness Engineering 和严格 TDD：有行为变化就先补可执行测试或等价验证，再改实现。仓库边界、模块归属和安全规则以 [AGENTS.md](AGENTS.md) 为准。

## 能做什么

- 通过内置 JavBus API-compatible provider 检索影片列表、详情、演员、类别和磁力信息。
- 按关键词、番号、演员、类别、制作商、发行商、系列等条件筛选影片。
- 搜索结果先显示摘要，再由服务器后台补全演员、制作商等资料与磁力；刷新或关闭页面不会中断已创建的任务。缓存设置保存在服务器的 `data/movie_metadata_cache.json`，公开影片资料按番号分别保存在旁边的 `data/movie_metadata_cache.json.entries/`，所有设备和浏览器共用，容器重启后仍可复用。旧版单文件缓存会在首次写入时自动迁移。在「设置 → 缓存」选择按缓存天数或占用空间（MB）清理，默认保留 30 天；保存后立即清理超限缓存，配置统一保存在服务端。空间模式按设置文件和影片条目文件的实际 UTF-8 字节总和限制容量，优先清理最早缓存的资料。缓存包含公开资料和图片地址，不包含图片文件、磁力或本地入库状态。过期或未缓存的影片自动补全，失败时保留原结果，可打开详情重试。
- 封面图片经图片代理读取后，单独保存在服务端 `data/image_cache/`，换设备、切换封面／列表模式和打开详情时共用。在「设置 → 图片缓存」配置独立的 MB 上限，默认 256 MB；图片数量和实际缓存文件大小单独统计，不占用资料缓存额度。保存后立即清理较久未使用的图片；超过上限的单张图片可显示但不写入缓存，失败响应也不会缓存。图片缓存和设置在容器重启后保留。
- 在 JavBus、Cilisousuo 和 YHG007 磁力来源之间切换，并支持字幕、4K 排除和批量选择。
- 将磁力任务派发到 PikPak、115 网盘或 Aria2。
- 在网盘管理中浏览 WebDAV、115 网盘目录和服务端本地文件夹，并把 WebDAV 文件或目录批量发送给 Aria2。
- 维护本地影片库和下载历史；本地影片库用于判断本机已有影片，下载历史区分成功提交与提交失败的资源及来源，避免重复提交，并保留失败重试入口。
- 从影视库按文件启动后台 FFmpeg GPU 转码，自动识别 NVIDIA、Intel、AMD 或 Apple 硬件编码能力；可使用按源编码、实际码率、分辨率和帧率动态决策的 H.265 自适应模式，也可使用常用预设或专业参数，并管理多个并发任务。
- 通过自动模式保存发现、筛选、磁力选择和下载派发流程，并按计划执行。
- 在设置页热更新 JavBus 访问参数。
- 在「设置 → 外观」切换管理界面的浅色或深色主题，选择立即生效并保存在当前浏览器，刷新后保留。影院模式使用独立暗色观影界面。播放器直接播放本地原文件；浏览器不支持的编码可在影片详情中创建硬件转码任务。

## 技术栈

| 部分 | 技术 |
| --- | --- |
| 后端 | Python 3.11+、FastAPI、Uvicorn |
| 前端 | React 18、Claude Design 原始模板与运行时、Nocturne、esbuild |
| 数据 | `data/` 下的本地 JSON 状态文件和图片缓存 |
| 下载与媒体 | PikPak API、115 扫码/Cookie 离线下载、WebDAV、Aria2 JSON-RPC、FFmpeg/ffprobe、NVENC/QSV/VAAPI/AMF/VideoToolbox |
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

完整部署、验收和排障流程见 [DOCKER.md 部署 SOP](DOCKER.md#部署-sop)。更新时按 SOP 传入 Git 提交号、构建时间和部署时间；管理界面和影院模式左上角均显示实际部署的短提交号及 UTC 更新时间，切换模式保持一致，悬停可查看完整提交号。镜像中的版本信息不依赖 `.git`，普通重启不会改变部署时间；未记录的信息会明确显示未知。

### 源码运行

本节用于部署服务器，或需要手动启动应用的开发场景。只在 Mac 上开发、由另一台服务器运行应用时，按下方“Mac 开发与测试”配置即可。

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

这种方式会监听 `5000`。macOS 的 Control Center 可能占用该端口；需要手动运行时，使用上面的 Uvicorn 命令指定 `8000`。

### Mac 开发与测试

Mac 负责编辑、构建和测试，应用部署在另一台服务器。Mac 需要 Python 3.11+ 和 Node.js 20+；Docker、Aria2 服务、GPU 驱动和媒体目录挂载由部署服务器提供。本机不需要配置真实账户或启动常驻应用。

首次在项目根目录执行：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm ci
npx playwright install chromium --only-shell
```

Python 依赖安装在项目 `.venv` 中，用于导入后端和执行测试。Chromium 仅用于无界面浏览器回归。无需复制或覆盖已有的 `config.json`，也无需新建部署环境变量。

每次打开新终端后，先激活虚拟环境，再验证：

```bash
source .venv/bin/activate
npm run check
npm run test:browser
```

`npm run check` 构建前端并运行前后端测试；浏览器回归会临时启动使用独立端口和临时数据的后端，结束后关闭。测试通过时，命令退出码为 `0`。真实网盘、媒体处理和 GPU 编码仍需在部署服务器验收；仅开发和运行现有测试不要求额外安装 FFmpeg。

普通源码由 `.gitattributes` 统一使用 LF。原始设计文件、`archive/` 和运行数据保留字节内容；生成的前端 bundle 只通过构建更新。Windows 路径行为使用明确的兼容性用例验证，普通文件工作流测试使用临时路径，避免绑定开发机的盘符。

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
    "javbus": { "enabled": true },
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
  },
  "local_library": {
    "source_directory": "/media/inbox",
    "directories": ["/media/JAV"],
    "ignored_paths": [],
    "actor_image_directory": "data/actor_images"
  },
  "transcoding": {
    "max_concurrent_tasks": 2
  }
}
```

配置要点：

- `scrapers.javbus` 仅保存 `enabled`；JavBus 地址、代理、限速与超时统一使用顶层 `javbus` 配置及对应环境变量。旧的独立 `base_url` / `language` / `request_delay` 不生效，设置接口会拒绝继续写入这些字段。刮削源测试按已保存配置执行，响应中的 `duration_ms` 与 `error_message` 用于查看耗时及失败原因。

- `session_secret` 用于 FastAPI session 签名，生产环境必须替换。
- `webdav.enabled`、`aria2.enabled`、`pikpak.enabled` 控制前端是否显示“使用配置连接/登录”能力。
- `pan115.enabled` 和 `pan115.cookie` 允许网盘管理浏览 115 目录，并在服务端解析 115 下载地址后派发给 Aria2。
- `webdav.auto_connect` 和 `aria2.auto_connect` 会在页面加载后尝试使用服务端配置连接。
- `pikpak.auto_login` 会在页面加载后尝试使用服务端配置登录。
- `magnet_health.enabled` 会在最佳磁力派发前按阈值剔除低健康度候选；`probe_with_aria2` 启用后会使用已配置 Aria2 做 metadata-only 探测并自动清理探测任务。
- `local_library.source_directory` 是待刮削目录；`local_library.directories` 是影视库目录列表，第一项作为默认刮削输出目录。两者由影视库页面的“路径配置”统一保存，本地刮削自动读取。`local_library.ignored_paths` 仅用于影视库扫描；Docker 中必须填写容器内可见路径。
- `local_library.actor_image_directory` 保存演员头像；Docker 默认用 `JAVJAEGER_ACTOR_IMAGE_DIR=/app/actor_images` 指向单独挂载目录。
- `transcoding.max_concurrent_tasks` 控制同时运行的 GPU FFmpeg 进程数，范围为 1–8，修改后重启应用生效；其余任务保持排队状态。新任务只使用通过实际硬件探针的编码器，未检测到 GPU 时不会回退到 CPU。
- `/api/client-config` 只返回前端需要的脱敏默认值，不返回密码和 RPC secret。

`scrapers.priority` 控制本地刮削的元数据 provider 顺序。配置结构参考 javinizer-go 的多 scraper 设计；当前 JavJaeger 已接入全部内置 provider：JavBus、R18.dev、DMM、LibreDMM、JAVLibrary、JavDB、JAV321、MGStage、TokyoHot、AVEntertainment、DLGetchu、Caribbeancom、FC2 和 JavStash。默认启用本环境实测可用的 JavBus、LibreDMM、JAV321、TokyoHot、DLGetchu 和 FC2；JavStash 需要配置 `api_key`，部分站点仍可能因地区、Cloudflare 或年龄验证拦截而在运行时不可达。

### 环境变量

环境变量优先级高于 `config.json` 中对应的 JavBus 和 session 配置。

| 变量 | 作用 |
| --- | --- |
| `APP_SESSION_SECRET` | 覆盖 `config.session_secret` |
| `JAVJAEGER_CONFIG_PATH` | 指定配置文件路径，默认 `config.json` |
| `JAVJAEGER_ACTOR_IMAGE_DIR` | 覆盖演员头像目录，Docker 默认 `/app/actor_images` |
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
  - JAVJAEGER_ACTOR_IMAGE_DIR=/app/actor_images
  # - JAVBUS_PROXY=http://127.0.0.1:7890
```

如需让容器读取并保存本地配置，请把配置文件放在持久化且可写的 `data/` 目录：

```yaml
environment:
  - JAVJAEGER_CONFIG_PATH=/app/data/config.json
volumes:
  - ./data:/app/data
  - ./actor_images:/app/actor_images
```

设置页会写入 `JAVJAEGER_CONFIG_PATH` 指向的文件。不要把该文件以只读方式挂载，否则保存设置和按测试结果启停刮削源会失败。

## 数据文件

运行状态默认保存在 `data/`。这些是运行数据，不是架构或设计输入。

| 文件 | 说明 |
| --- | --- |
| `data/downloaded_movies.json` | 下载历史、成功提交和待重试资源，包含来源与下载工具 |
| `data/local_movie_library.json` | 本地影片库索引 |
| `data/local_actor_library.json` | 本地演员信息库索引 |
| `data/actor_images/` 或 Docker 默认 `/app/actor_images/` | 本地演员头像文件，独立于影视库扫描路径 |
| `data/automation_tasks.json` | 自动化任务和运行记录 |
| `data/transcoding_tasks.json` | 转码任务、参数、进度与运行结果；不包含媒体内容 |
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

115 网盘文件通过服务端 Cookie 和 115 Android 下载接口换取签名下载地址后派发给当前浏览器会话的 Aria2；115 Cookie 不会返回给浏览器，也不会作为 Aria2 请求 header 下发。
WebDAV 和 Aria2 连接状态是 session-scoped；一个浏览器会话不会覆盖另一个会话的下载器状态。

### 本地影片库

在“设置 → 媒体目录”可直接修改待刮削目录和默认影视库目录，支持浏览服务端目录、保存、重置和重新载入。修改默认影视库目录会保留其他影视库路径和排除目录；保存后同步到影视库和本地刮削，正在运行的任务和已有预览仍使用原路径。影视库的“路径配置”继续使用同一套配置。

影视库保留左侧筛选、右侧统计卡片与列表、海报、演员视图。列表为演员与封面预留更大空间；拖动表头分隔线可调整各列宽度，聚焦分隔线后也可用左右方向键微调，列宽保存在当前浏览器，并可点击“恢复默认列宽”重置。滚动条跟随主题，海报支持键盘打开详情；手机端详情中的本地文件与播放、转码操作按纵向排列。

影院模式参考 Jellyfin 的浏览方式，提供最近入库、高清收藏、系列、演员与 VR 分区，支持搜索、组合筛选、排序及分页。展开“筛选影片”后，每组每页显示 60 个选项，可在组内搜索或翻页查找全部选项；同组条件按“或”匹配，不同组按“且”匹配。关闭筛选区或更换选项页会保留已选条件，可通过条件标签移除或统一清空。影片详情在影院内打开，关闭后保留原浏览位置；可选择本地文件或分段播放，并自动跳过已标记缺失的分段。封面、简介及分区均来自本地索引，未配置的媒体和观看进度不会用示例数据填充。

本地影片库用于记录本机已有影片，是判断影片是否已拥有的来源；下载历史区分已提交与派发失败的资源：已提交链接用于去重与同源替换，失败链接可按原资源重试。路径必须是服务端进程能访问的路径：

- Windows 直接运行：`D:\Media\JAV`
- Linux/macOS 直接运行：`/media/JAV`
- Docker 运行：填写容器内路径，例如把宿主机目录挂载到 `/media/JAV` 后，在页面中填写 `/media/JAV`

如果服务端运行在 Docker 或 Linux 中，不能直接填写宿主机 Windows 路径，除非该路径已经通过 volume、SMB、NFS 或 WSL 等方式挂载到服务端可见的位置。
影视库页面的“路径配置”统一保存两类目录：待刮削目录用于存放下载完成、尚未整理的原片；影视库目录用于存放整理结果，也用于扫描已有收藏。可配置多个影视库目录，第一项作为默认刮削输出目录。本地刮削自动填入这两个目录，也可为单次任务修改；刷新页面后重新读取默认目录，恢复中的任务和已有预览继续使用原路径。生成预览不会移动文件，确认执行后才整理入库。关闭“整理到目标目录”仍可原地刮削。

待刮削目录可以位于影视库目录内，扫描影视库时始终跳过它，即使请求指定了其他忽略路径。影视库目录不能与待刮削目录相同或位于待刮削目录内，避免再次刮削整理结果。保存路径不会立即扫描或删除已有索引；旧配置的影视库路径继续保留，需补选待刮削目录，不自动猜测或移动现有文件。

在待刮削目录中选择原地刮削时，只写入所选资料，不自动加入影视库。文件整理到影视库目录后才自动入库。

后端按影视库路径分别记录 `scan_root`，重新扫描某一个路径并启用“移除缺失文件”时，只会清理该路径下已经不存在的旧文件记录，不会删除其他数据源路径的记录。忽略路径可以是绝对路径，也可以是相对每个扫描根目录的路径，例如 `cache` 或 `sample`。演员头像不跟随这些数据源路径，始终写入 `local_library.actor_image_directory` 或 `JAVJAEGER_ACTOR_IMAGE_DIR` 指向的目录；扫描时启用“整理文件”会把旧 `actors/` 目录里的 JPG/JPEG 头像移到该目录，并删除同番号、同大小且内容完全相同的重复视频文件。
扫描导入时会读取视频旁的同名 `.nfo`，用其中的番号、标题、演员、标签、片商、系列、封面和媒体流信息重建影视库索引；JavJaeger 新写出的 NFO 还包含完整规范化元数据，可无损恢复演员引用、样片、列表缩略图和刮削源原始字段。旧版或第三方 NFO 会继续按标准 XML 字段兼容导入。只有显式启用在线刮削时，在线结果才会覆盖这些 NFO 元数据。
影片操作区同时提供“移除”和“彻底删除”：移除只清理影视库及演员关联记录，保留硬盘文件；彻底删除会永久删除该记录登记的视频、同名 NFO/封面/缩略图/字幕以及 NFO 引用的影片目录内资料文件，再清理影视库及演员关联记录。目录级图片或样片仍被同目录其他影片共享时会保留；任何登记路径超出原 `scan_root`，或扫描目录当前不可访问时，后端都会拒绝物理删除并保留记录。
历史记录页可核对下载历史中的影片是否已经进入本地影片库；未入库记录会保留旧资源链接作为“已尝试”链接，并可一键自动重新选择可替换磁力后派发到当前下载工具。

### 影视库转码

并发的硬件能力查询共用一次探测。实时进度保留在内存中，所有转码任务共用每 5 秒一次的进度落盘；启动、完成、失败、取消等状态仍即时保存。异常退出时，已保存的中间进度最多可能落后约 5 秒。

1. 在影视库的列表、卡片或影片详情中点击“转码”；多文件影片可以在菜单中指定文件。
2. 系统会自动检测 GPU 型号，并对 FFmpeg 硬件编码器执行短时真实探针。选择“H.265 自适应转码”时，后端会用 ffprobe 读取源编码、实际视频码率、分辨率、帧率和音频流，保持原分辨率、原帧率、原音频、字幕、元数据和 8/10-bit 像素深度，并结合源编码效率和像素负载计算保守的 H.265 目标码率；如果源码率过低，或源文件已经是 H.265/VP9/AV1 等同级或更高效率编码，任务会直接拒绝，避免没有可靠体积收益的重复有损编码。也可以选择“画质基本保持”或“降低画质”预设，或展开专业参数自行调整。
3. 启动后任务进入后台队列。顶栏“转码”面板会显示进度、速度、预计剩余时间和输出大小，并支持取消、失败重试、详情查看与清理历史记录。

转码只允许选择影视库已经索引的本地文件，接口不接受任意服务器路径。同一个源文件同时只能有一个活动任务，不同文件可以并发处理。视频编码强制使用已通过硬件探针的 GPU 编码器；GPU 不可用或所选格式不受支持时任务会被拒绝，不会静默使用 CPU。自适应模式忽略客户端提交的手工编码参数，参数决策和重试时的重新探测都由后端完成，并在任务的 `adaptive_analysis` 字段保存源参数与目标码率。FFmpeg 始终先在源文件同目录写入临时文件；只有进程成功退出、临时输出具有可读的视频流、时长与原片相差不超过 2 秒或 1%（取较大者）、保留原有音轨且实际体积严格小于原文件时，才通过原子替换覆盖。所有预设都需要 ffprobe；排队期间大小变化或转码期间源文件发生变化会拒绝覆盖。输出相等或更大、失败或取消都会删除临时输出并保留原片。任务完成后会用 ffprobe 刷新影视库中的大小、分辨率、码率、编码、封装格式和时长。

### 自动模式

自动模式保存发现、磁力选择和下载派发流程。任务支持手动运行、定时运行和间隔运行。任务状态与运行记录保存在 `data/automation_tasks.json`。

自动派发前会先检查本地影片库；如果影片不在本地库中，则会跳过下载历史里已经成功提交的资源链接，并按该链接原本的磁力来源继续选择次优磁力。

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
GET    /api/movies/local-library/settings
PUT    /api/movies/local-library/settings
POST   /api/movies/local-library/scan  # body 支持 directory/directories/ignored_paths/probe_media/regularize_files；默认快速扫描入库
POST   /api/movies/local-library/scan/jobs
GET    /api/movies/local-library/scan/jobs/{task_id}
DELETE /api/movies/local-library
DELETE /api/movies/local-library/{movie_id}
GET    /api/movies/local-library/information/check
POST   /api/movies/local-library/information/download
POST   /api/movies/local-library/information/check/jobs
POST   /api/movies/local-library/information/download/jobs
GET    /api/movies/local-library/information/jobs/{task_id}
POST   /api/movies/local-library/clean-invalid
POST   /api/movies/local-library/clean-invalid/jobs
GET    /api/movies/local-library/clean-invalid/jobs/{task_id}
GET    /api/movies/local-library/actors
GET    /api/movies/local-library/actors/{actor_key}/movies
GET    /api/movies/local-library/actors/{actor_key}/avatar
GET    /api/movies/local-library/actor-avatar/{movie_id}/{actor_name}
GET    /api/movies/local-library/poster/{movie_id}
GET    /api/movies/local-library/thumbnail/{movie_id}
GET    /api/movies/local-library/{movie_id}/play
GET    /api/movies/local-library/{movie_id}
GET    /api/movies/transcoding/presets
GET    /api/movies/transcoding/tasks
POST   /api/movies/transcoding/tasks
GET    /api/movies/transcoding/tasks/{task_id}
POST   /api/movies/transcoding/tasks/{task_id}/cancel
POST   /api/movies/transcoding/tasks/{task_id}/retry
DELETE /api/movies/transcoding/tasks/{task_id}
POST   /api/movies/local-scrape/preview
POST   /api/movies/local-scrape/delete
POST   /api/movies/local-scrape/apply

GET    /api/magnets/{movie_id}
GET    /api/stars/{star_id}

GET    /api/history
POST   /api/history/{movie_id}/dismiss-failure
DELETE /api/history
POST   /api/history/check-local-library
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
POST   /api/115/download-jobs
GET    /api/115/download-jobs/{job_id}
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

POST   /api/automation/dispatch-jobs
GET    /api/system/jobs
GET    /api/system/jobs/{task_id}
DELETE /api/system/jobs/{task_id}
POST   /api/movies/search-jobs
POST   /api/movies/metadata-scrapers/test/jobs
POST   /api/webdav/download/jobs

GET    /api/automation/tasks
POST   /api/automation/tasks
GET    /api/automation/tasks/{task_id}
PUT    /api/automation/tasks/{task_id}
DELETE /api/automation/tasks/{task_id}
POST   /api/automation/tasks/{task_id}/run
POST   /api/automation/tasks/{task_id}/run?background=true
GET    /api/automation/tasks/{task_id}/runs
```

派发历史的 `download_resources` 保存成功提交的资源，`failed_resources` 保存提交失败的原链接、磁力来源和下载工具。只有成功提交的链接参与去重；失败项可按原资源重试，或通过 `dismiss-failure`（JSON：`{"link":"原资源链接"}`）逐项忽略。成功提交只代表下载服务接收请求，不代表远端文件已经下载完成。

影片派发（PikPak、115、Aria2）的磁力预检与提交统一由 `/api/automation/dispatch-jobs` 创建后台任务。`magnet_links` 为 `null` 时在服务器检索最佳磁力；提供链接时按确认的资源派发。网盘文件和目录派发使用 `/api/webdav/download/jobs`，任务持有独立 WebDAV 连接，刷新后的重连不会关闭它。刮削源测试使用 `/api/movies/metadata-scrapers/test/jobs`，结果不会自动写入配置；配置变更后旧结果也不会覆盖当前测试建议。以上创建接口均返回 HTTP 202 和 `task_id`。原有同步接口及 115 `download-jobs` 保留兼容。

搜索补全与全页检索使用 `/api/movies/search-jobs`，资料与磁力并发上限为 4，部分失败仍保留摘要和封面。`GET /api/system/jobs` 只发现当前浏览器会话的任务，支持 ETag / 304；单任务 GET 返回进度、日志和结果，DELETE 仅关闭已结束的任务记录。刷新后页面自动发现这些任务，搜索结果可恢复，完成结果可从顶栏“后台任务”查看。刷新恢复不会触发自动下载；当前页面启用的自动下载仍需用户确认。

这些临时任务及结果保存在服务器内存中，每个会话最多保留 20 个任务（活动任务受保护），不持久化任务凭据。刷新、关闭网页不影响执行；容器或应用重启会中断任务，已提交到下载工具的资源继续由工具处理。重启后先核对下载历史和工具任务，再手动重试未提交项；页面不会自动重派。稳定的 `APP_SESSION_SECRET` 可保持同一浏览器的会话身份，但不提供跨进程任务恢复。

自动任务的 `run?background=true` 返回 HTTP 202 与 `running` 记录，通过任务列表或 `/runs` 读取阶段进度；省略参数仍保持同步 API。最终状态区分 `success`、`partial`、`failed`、`noop`（无新下载）。服务启动发现中断的 `running` 记录时标记失败并停用该任务，用户核对历史后可重新启用。

`/api/{path:path}` 是最后注册的代理 catch-all。新增具体 API 时必须放在代理路由之前。

`/api/movies/local-library/information/check` 默认读取索引中的元数据和最近核验的本地资料状态，不访问媒体硬盘。可通过逗号分隔的 `fields` 指定检查标准：`title`、`date`、`stars`、`genres`、`cover_url`、`nfo`、`poster_file`。传入 `refresh_files=true` 且选择本地资料字段时，才重新核验文件。旧索引尚未核验的文件以 `unchecked_fields` / `unchecked_count` 标记，界面显示“本地文件待核验”。`/api/movies/local-library/information/download` 支持传入同样的 `fields`，并支持与本地刮削执行相同的资料产物开关：`write_nfo`、`download_images`、`download_sample_images`、`download_actor_images`、`download_list_thumbnail` 和 `overwrite_existing`。

点击影视库“资料检查”会立即通过 `POST /api/movies/local-library/information/check/jobs?fields=...` 创建服务端后台任务，主动核验所选资料；“检查项设置”可调整检查范围。接口返回 HTTP 202 和 `task_id`，通过 `GET /api/movies/local-library/information/jobs/{task_id}` 查询进度与结果。完成提示保留在后台任务中，点击“查看”可查看缺失清单，再点击“开始补全”通过 `POST /api/movies/local-library/information/download/jobs` 创建补全任务。补全使用检查结果中的字段和影片清单，完成后重新核验，显示成功数、失败数及剩余缺失项，支持继续补全。详情页的联网补全和重新刮削也走同一后台任务流程。

资料任务独立于当前页面运行；切换页面或刷新不影响服务端执行，同一浏览器标签页通过 sessionStorage 中的任务 ID 和非敏感参数恢复查询，已完成结果入口会保留到用户点击“完成”或启动下一次资料任务。本地扫描、刮削、资料检查／补全和清洗共用内存队列，保留最近完成的 20 项任务结果；115 派发队列单独保留最近完成的 20 项。排队和运行中的任务全部保留，不占已完成结果额度。服务重启或旧结果被淘汰后会提示“任务已失效”，可重新检查；淘汰结果不删除媒体或下载历史，也不自动恢复中断的写入。补全的媒体探测和 NFO 写入在工作线程执行，避免阻塞后台进度查询。

本地影视库扫描启用 `probe_media` 时，只对新增、大小或修改时间变化、缺少媒体参数的文件运行 `ffprobe`，其余复用已索引的参数。目录遍历及媒体探测在工作线程执行。本地刮削入库和 `/api/movies/local-library/information/download` 补全 API 元数据仍会探测对应的视频，记录分辨率、码率、编码、封装格式和时长。写入 NFO 时会同步写入 `fileinfo/streamdetails/video`，影视库接口也会在每个文件记录和影片级 `media_info` 中返回这些参数。

影视库列表的 `files[].exists` 来自扫描或主动核验时保存的 `files[].filesystem` 快照，未核验时为 `null`。核验按目录合并读取，每个父目录枚举一次，不读取视频内容；浏览、分页、轮询、“刷新影视库”及服务重启不会自动重新扫描媒体硬盘。播放、转码和永久删除仍在执行时验证实际文件。外部手动增删文件后，可运行扫描更新索引，或通过“资料检查”更新已有文件的状态。补全资料后只更新涉及影片的文件快照。

影视库“清洗无效文件”经确认后通过 `POST /api/movies/local-library/clean-invalid/jobs` 启动后台清洗（HTTP 202），通过 `GET /api/movies/local-library/clean-invalid/jobs/{task_id}` 查询进度；完成后在后台任务中查看已删除和无法处理的文件，刷新页面可恢复结果入口。旧的同步 `/api/movies/local-library/clean-invalid` 保留兼容。清洗只删除索引扫描根目录内、确认零字节或 ffprobe 成功确认没有视频流的文件，并同步索引。探测超时、返回错误、媒体信息不明、文件变化或磁盘不可读时保留文件，在 `failed_files` 和 `probe_failed_count` 中报告原因；若 ffprobe 不可用则不执行清理。

`DELETE /api/movies/local-library/{movie_id}` 只移除索引；`DELETE /api/movies/local-library/{movie_id}/files` 执行上述受 `scan_root` 限制的永久文件删除。永久删除不会清理独立的下载历史，也不会删除仍可能被其他影片复用的共享演员头像。

本地影视库在刮削或补全影片元数据时会同步维护 `data/local_actor_library.json`。演员以独立索引保存关联影片，头像保存在单独的演员头像目录；如果演员已有本地头像，后续刮削会直接复用，跳过演员资料查询和头像下载。启用覆盖时仍重新获取头像。

资料补全逐片将元数据和媒体参数原子保存到 `data/local_movie_library.json.updates/`，成功写入后才更新内存。每片更新只包含该片记录；正常结束、异常或取消时统一合并完整 JSON 并重建一次演员索引，避免逐片重写全库。应用启动会先恢复未合并更新并修复演员索引，再接受请求；恢复只读取索引，不扫描媒体硬盘或联网下载头像。快照代号用于排除已合并的旧更新，防止清理中断后恢复已删除的记录。增量文件损坏或结构无效时启动会报错并保留文件，请先备份再排查。

备份和迁移时，将 `data/local_movie_library.json`、`data/local_movie_library.json.updates/` 和 `data/local_actor_library.json` 一起保存。回滚到不支持增量恢复的旧版本前，先在当前版本完成恢复并等待资料任务结束，再停止应用、备份并切换版本。直接读取完整 JSON 的外部工具应等待补全任务结束；补全过程中的最新记录通过 API 读取。

`/api/movies/local-scrape/apply` 的 item 可带预览返回的 `target_video_path`，执行部分文件时保留确认过的分片编号；服务端限定目标必须符合本次目录与命名模板。资料的 `overwrite_existing` 仅决定是否更新已存在的 NFO 和图片，不能覆盖视频冲突选择。跨盘移动先复制至目标目录的临时文件，校验大小与源状态后再替换目标，复制失败保留源文件与原目标。

`/api/movies/local-scrape/preview` 在目标文件冲突时返回 `source_file` 和 `target_file` 详情，包含大小、修改时间以及通过 `ffprobe` 可探测到的分辨率和码率；`/api/movies/local-scrape/apply` 的 item 可传 `conflict_resolution` 为 `auto_best`、`skip`、`keep_newer`、`keep_older`、`keep_larger`、`keep_higher_resolution`、`keep_higher_bitrate`，旧的 `keep_source` 和 `keep_target` 仍兼容。`auto_best` 会按分辨率、码率、文件大小、修改时间依次选择保留文件；源文件更优时移动源文件覆盖目标，目标文件更优时保留目标并删除源文件，仍无法判断时保留目标且不删除源文件。分辨率或码率无法探测、两边相同或缺少冲突策略时，后端不会自动覆盖文件。
启用整理时，元数据标记为 VR 的影片会统一存入目标根目录下的 `VR/` 文件夹，再应用原有文件夹和命名模板。影视库扫描会同时依据元数据和路径中的 `VR/` 目录写入 `is_vr` 分类；列表、海报墙和详情会显示 VR 标记，并可在“影片类型”中筛选 VR 或普通影片。
如果同一次预览中多个源文件生成相同目标路径，预览项会标记 `target_duplicate`；这类批次内重复目标不会被一键冲突策略自动处理，需要先调整命名模板或移除重复项。后端 apply 会重新检查同一请求内的重复目标并返回 `target_duplicate`，不会移动这些源文件。

预览及预览后台任务支持 `code_overrides`（源文件绝对路径到番号的映射），用于手动修正识别失败的文件。后端只接受本次扫描范围内的视频文件及完整有效的番号；修正后重新生成预览，执行前不会修改源文件。浏览器通过 session storage 保存扫描／刮削／清洗任务标识与非敏感配置，完成后仍保留后台入口，刷新后可查看扫描目录失败原因、继续确认刮削预览或查看执行明细；查看并确认结果、重置刮削或启动下一任务后清除或替换入口。115 派发也保留结果入口到用户查看。后端重启或内存队列清理导致任务失效时会提示核对结果后重新操作。执行结果保留逐文件的成功、失败及入库异常信息。

WebDAV 文件夹发送到 Aria2 时，单个文件添加失败不会中断后续文件；界面汇总成功、失败和跳过项，并刷新已提交的下载任务。重试时只选择失败文件，避免整目录重复提交。远程 Aria2 的任务删除只操作 RPC 任务，不删除 JavJaeger 本机的 `.aria2` 文件。

运行中的自动任务不能删除，需等待本次执行结束；可先停用后续触发。自动任务错误响应的 `detail` 包含机器可读的 `error` 和供界面显示的 `message`。刮削源测试结果按来源合并，应用前需先保存修改；重新加载或保存配置会清除旧测试结果，避免使用过期诊断覆盖配置。

## 开发约定

前端入口等待设计运行时与 React 初始化完成后挂载。CDN 备用源异步加载时会等待页面 `load` 事件；依赖仍不可用时显示检查网络并刷新页面的提示。

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
│   └── proxy/               # trusted image proxy/cache and final API catch-all
├── frontend/src/            # editable frontend source
├── static/                  # static assets and generated frontend bundle
├── templates/index.html     # HTML shell only
├── tests/                   # executable harnesses
├── docs/                    # contributor-facing architecture notes
├── archive/                 # historical reference only
└── data/                    # runtime state
```

### 前端构建

影视库与演员列表使用 `GET /api/movies/local-library?compact=true` 和 `GET /api/movies/local-library/actors?compact=true`，省略列表不使用的 `full_text`、`metadata.raw`、`metadata.samples` 以及演员的重复影片关联。原始索引保留完整数据，不带 `compact=true` 时 API 仍返回原有完整响应。

只编辑 `frontend/src/**`。当前入口直接加载 `frontend/src/design/JavJaeger.dc.html`，使用从 [Claude Design 项目](https://claude.ai/design/p/dd9314b9-ac26-4ea3-8746-99ec32b2de8c?file=JavJaeger.dc.html) 导入的原 HTML、`support.js`、`_ds` 样式和 logo。五个原文件保留导入内容，校验和测试用于防止无意改版；`integration.mjs` 将原页面控件接入现有 API，`template.mjs` 和 `host.css` 处理播放器、字段绑定、弹窗与窄屏适配；`cinema.mjs` 提供独立影院视图，复用现有影片数据、筛选和播放流程。原来的 Ant Design 页面及 `nocturne.css` 不再由入口加载。

构建会将 HTML 作为文本、logo 作为 data URL 打包，生成 `static/app.js` 和 `static/app.css`。不要手改这两个产物。运行时无需连接 Claude Design 或登录设计服务。

页面只计算当前视图及已打开的共享弹窗。影视库、影院海报墙、演员目录、大批量检索结果、下载历史、失败资源、转码队列、刮削预览与执行结果、文件列表、目录选择及批量确认列表每页显示 60 项；后台任务菜单每页 6 项。影视库、影院海报墙、下载历史、失败资源和刮削执行结果先分页，再生成当前页的展示数据。影院系列与 VR 分组每页显示 6 组、每组预览 12 部，可通过“查看全部”访问完整结果。筛选或排序变化会回到第一页，筛选、排序和批量操作始终作用于完整数据。短时间切换影院和影视库会复用 30 秒内已加载的数据；“刷新影视库”和扫描、刮削、删除完成后的刷新不受此限制，但都只读取索引。后台队列内容未变化时不会重绘页面；各类后台进度并发读取，单类响应慢不会阻塞其他任务更新。影片结果和弹窗先显示，再补齐磁力或硬件检测结果。封面及头像只在实际请求图片时检查对应文件。

相同的并发读取请求会合并，写入后的读取会重新请求。后端 JavBus 读取也会合并相同 URL、参数和请求头的并发请求，失败不会进入缓存。资料缓存和图片缓存命中时不再遍历整个缓存索引；资料过期、写入和设置变化时仍会清理。资料检查只复制校验所需的字段。下载历史的单片查询直接查索引，保存时远程元数据请求不占用历史锁。自动任务轮询只检查任务文件的修改时间、大小和文件标识；内容未变时复用解析结果，外部修改会触发重读。自动任务保存、转码任务历史的加载与保存、图片下载的文件操作在工作线程执行；取消保存会等待当前写入结束才释放锁，转码任务写入成功后仍会完成入队或进程终止，图片写入失败会保留旧文件。转码进度继续共用每 5 秒一次的完整 JSON 快照。目录浏览、刮削预览的文件检查、媒体探测和整理中的跨盘复制也在工作线程执行。

增量补全检索结果时复用番号索引，只生成当前页的展示数据，继续即时更新已返回的资料和磁力。115 批量派发在同源替换完成后用最终链接的归一化键去重，保留原提交顺序和分批策略。自动任务调度只读取计划字段，不复制影片运行明细。

下载历史将同一派发批次的成功资料、失败资源、来源和下载工具合并后，一次原子保存完整快照。历史文件结构保持不变，无需迁移；加载、编码、写入和入库核对在工作线程执行。写入成功后才发布新内存记录，失败保留旧文件和旧记录，取消会等待当前写入和发布结束。影院筛选区折叠时不生成选项，展开后先搜索和分页，再创建当前页按钮；完整选项集仍参与筛选，刷新影视库后重新读取选项并回到选项第一页。

同一批刮削按父目录在工作线程中建立一次字幕索引，保留文件名、扩展名和枚举顺序的匹配规则；本批移动或改名字幕后同步索引，避免后续影片重复使用旧路径。外部新增字幕在下一批重新扫描时可见。

元数据刮削在单片查询、批量扫描、资料补全、刮削预览和刮削源测试中复用批次内的 HTTP 连接。各次请求会话的 Cookie、API key、请求头和超时保持独立，同一会话内仍可保留搜索、详情及重定向所需的 Cookie。HTTPX 继续按环境代理和 `NO_PROXY` 选择连接；批次结束、失败或取消时，先回收子任务，再关闭连接池。JavBus 继续使用其现有客户端。

共享元数据缓存更新一部影片时只原子替换该片条目，命中和容量查询不再序列化整份缓存。首次迁移先写齐新条目，再原子提交设置文件；提交前失败仍可使用旧快照。加载、迁移和写入在工作线程执行，取消会等待当前文件操作完成才释放缓存锁。重启时需逐条读取缓存目录，大量小文件会增加冷启动读取成本。备份或手动清除缓存时，应同时处理设置文件和 `.entries/` 目录。

转码及自动任务列表支持 `ETag` / `If-None-Match`。界面每 3 秒检查任务变化，版本未变时服务端直接返回无正文的 `304`，前端跳过 JSON 解析、整份历史比较和重绘。任务新增、删除、运行进度变化及自动任务文件的外部修改都会使版本失效；首次加载和手动刷新仍读取完整列表。现有不带条件头的 GET 响应结构保持不变。

Cilisousuo 最优磁力查询先从搜索摘要筛选字幕和 4K 条件，再按体积从大到小逐个读取候选详情。搜索和详情使用同一客户端，保留站点 Cookie。找到首个未尝试且通过健康检查的磁力后立即返回；详情失败、空磁力或候选被排除时继续检查后续结果，不限制为前五个候选。同一查询中的重复详情地址和磁力健康探测会复用结果。

```bash
npm run build:frontend
```

`templates/index.html` 只负责加载 CDN、样式、注入版本信息和引用 `/static/app.js`、`/static/app.css`。

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

页面或交互变更还需运行 Chromium 工作流回归（Node.js 20+，首次安装浏览器）：

```bash
npm ci
npx playwright install chromium --only-shell
npm run test:browser
```

浏览器测试自动创建临时配置、数据目录和独立端口，启动真实 FastAPI 后端；外部下载、登录和 GPU 由测试模拟，配置保存、临时媒体整理与播放、索引移除、自动任务保存和空结果运行直接通过真实后端验证，不访问现有媒体库或真实账户。覆盖九个主页面、桌面与窄屏布局，以及查询、派发、刮削、影视库、自动任务、网盘、转码和设置交互。需要网络加载页面 CDN 资源；真实外部服务和 GPU 编码仍需在目标部署环境联调。Python 默认使用项目 `.venv`，也可通过 `JAVJAEGER_QA_PYTHON` 指定已安装 `requirements.txt` 的解释器。

大库性能回归使用 10,000 部影片、每部 5 GB、合计 50 TB 的逻辑索引。`tests/test_library_read_performance.py` 统计浏览磁盘调用、目录枚举和重复 `ffprobe` 次数；`tests/test_backend_operation_performance.py` 覆盖列表响应精简、历史锁竞争、自动任务缓存及取消写入保护、目录访问、并发请求和转码进度落盘。`tests/test_information_check_performance.py` 限制资料检查的复制范围和批量补全的集合构造次数；缓存测试验证命中不扫描无关条目。前端测试统计分页前后的展示数据生成次数，浏览器回归覆盖同规模列表及批量确认的导航、分页和输入。这是索引规模与调用次数模拟，不会创建或读写真实 50 TB 视频。

`tests/test_scraper_http_reuse.py` 使用本机临时 HTTP/1.1 服务统计真实 TCP 连接，验证顺序和并发刮削的连接复用；对应的隔离及流程测试验证 Cookie、请求头、超时、代理路由和连接池关闭时机，不访问外部刮削源。

磁力性能回归用 40 个合成候选验证最优查询只读取搜索页和命中的详情页，并验证历史排除、健康检查及第六个以后候选的回退。后台任务保留测试验证完成顺序、活动任务保护和结果淘汰；头像复用测试验证已有 20 张本地头像时不发起远程演员查询。

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
