# Docker 容器化部署指南

## 📦 快速开始

### 1. 配置（必需）

修改 `docker-compose.yml` 中的 JavBus API 地址：

```yaml
environment:
  - JAVBUS_API_BASE_URL=http://your-api-host:port
```

**注意**：
- 服务端口固定为 `8000`，如需修改请编辑端口映射
- 将 `http://10.0.0.20:3000` 替换为你的实际 JavBus API 地址

### 2. 启动服务

```bash
# 构建并启动容器
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 3. 访问应用

启动后，访问：`http://localhost:8000`

## ⚙️ 配置说明

### JavBus API 配置（必需）

直接修改 `docker-compose.yml` 中的 JavBus API 地址：

```yaml
environment:
  - JAVBUS_API_BASE_URL=http://your-api-host:port
```

**注意**：如果容器内存在 `config.json` 文件，环境变量 `JAVBUS_API_BASE_URL` 的优先级更高。

### 端口配置

- 主机端口固定为 **8000**
- 容器内端口固定为 **5000**

如需修改端口，直接编辑 `docker-compose.yml`：

```yaml
ports:
  - "9000:5000"  # 修改左侧的主机端口
```

## 📁 数据持久化

`data/` 目录已通过 volume 挂载，确保下载记录持久化保存：

```yaml
volumes:
  - ./data:/app/data
```

## 🔧 其他配置

### 自定义 config.json

如果需要使用自定义的 `config.json`，可以取消注释 docker-compose.yml 中的配置：

```yaml
volumes:
  - ./config.json:/app/config.json:ro
```

### 查看容器日志

```bash
# 实时查看日志
docker-compose logs -f javjaeger

# 查看最近 100 行日志
docker-compose logs --tail=100 javjaeger
```

### 进入容器调试

```bash
docker-compose exec javjaeger bash
```

## 🚀 生产环境建议

1. **使用环境变量文件**：创建 `.env` 文件管理敏感配置
2. **配置反向代理**：使用 Nginx 作为反向代理（参考项目中的 `nginx.conf`）
3. **数据备份**：定期备份 `data/` 目录
4. **资源限制**：根据需要设置容器的 CPU 和内存限制

示例：

```yaml
services:
  javjaeger:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

## ❓ 常见问题

**Q: 如何修改 JavBus API 地址？**

A: 直接修改 `docker-compose.yml` 中的 `JAVBUS_API_BASE_URL` 值，然后重启容器：
```bash
docker-compose down
docker-compose up -d
```

**Q: 端口被占用怎么办？**

A: 直接修改 `docker-compose.yml` 中的端口映射，将 `8000:5000` 改为其他端口，如 `9000:5000`。

**Q: 如何更新应用？**

A: 重新构建镜像：
```bash
docker-compose build --no-cache
docker-compose up -d
```

