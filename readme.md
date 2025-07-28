<div align="center">

# JavJaeger

<img src="static/logo.jpg" alt="JavJaeger Logo" width="150" height="150">

**基于 JavBus API 的影片信息查询和筛选工具**

*"人类的一切痛苦，都是因为性欲得不到满足"*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.95+-green.svg)](https://fastapi.tiangolo.com/)

</div>

---

## ✨ 核心功能

<table>
<tr>
<td width="50%">

🔍 **批量下载**
> 根据刷选条件，批量搜索影片并添加在网盘下载

🎯 **智能筛选** 
> 演员、类别、导演等多维度筛选

🧲 **磁力查询**
> 获取影片磁力链接，支持排序

</td>
<td width="50%">

📥 **支持PikPak**
> 一键云盘下载，批量处理

⚡ **性能优化**
> 支持内存缓存

🎨 **现代界面**
> 响应式设计，用户友好

</td>
</tr>
</table>

## 🚀 快速开始

### 🐳 Docker 部署（推荐）

```bash
# 1️⃣ 克隆项目
git clone <项目地址>
cd JavJaeger

# 2️⃣ 启动服务
docker-compose up -d

# 3️⃣ 访问应用
# 🔗 http://localhost:18000 (直接访问)
```

### 💻 直接启动

```bash
# 1️⃣ 安装依赖
pip install -r requirements.txt

# 2️⃣ 启动应用
uvicorn main:app --reload

# 3️⃣ 访问应用
# 🔗 http://localhost:8000
```

## ⚙️ 配置说明

### 📡 API 配置

修改 `config.json` 中的 JavBus API 地址：

```json
{
  "javbus_api": {
    "base_url": "http://your-api-server:3000"
  }
}
```

## 📖 使用指南

| 功能 | 描述 | 操作 |
|------|------|------|
| 🎬 **影片搜索** | 输入番号快速查找 | 在搜索框输入番号 |
| 🎯 **筛选功能** | 按演员、类别等条件筛选 | 选择筛选条件并输入值 |
| 🧲 **磁力查询** | 获取影片下载链接 | 输入番号查询磁力链接 |
| 📥 **PikPak下载** | 登录后一键下载到云盘 | 登录PikPak后批量下载 |

### 🚀 推荐配套工具

为了实现更高效的下载体验，推荐配合使用 [**W2A (WebDAV To Aria2)**](https://github.com/cnlutong/W2A) 工具：

- 🌐 **WebDAV网盘支持** - 特别支持PikPak等WebDAV协议网盘
- ⬇️ **Aria2多线程下载** - 批量添加到Aria2进行高速多线程下载  
- 🎯 **完美配合** - JavJaeger负责搜索筛选，W2A负责高效下载
- 📁 **批量管理** - 支持文件夹批量选择和下载管理

## 🛠️ 技术栈

<div align="center">

| 类别 | 技术 |
|------|------|
| **后端** | FastAPI + Python |
| **前端** | HTML/CSS/JavaScript |
| **部署** | Docker + Nginx |
| **API** | JavBus API |
| **下载** | PikPak API |

</div>

## ❓ 常见问题

<details>
<summary><strong>Q: 端口被占用怎么办？</strong></summary>

A: 修改 `docker-compose.yml` 中的端口映射：
```yaml
ports:
  - "18000:8000" 
```
</details>

<details>
<summary><strong>Q: API 连接失败？</strong></summary>

A: 检查 `config.json` 中的 API 地址是否正确，确保 JavBus API 服务正常运行
</details>

<details>
<summary><strong>Q: 如何查看日志？</strong></summary>

A: 使用以下命令查看日志：
```bash
docker-compose logs -f javjaeger
```
</details>

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源协议

---

<div align="center">

⚠️ **免责声明**

本项目仅供学习研究使用，请遵守相关法律法规

**如果这个项目对你有帮助，请给个 ⭐ Star！**

</div>