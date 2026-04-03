# Archived W2A Entry

该目录是原 `W2A` 独立项目的归档快照。

现状说明：

- 这里的 `main.py`、`templates/`、`static/` 不再作为当前 `JavJaeger` 的运行入口。
- 当前可维护实现已经合并到主项目中：
  - 后端模块位于 `modules/webdav/`
  - 前端分页位于 `static/webdav_page.js`
- 本目录仅用于保留历史实现、对照旧逻辑和必要时回溯。

维护约定：

- 不要在这里继续开发新功能。
- 不要从这里启动服务或更新依赖。
- 若需调整 WebDAV/Aria2 功能，请修改主项目集成实现，而不是这里的归档代码。
