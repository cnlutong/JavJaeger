# W2A, WebDAV To Aria2, WebDAV网盘监控工具

一个简洁高效的WebDAV网盘监控工具，支持浏览WebDAV网盘文件并批量下载到Aria2。

## 功能特性

- 🌐 支持WebDAV协议网盘连接
- 📁 直观的文件浏览界面
- ✅ 批量选择文件和文件夹
- ⬇️ 集成Aria2下载管理器
- 🎨 现代化响应式UI设计
- 🚀 基于FastAPI的高性能后端

## 技术栈

- **后端**: Python + FastAPI
- **前端**: HTML5 + Bootstrap 5 + JavaScript
- **下载器**: Aria2 RPC
- **协议**: WebDAV

## 安装和运行

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动应用

```bash
python main.py
```

应用将在 `http://localhost:8000` 启动。

### 3. 配置Aria2

确保Aria2已安装并启用RPC服务：

```bash
aria2c --enable-rpc --rpc-listen-all --rpc-allow-origin-all
```

## 使用说明

### 1. 连接WebDAV服务器

在主页面填写以下信息：
- **WebDAV URL**: 你的WebDAV服务器地址
- **用户名**: WebDAV账户用户名（可选）
- **密码**: WebDAV账户密码（可选）
- **Aria2 RPC URL**: Aria2 RPC服务地址（默认: http://localhost:6800/jsonrpc）
- **RPC Secret**: Aria2 RPC密钥（可选）

### 2. 浏览文件

连接成功后，你可以：
- 点击文件夹进入子目录
- 使用面包屑导航快速跳转
- 查看文件大小和类型

### 3. 下载文件

支持两种下载方式：
- **单文件下载**: 点击文件行的下载按钮
- **批量下载**: 选择多个文件后点击"下载选中项"

## 项目结构

```
W2A/
├── main.py              # FastAPI主应用
├── webdav_client.py     # WebDAV和Aria2客户端
├── requirements.txt     # Python依赖
├── templates/
│   └── index.html      # 主页模板
└── static/
    ├── style.css       # 样式文件
    └── app.js          # 前端JavaScript
```

## 支持的WebDAV服务器

- Nextcloud
- ownCloud
- Apache mod_dav
- nginx-dav-ext-module
- 其他标准WebDAV实现

## 注意事项

1. 确保WebDAV服务器支持PROPFIND方法
2. 某些服务器可能需要特定的认证方式
3. 大文件下载建议使用Aria2的分段下载功能
4. 请确保Aria2 RPC服务正常运行

## 故障排除

### WebDAV连接失败
- 检查URL格式是否正确
- 验证用户名和密码
- 确认服务器支持WebDAV协议

### Aria2连接失败
- 检查Aria2是否已启动
- 验证RPC地址和端口
- 确认RPC密钥设置正确

### 文件列表为空
- 检查WebDAV服务器权限
- 尝试访问不同的路径
- 查看浏览器开发者工具的网络请求

## 开发

### 本地开发

```bash
# 安装开发依赖
pip install -r requirements.txt

# 启动服务器
uvicorn main:app --reload
```

### API文档

启动应用后访问 `http://localhost:8000/docs` 查看自动生成的API文档。

## 许可证

MIT License
