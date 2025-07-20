# JAV猎人

基于 JavBus API 的影片信息查询和筛选工具，支持 Docker 容器化部署。

## 功能特点

- 🔍 **影片搜索**: 番号快速查询
- 🎯 **多条件筛选**: 演员、类别、导演等筛选
- 📥 **PikPak集成**: 磁力链接云盘下载
- 📝 **下载记录**: 自动记录，避免重复
- ⚡ **性能优化**: 批量API，内存缓存
- 🐳 **容器化**: Docker 一键部署

## 快速部署

### 前置要求
- Docker 20.10+
- Docker Compose 2.0+

### 启动服务
```bash
# 克隆项目
git clone <项目仓库地址>
cd JavJaeger

# 启动服务
docker-compose up -d

# 查看状态
docker-compose ps
```

### 访问地址
- 主应用: http://localhost
- 直接访问: http://localhost:8000

## 配置说明

### API配置
编辑 `config.json` 配置 JavBus API 地址：
```json
{
  "javbus_api": {
    "base_url": "http://10.0.0.10:3000"
  }
}
```

### 环境变量（推荐）
```yaml
environment:
  - JAVBUS_API_BASE_URL=http://your-api-server:3000
```

## 服务管理

```bash
# 基本操作
docker-compose up -d        # 启动
docker-compose down         # 停止
docker-compose restart      # 重启
docker-compose ps           # 状态
docker-compose logs -f      # 日志

# 维护操作
docker-compose build --no-cache  # 重建
docker system prune -f           # 清理
```

## 架构说明

### 服务组件
- **javjaeger**: FastAPI 主应用
- **nginx**: 反向代理

### 端口映射
- `80`: Nginx HTTP
- `8000`: 应用直接访问

## 故障排除

### 常见问题
1. **端口冲突**: 修改 docker-compose.yml 端口映射
2. **API连接失败**: 检查 config.json 中的 API 地址
3. **权限问题**: 确保静态文件目录权限正确

### 调试命令
```bash
# 查看日志
docker-compose logs -f javjaeger

# 进入容器
docker-compose exec javjaeger bash

# 健康检查
curl http://localhost:8000/
```

## 技术栈

- **后端**: Python (FastAPI)
- **前端**: HTML/CSS/JavaScript
- **容器**: Docker, Docker Compose
- **代理**: Nginx

## 开发环境

```bash
# 本地开发
pip install -r requirements.txt
uvicorn main:app --reload
```

## 许可证

MIT License

## 相关链接

- [JavBus API](https://github.com/ovnrain/javbus-api)
- [FastAPI](https://fastapi.tiangolo.com/)

---

**注意**: 仅供学习研究使用，请遵守相关法律法规。