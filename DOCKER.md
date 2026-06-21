# Docker 容器化部署指南

## 概览

当前 Docker 运行方式有两个关键点：

- 应用容器内部监听 `5000` 端口
- 宿主机默认映射为 `8000:5000`

如果你使用仓库中的 `nginx.conf` 作为反向代理，上游后端也必须指向 `javjaeger:5000`。这一点已经与当前配置对齐。

## 快速开始

### 1. 准备配置

最少需要确认两类配置：

- `APP_SESSION_SECRET`
- 可选：`JAVBUS_BASE_URL` / `JAVBUS_PROXY`

当前 `docker-compose.yml` 已提供示例：

```yaml
environment:
  - APP_SESSION_SECRET=change-this-session-secret
  # - JAVBUS_BASE_URL=https://www.javbus.com
  # - JAVBUS_PROXY=http://127.0.0.1:7890
  # - JAVBUS_REQUEST_INTERVAL_SECONDS=0.5
```

说明：

- `APP_SESSION_SECRET` 用于覆盖 `config.json` 中的 `session_secret`
- `JAVBUS_BASE_URL` 用于覆盖内置 provider 的 JavBus 原站地址
- `JAVBUS_PROXY` 用于配置访问 JavBus 的代理
- `JAVBUS_REQUEST_INTERVAL_SECONDS` 用于覆盖 JavBus 请求间隔；`0` 表示关闭限速
- 生产环境不要使用默认或弱会话密钥

### 2. 可选挂载 config.json

如果你希望容器直接使用本地配置文件中的 WebDAV、Aria2、PikPak 默认配置，可以先复制 `config.example.json` 为 `config.json`，再在 `docker-compose.yml` 中打开只读挂载：

```yaml
volumes:
  - ./data:/app/data
  - ./config.json:/app/config.json:ro
```

推荐把以下内容写进 `config.json`：

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
    "access_token": "your-115-open-access-token",
    "refresh_token": "your-115-open-refresh-token",
    "save_dir_id": "0"
  }
}
```

注意：

- 环境变量优先级高于 `config.json`
- 前端不会收到密码或 secret，只会收到脱敏默认值
- 只有对应模块设置了 `enabled: true`，页面才会显示“使用配置连接/登录”

### 3. 构建并启动

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

compose 中已经做了持久化挂载：

```yaml
volumes:
  - ./data:/app/data
```

这意味着：

- 容器重启不会丢失下载历史
- 备份时优先保留 `data/`

## 关于前端构建

当前 Dockerfile 已升级为多阶段构建：

- 第一阶段使用 Node 执行 `npm ci` 和 `npm run build:frontend`
- 第二阶段安装 `ffmpeg` 并使用 Python 运行 FastAPI 应用

这意味着：

- 构建镜像时会自动生成 `static/app.js`
- 容器内自带 `ffprobe`，本地刮削可以比较冲突视频的分辨率和码率
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
- `pan115` 需要有 `access_token`；`refresh_token` 用于过期后自动刷新

### Q: 我修改了前端代码，为什么容器里页面没变化？

A: 先在宿主机执行：

```bash
docker-compose up -d --build
```

因为当前镜像会在构建阶段自动执行前端打包，关键是要重新构建镜像。

### Q: 是否必须挂载 config.json？

A: 不是。你也可以：

- 只使用环境变量配置内置 JavBus provider 和会话密钥
- 在页面中手动填写 WebDAV / Aria2 / PikPak 信息

但如果希望“打开页面即可使用默认连接/默认登录”，就需要提供 `config.json`。
