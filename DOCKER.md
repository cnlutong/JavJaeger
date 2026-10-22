# Docker 容器化部署指南

## 概览

本指南用于运行应用的服务器。Mac 仅用于开发和测试时，无需安装 Docker，参见 [Mac 开发与测试](readme.md#mac-开发与测试)。

Android TV 客户端连接同一台服务器，不需要新增容器或媒体挂载。APK 独立构建，`android-tv/` 不打包进服务端镜像；电视上填写服务器可达的宿主机地址与映射端口，参见 [客户端说明](android-tv/README.md)。

当前 Docker 运行方式有两个关键点：

- 应用容器内部监听 `5000` 端口
- 宿主机默认映射为 `8000:5000`

如果你使用仓库中的 `nginx.conf` 作为反向代理，上游后端也必须指向 `javjaeger:5000`。这一点已经与当前配置对齐。

## 部署 SOP

按下面顺序执行部署。不要跳过配置可写性检查；设置页保存、刮削源测试结果应用、下载服务配置都会写入运行配置。

### 0. 部署前检查

1. 确认当前目录是仓库根目录，并已拉取目标版本。
2. 停止应用后备份现有运行数据，至少保留 `data/config.json`、`data/downloaded_movies.json`、`data/local_movie_library.json`、`data/local_movie_library.json.updates/`、`data/local_actor_library.json`、`data/automation_tasks.json`、`data/transcoding_tasks.json` 和 `actor_images/`。影片库 JSON、增量目录和演员索引必须一起备份。
3. 确认宿主机 `./data` 目录存在且对 Docker 进程可写。
4. 准备强随机 `APP_SESSION_SECRET`，不要使用示例值。
5. 确认配置文件路径使用可写持久化路径：`JAVJAEGER_CONFIG_PATH=/app/data/config.json`。

影片缓存设置保存在 `/app/data/movie_metadata_cache.json`，公开资料按影片分别保存在 `/app/data/movie_metadata_cache.json.entries/`。旧单文件缓存会在首次写入时迁移；提交新布局前保留旧快照。使用现有 `./data` 挂载即可跨设备共享并在容器更新后保留。备份或手动清除资料缓存时，应同时处理设置文件和条目目录；备份整个 `data/` 会一并包含两者。

封面图片及其独立空间上限保存在 `/app/data/image_cache/`，也使用现有 `./data` 挂载。在「设置 → 图片缓存」设置容量，默认 256 MB，按图片缓存文件的实际大小计量。`GET /api/image-cache` 返回 `settings`、`count` 和 `size_bytes`；`PUT /api/image-cache` 接受 `{"mb": 正整数}`，保存后立即清理超限图片。资料缓存的天数或 MB 设置不受影响。

搜索补全、全页检索、单次下载派发、网盘目录派发和刮削源测试在服务端后台执行，网页刷新不影响任务。它们的运行状态与结果仅保留在应用内存中，更新或重启容器前应等待任务结束；重启后先核对下载历史和下载工具，再重试未提交项，避免重复派发。任务凭据不会因后台执行而新增落盘。转码及保存的自动任务继续使用各自已有的持久化和中断处理。

浏览页的 115 播放等待也使用会话所属的临时后台任务，服务重启后需重新发起。视频由服务端解析地址并转发，支持 Range 请求；无需新增挂载，服务器需能访问 115 下载节点并承担播放流量。

本地原片播放支持 Range 请求；客户端断连后停止继续读取并关闭文件。更新此修复时需重建并重启应用容器，以清理旧进程中已经遗留的播放响应。现有 TV v0.3.2 无需重新安装。

外挂字幕需要更新网页和服务端；TV 需安装 v0.3.4 及以上版本。字幕与原片使用现有媒体挂载，例如 `ABF-017.mp4` 旁的 `ABF-017.zh-Hans.srt` 或 `.vtt`，文件需对容器可读。播放时按需发现，无需重新扫描影视库或运行识别模型。`GET /api/movies/local-library/ABF-017/subtitles?file_index=0` 可验收字幕发现；字幕接口统一返回 WebVTT。同名 SRT/VTT 优先使用 VTT。字体、字号和底部留白保存在浏览器或 TV 本机，不新增服务端配置或挂载。

网盘文件派发可在任务日志窗口取消，并重试未成功提交项。取消会等待当前操作返回；已提交到 Aria2 的下载继续。逐文件成功记录与固定 GID 在同一应用进程内防止重派；提交结果不明时，重试仅向 Aria2 核对。此记录不跨容器重启恢复，更新前仍需等待任务结束并核对下载工具。

### 1. 配置 docker-compose.yml

生产部署至少保留以下配置：

```yaml
services:
  javjaeger:
    ports:
      - "8000:5000"
    environment:
      - APP_SESSION_SECRET=replace-with-a-strong-secret
      - JAVJAEGER_CONFIG_PATH=/app/data/config.json
      - JAVJAEGER_ACTOR_IMAGE_DIR=/app/actor_images
      # - JAVBUS_PROXY=http://proxy.example:7890
    volumes:
      - ./data:/app/data
      - ./actor_images:/app/actor_images
```

如果要把多个媒体目录加入影视库，建议把运行数据和媒体目录分开挂载，例如：

```yaml
services:
  javjaeger:
    volumes:
      - ./data:/app/data
      - ./actor_images:/app/actor_images
      - /srv/downloads:/media/inbox
      - /srv/media/jav1:/media/jav1
      - /srv/media/jav2:/media/jav2
```

然后在影视库页面的“路径配置”中，把待刮削目录设为 `/media/inbox`，影视库目录设为 `/media/jav1` 和 `/media/jav2`。本地刮削默认从待刮削目录读取，整理到第一个影视库目录，也可为单次任务选择其他输出目录。两个目录都必须挂载且允许写入。扫描影视库时始终跳过待刮削目录。

演员头像始终写入 `/app/actor_images`，不会落到任一媒体数据源路径里；扫描时启用“整理文件”会把旧 `actors/` 目录里的 JPG/JPEG 头像移到这里，并删除同番号、同大小且内容完全相同的重复视频文件。如果有缓存、样品图或整理临时目录，可以在忽略路径里填写容器内绝对路径，例如 `/media/jav1/cache`，也可以填写相对扫描根目录的 `cache`。每个路径会作为独立 `scan_root` 记录，后续只重扫其中一个路径时不会清理另一个路径的索引。

影视库转码会在媒体文件所在目录创建临时输出；只有输出有效且实际体积严格小于原文件时才会原子覆盖，否则删除临时输出并保留原片，因此媒体 volume 必须可写。视频编码强制使用经过真实探针验证的 GPU 编码器，不会回退到 CPU。所有转码都要求 ffprobe 可用，以在覆盖前校验源片和临时输出的视频流、时长及原有音轨；“H.265 自适应转码”还会读取每个源文件的编码、实际码率、分辨率、帧率和音频信息并动态计算目标码率。`transcoding.max_concurrent_tasks` 默认是 `2`；请结合 GPU 编码会话上限、内存和磁盘吞吐设置为 1–8，修改后重启容器。

Linux Intel/AMD GPU 必须把 DRM 设备映射进容器：

```yaml
services:
  javjaeger:
    devices:
      - /dev/dri:/dev/dri
```

NVIDIA GPU 需要宿主机安装 NVIDIA Container Toolkit，并在服务中配置 `gpus: all`。容器启动后，`GET /api/movies/transcoding/presets` 的 `gpu_available` 必须为 `true`；仅在 FFmpeg 编码器列表中看到 NVENC/QSV/VAAPI 名称不算可用，应用还会执行一次 320x180 的实际硬件编码探针。

硬性要求：

- 不要把配置文件挂载为只读，例如不要使用 `./config.json:/app/config.json:ro`。
- 如果修改 `JAVJAEGER_CONFIG_PATH`，新路径必须在容器内可写，并且应该持久化。
- 容器内端口固定按 `5000` 使用；反向代理上游指向 `javjaeger:5000`。

### 2. 构建并启动

更新时记录本次源码提交、镜像构建时间和部署时间，再执行构建。时间统一使用 UTC：

```bash
export JAVJAEGER_REVISION="$(git rev-parse HEAD)"
export JAVJAEGER_BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export JAVJAEGER_DEPLOYED_AT="$JAVJAEGER_BUILT_AT"
docker-compose up -d --build
docker-compose ps
docker-compose logs --tail=100 javjaeger
```

`VCS_REF` 和 `BUILD_DATE` 构建参数写入镜像环境变量及 OCI 标签，即使镜像没有 `.git` 目录也能显示实际提交。`JAVJAEGER_DEPLOYED_AT` 由部署环境传入，记录本次更新的时间；普通容器重启不改变该值。重新部署同一镜像时，只更新部署时间。需要在后续 Compose 重建时复用这些值，可将三个公开值保存在部署环境或 `.env`；执行新版本更新时重新填写。

管理界面和影院模式左上角均显示 `git-<短提交号>` 和带 UTC 时区的更新时间，切换模式保持一致，悬停可查看完整提交号及构建时间；`GET /api/system/info` 的 `version` 对象也返回 `revision`、`built_at` 和 `deployed_at`。未提供提交信息且无法读取 Git 时显示“版本未知”，缺少部署时间时显示“更新时间未记录”，不会用容器启动时间代替更新时间。源码运行会从当前 Git 提交读取版本和提交时间，部署时间仍需显式提供。

验收标准：

- `docker-compose ps` 显示服务处于 running/up 状态。
- 日志中没有启动异常、依赖导入异常或配置写入异常。
- 页面和 `/api/system/info` 显示的提交号与目标 Git 提交一致，更新时间与本次部署记录一致。

### 3. 接口验收

在宿主机执行：

```bash
curl -fsS http://127.0.0.1:8000/api/system/settings >/dev/null
curl -fsS -X PUT http://127.0.0.1:8000/api/system/settings \
  -H 'Content-Type: application/json' \
  -d '{"scrapers":{"javbus":{"enabled":true}}}' >/dev/null
curl -fsS -X POST http://127.0.0.1:8000/api/movies/metadata-scrapers/test \
  -H 'Content-Type: application/json' \
  -d '{"providers":["javbus"],"concurrent":1}' >/dev/null
```

验收标准：

- 三条命令都返回成功。
- 如果第二条返回 `config_save_failed`，优先检查 `JAVJAEGER_CONFIG_PATH` 和 `./data` 写权限。
- 如果第三条失败但保存成功，检查服务器到外部站点的网络、代理或 DNS。

### 4. 页面验收

1. 打开 `http://<host>:8000/`。
2. 进入设置页，点击“保存”，应提示保存成功。
3. 进入“刮削源”，点击“测试所有源”，应展示每个 provider 的测试结果。
4. 如需按结果启停 provider，点击“按测试结果写回”，再点击“保存”复核配置可写。

### 5. 回滚和排障

回滚到上一版本：

如果目标版本不支持影片库增量恢复，先在当前版本启动并完成索引恢复，等待资料任务结束后停止应用，再备份整个 `data/` 目录并切换版本。不要只复制影片库 JSON 而遗漏 `.updates/`：其中可能包含已保存、尚未合并的逐片资料。恢复仅处理索引，不扫描媒体硬盘；无效增量文件会阻止启动并保留现场。

```bash
git checkout <previous-release-or-commit>
docker-compose up -d --build
```

常用排障命令：

```bash
docker-compose logs --tail=200 javjaeger
docker-compose exec javjaeger sh -lc 'id && ls -ld /app/data && ls -l /app/data/config.json 2>/dev/null || true'
docker-compose exec javjaeger sh -lc 'python - <<PY
from modules.common import runtime
print(runtime.CONFIG_PATH)
PY'
```

如果页面提示保存失败，先看接口响应或日志里的 `config_save_failed`，它会给出实际写入路径和系统错误原因。

## 快速开始

### 1. 准备配置

最少需要确认两类配置：

- `APP_SESSION_SECRET`
- 可选：`JAVBUS_BASE_URL` / `JAVBUS_PROXY`

当前 `docker-compose.yml` 已提供示例：

```yaml
environment:
  - APP_SESSION_SECRET=change-this-session-secret
  - JAVJAEGER_CONFIG_PATH=/app/data/config.json
  # - JAVBUS_BASE_URL=https://www.javbus.com
  # - JAVBUS_PROXY=http://127.0.0.1:7890
  # - JAVBUS_REQUEST_INTERVAL_SECONDS=0.5
```

说明：

- `APP_SESSION_SECRET` 用于覆盖 `config.json` 中的 `session_secret`
- `JAVBUS_BASE_URL` 用于覆盖内置 provider 的 JavBus 原站地址
- `JAVBUS_PROXY` 用于配置访问 JavBus 的代理
- `JAVBUS_REQUEST_INTERVAL_SECONDS` 用于覆盖 JavBus 请求间隔；`0` 表示关闭限速
- `JAVJAEGER_CONFIG_PATH` 用于指定可写配置文件；Docker 默认建议放在已持久化的 `/app/data/config.json`
- 生产环境不要使用默认或弱会话密钥

### 2. 可选挂载 config.json

如果你希望容器直接使用本地配置文件中的 WebDAV、Aria2、PikPak 默认配置，并且仍然允许设置页保存，请把配置文件放在持久化且可写的 `data/` 目录中：

```yaml
environment:
  - JAVJAEGER_CONFIG_PATH=/app/data/config.json
volumes:
  - ./data:/app/data
```

推荐把以下内容写进 `data/config.json`：

```json
{
  "session_secret": "replace-this-in-production",
  "javbus": {
    "base_url": "https://www.javbus.com",
    "timeout_seconds": 8,
    "proxy": "",
    "request_interval_seconds": 0.5,
    "image_retry_attempts": 3,
    "image_retry_backoff_seconds": 0.25
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
  },
  "pan115": {
    "enabled": true,
    "cookie": "UID=...;CID=...;SEID=...;KID=...",
    "save_dir_id": "0",
    "login_app": "wechatmini",
    "batch_size": 20,
    "batch_interval_seconds": 25.0,
    "jitter_seconds": 5.0,
    "failure_backoff_seconds": [120.0, 600.0]
  },
  "local_library": {
    "source_directory": "/media/inbox",
    "directories": ["/media/jav1", "/media/jav2"],
    "ignored_paths": ["cache", "/media/jav1/sample"],
    "actor_image_directory": "/app/actor_images"
  },
  "transcoding": {
    "max_concurrent_tasks": 2
  }
}
```

注意：

- 环境变量优先级高于 `config.json`
- 前端不会收到密码或 secret，只会收到脱敏默认值
- 只有对应模块设置了 `enabled: true`，页面才会显示“使用配置连接/登录”
- 媒体目录配置由 `local_library.source_directory`、`local_library.directories` 和 `local_library.ignored_paths` 保存，页面保存时会写入同一个可写配置文件；旧配置保留原影视库目录，待刮削目录需由用户补选
- 演员头像目录由 `JAVJAEGER_ACTOR_IMAGE_DIR` 覆盖；Docker 推荐单独挂载 `./actor_images:/app/actor_images`
- 不要把 `/app/config.json` 以 `:ro` 方式挂载后再使用设置页保存；只读配置会导致 `/api/system/settings` 返回 `config_save_failed`

### 3. 构建并启动

先按上方部署 SOP 的“构建并启动”步骤设置版本和时间变量，再运行：

```bash
docker-compose up -d --build
```

常用命令：

```bash
# 查看实时日志
docker-compose logs -f javjaeger

# 查看最近 100 行日志
docker-compose logs --tail=100 javjaeger

# 停止服务
docker-compose down

# 重新构建
docker-compose build --no-cache
docker-compose up -d
```

### 4. 访问应用

默认地址：

- [http://localhost:8000](http://localhost:8000)

## 当前 compose 配置说明

当前仓库中的 `docker-compose.yml` 约定如下：

```yaml
ports:
  - "8000:5000"
```

含义：

- 容器内应用始终监听 `5000`
- 宿主机通过 `8000` 访问

如需修改外部访问端口，只改左侧宿主机端口即可：

```yaml
ports:
  - "9000:5000"
```

## 数据持久化

当前下载历史保存在：

- `/app/data/downloaded_movies.json`
- `/app/actor_images` 保存演员头像，独立于 `/media/jav*` 等媒体数据源挂载

compose 中已经做了持久化挂载：

```yaml
volumes:
  - ./data:/app/data
  - ./actor_images:/app/actor_images
```

这意味着：

- 容器重启不会丢失下载历史
- 备份时优先保留 `data/` 和 `actor_images/`

## 关于前端构建

当前 Dockerfile 已升级为多阶段构建：

- 第一阶段使用 Node 执行 `npm ci` 和 `npm run build:frontend`
- 第二阶段安装 `ffmpeg`、VAAPI 驱动和 GPU 诊断工具，并使用 Python 运行 FastAPI 应用

这意味着：

- 构建镜像时会自动生成并复制 `static/app.js` 和 `static/app.css`；当前直接打包 `frontend/src/design/JavJaeger.dc.html`、`support.js`、`_ds` 样式和 logo，运行时无需 Claude Design 认证
- 容器内自带 `ffprobe`，本地刮削可以比较冲突视频的分辨率和码率
- 容器内自带 `ffmpeg`、Mesa/Intel VAAPI 驱动、`vainfo` 和 `lspci`；影视库会自动识别 GPU，只使用已通过探针的硬件编码器，并且只用更小的有效输出安全覆盖源文件
- 即使宿主机没有提前执行 `npm run build:frontend`，容器镜像也能完成前端打包
- 如果你修改了 `frontend/src/`，重新执行 `docker-compose up -d --build` 即可

## 反向代理说明

如果你使用仓库内的 `nginx.conf`，请注意当前上游配置已经匹配容器端口：

```nginx
upstream javjaeger_backend {
    server javjaeger:5000;
}
```

这与 Dockerfile 的默认启动命令一致：

```bash
uvicorn main:app --host 0.0.0.0 --port ${PORT:-5000}
```

## 生产环境建议

- 使用单独的 `.env` 或密钥管理方式维护 `APP_SESSION_SECRET`
- 不要把真实凭据直接提交到仓库中的 `config.json`
- 如果使用 `config.json` 挂载，建议通过部署环境注入该文件
- 反向代理层应限制访问来源，并开启 HTTPS
- 定期备份 `data/`

## 常见问题

### Q: 容器启动了，但反向代理访问 502？

A: 检查 Nginx 上游是否指向 `javjaeger:5000`，不要写成 `8000`。`8000` 是宿主机映射端口，不是容器内服务端口。

### Q: 为什么页面里没有“使用配置连接/登录”按钮？

A: 检查 `config.json` 中对应模块是否同时满足：

- `enabled: true`
- 必要字段已填写

例如：

- `webdav` 需要至少有 `url`
- `aria2` 需要至少有 `url`
- `pikpak` 需要有 `username` 和 `password`
- `pan115` 支持页面扫码登录；也可以配置 `cookie`、`save_dir_id`、`login_app`、`batch_size`、`batch_interval_seconds`、`jitter_seconds` 和 `failure_backoff_seconds`

### Q: 我修改了前端代码，为什么容器里页面没变化？

A: 按部署 SOP 更新版本和时间变量，再在宿主机执行：

```bash
docker-compose up -d --build
```

因为当前镜像会在构建阶段自动执行前端打包，关键是要重新构建镜像。

### Q: 是否必须挂载 config.json？

A: 不是。你也可以：

- 只使用环境变量配置内置 JavBus provider 和会话密钥
- 在页面中手动填写 WebDAV / Aria2 / PikPak 信息

但如果希望“打开页面即可使用默认连接/默认登录”，就需要提供 `config.json`。
