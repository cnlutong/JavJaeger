# JAV猎人

## 项目简介

这是一个用于查询和筛选 JavBus 影片信息的 Web UI 项目。通过该项目，用户可以方便地搜索影片番号、按演员、类别、导演等多种条件筛选影片列表。
信息来源依赖Javbus API(https://github.com/ovnrain/javbus-api)

## 功能特点

- **影片搜索**: 支持通过影片番号快速查找影片信息。
- **多条件筛选**: 可以根据演员、类别、导演、制作商、发行商、系列等多种条件筛选影片列表。
- **简洁易用的界面**: 提供直观的 Web 界面，方便用户操作。

## 技术栈

- **后端**: Python (FastAPI)
- **前端**: HTML, CSS, JavaScript
- **依赖管理**: pip (requirements.txt)

## 安装与运行

1. **克隆项目**: 

   ```bash
   git clone <项目仓库地址>
   cd JavJaeger
   ```

2. **创建并激活虚拟环境** (推荐):

   ```bash
   # Windows
   python -m venv venv
   .\venv\Scripts\activate

   # macOS/Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **安装依赖**: 

   ```bash
   pip install -r requirements.txt
   ```

4. **运行项目**: 

   ```bash
   uvicorn main:app --reload
   ```

项目将在本地启动，通常可以在 `http://127.0.0.1:8000` 访问。

## 使用说明

- 在搜索框输入影片番号，点击搜索按钮即可查询影片信息。
- 在筛选区域选择筛选类型，输入关键词，点击筛选按钮即可按条件过滤影片列表。

## 贡献

欢迎贡献代码、提出建议或报告问题。请通过 Pull Request 或 Issue 的方式进行。

## 许可证

本项目采用 [MIT] 许可协议。