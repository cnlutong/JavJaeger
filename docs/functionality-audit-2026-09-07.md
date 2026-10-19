# JavJaeger 功能闭环审查 · 2026-09-07

> 历史审计记录：文中的 Windows 路径和命令保留当时环境。当前开发步骤见 [Mac 开发与测试](../readme.md#mac-开发与测试)。

**修复进度：F01–F19 与 G01–G03 的代码修复和回归已完成，最终全套验证结果见文末。** 下方原始审查保留问题触发条件和历史基线；它不代表修复后的当前状态。第三方账号、外站访问和真实 GPU 编码仍需部署环境联调。

**原始审查结论（修复前）：当时不能认定每项功能都已闭环、真实可用。** 实际前端已经连接了大量真实 API，并非纯展示原型；但文件清洗、刮削覆盖、批量派发、默认自动任务以及失败恢复存在可重复的逻辑断点。

本次整理为 **19 组确认问题：7 组 P1、12 组 P2**。其中 18 组使用真实生产函数和隔离样本复现，F18 为静态调用链确认。另外单列未充分验证的安全与进度缺口，不把它们混算为已复现故障。

审查基线为 `b4a0724` 及审查结束时的工作树。审查期间工作区有其他变更，最终按最新源码重新运行了测试与主要复现。本次仅新增此报告，未修改业务源码、现有测试、生成 bundle 或实际媒体。

**审查方法与证据边界**

- 从 `frontend/src/main.jsx` 出发，检查原始设计模板、`integration.mjs` 和 `template.mjs` 的最终组合；沿实际 handler 追踪请求、router、service、持久化及结果呈现。
- 实际入口是 `JavJaeger.dc.html → adaptTemplate/adaptDesignScript → connectDesign`。`frontend/src/App.jsx` 及旧 `components/*Page.jsx` 不在当前入口依赖图中，不能凭旧页面实现判断功能可用。
- 没有启动应用 UI，没有运行 `npm run test:browser`，没有登录真实网盘账号或提交真实下载、转码、刮削任务。
- 网络、持久化服务和故障由 fake/mock 隔离；删除与覆盖复现只操作 `tempfile.TemporaryDirectory` 中的样本。后端真实返回值也交给实际前端适配器消费，避免前后端各自 mock 出一个“成功契约”。
- “链路已接通”仅表示代码路径和现有 harness 支持该结论。第三方站点反爬、账号权限、磁力实际可下载性、GPU 驱动和浏览器媒体解码，没有据此宣称已实机验收。

**验证结果**

| 检查 | 结果 |
| --- | --- |
| `npm run test:frontend` | 140 passed，0 failed |
| `.venv\Scripts\python.exe -m pytest -o addopts='' -q` | 173 passed，4 个 `on_event` 弃用警告 |
| Python AST 语法检查 | `main.py` 与 `modules/**/*.py` 共 46 个文件通过 |
| 使用项目 esbuild 参数构建实际前端入口 | 成功；输出到系统临时目录，未覆盖 `static/app.js` / `static/app.css` |
| HTML shell | 仍引用 `/static/app.js` 与 `/static/app.css` |
| 应用导入与路由顺序 | 现有 harness 通过；具体 router 注册在 proxy catch-all 前 |
| 浏览器及第三方实机操作 | 按要求未执行 |

**全部页面与主要功能矩阵**

下表按当前页面覆盖用户操作及其共用后端能力。“有断点”不等于该页面所有操作均不可用；编号可定位到后面的具体触发条件。

| 页面 / 功能 | 实际调用链 | 判断 |
| --- | --- | --- |
| 检索：番号详情 | `runSearch → GET /api/movies/{id} → movies.service → javbus_api` | 请求链已接通；详情字段显示有 F15，外站内容有效性有 F11 |
| 检索：条件组合、演员人数、VR、字幕、分页 / 全量 | `runSearch → /api/movies[/all] → 列表与详情过滤` | 有真实查询、过滤与分页实现；不能以此证明上游网站当日可访问 |
| 检索：HTML 识别 | `/api/movies/recognize → workflows → 番号识别、详情`，前端随后加载磁力 | 主链已接通；受共用字段、磁力与上游问题影响 |
| 检索：三种磁力源、排序与选中磁力 | `/api/magnets/{id} → magnets.service → JavBus / Cilisousuo / YHG007` | 三源有实现；F10、F15 |
| 检索：选中资源直接派发 | `getMagnets` 附加 `movie_id/source → confirmDispatch → 下载器` | 已有磁力的派发分支可到达下载器；失败闭环受 F08、F09 影响 |
| 检索：自动派发开关 | 查询及磁力加载完成后调用 `confirmDispatch` | 接真实派发确认流程；并非独立自动任务引擎 |
| 下载派发：当前页、已选影片、手工番号 | `vDispatch → confirmDispatch → download-by-codes` | **F05，查询后无法进入下载器派发** |
| 下载派发：PikPak | `/api/pikpak/download → 登录、去重、offline_download、历史` | 成功分支有实现；F08，失败项无法正常重试 |
| 下载派发：115 离线下载 | `/api/115/download → 分批、退避、提交、历史` | 有真实实现；F09，部分成功无法可靠保留 |
| 下载派发：Aria2 磁力 | `/api/aria2/download-magnets → session client → 历史` | 已有磁力时链路已接通；连接地址受 F13 限制 |
| 下载派发：历史、已入库核对、清空 | `/api/history`、`/api/history/check-local-library → history.service` | 已有真实持久化与本地库核对；历史是资源尝试账本，不是远程下载完成证明 |
| 下载派发：历史重新派发、失败筛选 / 重试 | 历史选择资源或按番号重新查磁力 | 有显式历史资源可派发；无资源回查受 F05 影响，失败展示 / 恢复受 F08 影响 |
| 影视库：目录与忽略项配置 | `/api/movies/local-library/settings → runtime 配置` | 读写链已接通 |
| 影视库：扫描与后台任务恢复 | `/scan/jobs → LocalScrapeTaskManager → local_library → history 本地库` | 成功路径接通；部分目录失败时有 F16 |
| 影视库：列表、搜索筛选、详情、文件索引 | `/local-library` 及详情 API → 本地库 summary / 文件记录 | 有真实索引与分页适配；扫描结果不等同于外部下载完成状态 |
| 影视库：海报、缩略图、演员头像与演员影片 | 图片与演员 API → 本地资产索引 | 有实际资产定位与响应路径 |
| 影视库：资料检查与补全 | `/information/check`、`/information/download → local_library / local_scrape` | 主链接通；上游选择受 F11、F18 影响 |
| 影视库：移除记录 / 永久删除媒体 | `DELETE /local-library/{id}` / `/{id}/files` | 两种语义分开；永久删除有 scan_root 边界与相关测试 |
| 影视库：清洗无效媒体 | `/clean-invalid → ffprobe → unlink` | **F01，探测失败可能误删正常文件** |
| 影院：片墙、演员、系列、筛选与排序 | 当前本地库数据 → `vCinema` 派生视图 | 使用真实本地库数据；不以原始设计中的 mock 数据判断 |
| 影院：本地播放、多文件选择、后续播放 | `/local-library/{id}/play?file_index=... → FileResponse → video` | 文件定位和播放 URL 已接通；浏览器编码 / 声轨支持未实机验证 |
| 影院：不支持播放时转码入口 | 当前本地影片 / 文件 → 转码任务 API | 接真实硬件转码流程 |
| 刮削：目录选择、命名模板、编号修正 | 前端路径浏览器与模板工具 → preview API | 有真实路径和模板计算；执行子集有 F07 |
| 刮削：多源匹配、切源回退、源测试 | `metadata_scrapers → 各 provider fetcher` | 实现存在；F11、F18，不能把 HTTP 200 直接算资料有效 |
| 刮削：预览、冲突比较、保留源 / 目标、跳过 | preview rows → `pathEdits/scSkip → apply items` | **F03、F07，确认语义与执行不一致** |
| 刮削：移动视频和字幕 | `apply_local_scrape → _move_file` | **F02，失败时会丢失原目标** |
| 刮削：只写资料、NFO、海报、样图、头像 | `organize=false` 或整理后调用资源写入函数 | 有实际写入实现；F19，关闭覆盖不能保护已有 NFO |
| 刮削：执行结果、局部失败、入库 | 后台 job → results → `loadLibrary` | 执行结果有真实反馈和入库统计；不抵消前述文件安全问题 |
| 自动任务：新建、编辑、复制、删除、节点参数 | `/api/automation/tasks → schema / graph validation → 持久化` | CRUD 与节点配置链已接通 |
| 自动任务：手动 / 定时 / 间隔触发 | 调度器或 `/tasks/{id}/run → _execute_task` | 触发器有实现；默认 JavBus 主工作流有 **F06** |
| 自动任务：检索、选磁力、去重、三下载器分发 | automation 调用现有领域服务 | Cili / YHG 分支有实现；受 F10、F08、F09 等共用缺陷影响 |
| 自动任务：运行记录与停用 | 运行结束记录、任务 `enabled` | 结束记录已接通；运行中进度仍有下文 G02 缺口；停用不取消已经运行的任务 |
| 转码：GPU 检测与预设 | `/transcoding/presets → FFmpeg / 硬件探测` | 有硬件探测和无 GPU 拒绝逻辑，未运行真实 GPU 验收 |
| 转码：专业参数与自适应 H.265 | `resolve_transcoding_options / adaptive analysis` | 自适应计算有 harness；专业参数存在 F17 |
| 转码：队列、并发、取消、重试、清理 | `/transcoding/tasks → TranscodingService` | 有持久化、同源去重、任务控制与相关测试 |
| 转码：仅体积减小时覆盖原片 | 临时输出 → 大小检查 → `os.replace → probe → 更新索引` | 大小与错误保留原片有测试；替换前媒体完整性验证有 G01 缺口 |
| 网盘：WebDAV 连接、目录、文件 / 文件夹选择 | session WebDavClient → PROPFIND / HTTP fallback | 有真实实现；多层服务路径有 F12 |
| 网盘：115 二维码、Cookie 登录、状态 | `/api/115/qrcode/*`、`/cookie`、`/status` | 有 QR 会话和 Cookie 校验实现；真实账号未实测 |
| 网盘：115 目录分页与直链 | `/api/115/files → Pan115Client`，服务端解析 pick_code | 有分页、递归和直链解析实现；真实权限 / 链接时效未实测 |
| 网盘：文件夹递归下载与筛选 | `/api/webdav/download → WebDAV / 115 → session Aria2` | 真实派发链已接通；F12、F13、F14 |
| 网盘：本地文件浏览 | `/api/system/files` | 有真实浏览；前后端明确不把本地文件提交到 Aria2，不算遗漏实现 |
| 网盘：Aria2 状态、列表、暂停、恢复、移除 | `/api/aria2/* → session client` | 操作路径接通；连接格式受 F13 限制 |
| 设置：服务配置、保存、重新载入、连接测试 | `/api/system/settings` 与各连接 API | 大部分配置与敏感字段占位处理已接通；刮削源测试 / 配置有 F04、F18 |
| 设置：主题、短期登录与注销 | theme storage、session storage、连接状态刷新 | 有实际处理；未发现新增浏览器长期密码存储路径 |
| 全局：后台任务、确认框、提示与错误 | active adapter → task/status/response 映射 | 当前工作树已修复活跃转码任务跨页面轮询；隔离复核通过，未列为缺陷 |
| 公共：静态壳、路由顺序、会话隔离 | `main.py`、`templates/index.html`、`session_state.py` | 壳与 bundle 分工正常；具体 API 在 catch-all 前；WebDAV / Aria2 会话隔离有 harness |

**P1：应优先处理的确认问题**

**F01 · 清洗无效媒体会把 ffprobe 超时当成坏文件删除。**

位置：`frontend/src/design/integration.mjs:559`；`modules/movies/local_library.py:554`、`:597`、`:604`；`modules/movies/local_scrape.py:609`。

链路是“清洗按钮 → ffprobe → 没有可读视频信息 → unlink”。`_probe_video_metadata` 在 5 秒超时、系统 I/O 错误、执行失败等情况下均返回空字典，调用者无法区分“确实无视频”和“暂时无法探测”。给 ffprobe 注入 `TimeoutExpired` 后，临时样本被删除，返回 `deleted_file_count=1`。

修复应让探测结果明确区分失败与确认为无效；任何超时 / I/O / 工具错误都保留原片。回归应断言失败样本仍存在，而不仅检查清洗计数。

**F02 · 刮削覆盖目标时先删除旧目标，复制失败没有恢复。**

位置：`modules/movies/local_scrape.py:1177`、`:1185`、`:1191`、`:1583`。

`_move_file` 在覆盖时先 `target.unlink()`，随后尝试 rename；跨盘 rename 失败后才 `copy2`。复现跨盘加磁盘满：源文件还在，旧目标已经不存在，目标旧内容丢失。视频与字幕共用该函数。

最小正确修复位于这个共用函数：先完整复制到目标目录的临时文件、检查成功，再替换目标，最后删除源；不能用先删除目标的方式准备覆盖。

**F03 · “覆盖已有资料”会绕过视频冲突的“保留目标”。**

位置：`frontend/src/design/JavJaeger.dc.html:2345`；`frontend/src/design/integration.mjs:688`；`modules/movies/local_scrape.py:1514`、`:1556`。

界面将 `overwrite_existing` 描述为重写 NFO / 图片；后端却把它用于 `overwrite_target = request.overwrite_existing or keep_side == "source"`，并跳过保护分支。真实 apply 隔离复现：同时设置 `overwrite_existing=True`、`conflict_resolution='keep_target'`，结果成功，旧目标内容被源内容替换，源路径消失。

资料覆盖与媒体冲突必须分开处理。显式“保留目标 / 跳过”应优先执行，不能被资料选项覆盖。

**F04 · 应用刮削源测试结果的 API 会返回已保存的 API key。**

位置：`modules/movies/metadata_scrapers.py:1323`、`:1342`、`:1380`；`modules/movies/router.py:337`；`frontend/src/design/integration.mjs:977`。

`apply_metadata_scraper_test_results` 直接把 `runtime.get_scrapers_config()` 放进响应，包含保存的 `javstash.api_key`。独立 apply API 与 `test` API 的 `apply_results=true` 都会经过该路径。注入假 key 后确认它原样出现在返回对象里；没有使用实际秘密。

复用现有公开设置的脱敏语义，返回状态 / 非敏感配置即可。主设置页 GET 的脱敏不能保护这个独立响应。

**F05 · 下载派发页的批量 / 手工番号入口拿不到磁力，流程在派发前结束。**

位置：`frontend/src/design/integration.mjs:375`、`:385`、`:387`；`modules/movies/workflows.py:162`、`:198`。

前端以 `auto_download:false` 调用 `/api/movies/download-by-codes`，然后读取 `payload.magnet_results`。后端在这个开关为 false 时提前返回 `found_movies`，根本不计算 / 返回磁力。真实后端返回交给真实前端：只发生一次该请求，随后提示“没有可派发的磁力”，没有请求任何下载器。

影响当前页、已选影片、手工番号，以及没有显式磁力的重新查询 / 重试。检索页已有磁力直接派发不走这个失败分支。

应统一一个“仅查询最佳磁力”的契约，优先复用已有批量查询能力。不能简单把开关改成 true：该后端分支自身会尝试 PikPak 下载，可能违背当前所选下载工具。

**F06 · 默认 JavBus 自动任务传入列表摘要后，不再补详情，拿不到磁力且能报告成功。**

位置：`modules/automation/service.py:178`、`:203`、`:212`；`modules/magnets/service.py:668`。

自动任务把发现结果作为 `movie_data` 传入。番号模式只有 `id/title`；列表发现结果同样不含磁力所需的 `gid/uc`。共用选磁力函数只在 `movie_data is None` 时请求详情，有一个不完整字典就不会补全。

隔离执行一个 JavBus 番号任务：找到 1 部、详情请求 0 次、磁力 0 条、跳过 1 部，最后因为 `dispatched_count == magnet_count == 0` 标记 `success`。问题发生在触发后的共用工作流，切换手动 / 定时 / 间隔不能修复。

应在共用选磁力入口检查所需字段是否齐全；无磁力结果的运行状态和原因也应准确区分，避免“成功”掩盖整条发现链未产出。

**F07 · 多文件预览后仅执行部分行，目标名称会被重新计算。**

位置：`modules/movies/local_scrape.py:496`、`:750`；`frontend/src/design/integration.mjs:688`。

预览对同番号的多个同目标文件编号；执行请求只带未跳过的 source/code/metadata，并未绑定已确认的目标方案。后端对这个子集重新编号。复现两文件时第二条预览为 `ABP-123-2.mp4`，只选择它执行时目标变成 `ABP-123.mp4`。

用户确认的路径及冲突对象不再等于执行对象；若该新目标已有文件，会遇到未按原预览确认的冲突。应绑定预览方案，或在选择集合变化时重新预览并确认，不能默默改名。

**P2：功能、失败恢复与配置一致性问题**

**F08 · PikPak 失败项缺少 movie_id，失败重试按钮被禁用。**

位置：`modules/pikpak/service.py:68`、`:84`；`frontend/src/design/integration.mjs:750`。

成功 / 异常派发分支没有稳定返回输入的 `movie_id`，前端用该字段生成失败行和重试。注入下载器失败后，实际响应生成的失败行 `code=''`、`noRetry=true`。即使补上 ID，没有显式资源的重试还会碰到 F05。

同时当前失败列表只在 `dispatchResult` 内存中；下载历史主要保存成功提交的资源，没有从此处写入 `status='failed'`。因此历史“失败”筛选缺少对应数据来源，刷新也不能恢复这些失败项。应先稳定逐项返回契约，再明确失败记录与恢复入口。

**F09 · 115 后续批次抛错时，前面成功提交的批次不会落历史。**

位置：`modules/pan115/service.py:900`、`:956`、`:980`；`modules/pan115/router.py:60`。

保存历史位于所有 chunk 提交之后；后续 chunk 抛出 `Pan115Error` 时直接退出。复现第一批成功、第二批异常：已经尝试 2 批，`save_movies` 调用 0 次。HTTP 错误也不能带回完整的部分成功结果，重试时去重依据缺失。

应逐批保存已经确认成功的提交，或确保异常路径仍返回并保存部分结果；不应将已经产生的外部效果当作整个请求失败而遗忘。

**F10 · Cilisousuo 最佳磁力选择的排除 4K 在所有候选都是 4K 时失效。**

位置：`modules/magnets/service.py:410`。

代码仅在过滤后列表非空时替换原列表；全部被排除时反而继续使用原候选。输入唯一 4K 候选、`exclude_4k=True`，最佳磁力仍返回这条 4K。过滤后的空集应表示没有符合条件的资源。

**F11 · JavBus 返回 HTTP 200 验证页时会阻断其他刮削源回退。**

位置：`modules/javbus_api/parser.py:107`；`modules/movies/metadata_scrapers.py:1306`、`:1432`。

详情 parser 会填入请求的番号，即便 HTML 没有有效影片内容；刮削选择和源测试只检查 metadata 中存在 `id`。用验证页 HTML 经真实 parser，再进入真实多源服务：选中 javbus、title 为空，后续 r18dev 调用 0 次。

应建立最小可用详情校验，而非只看由请求补进去的 ID；无有效详情应继续回退，源测试也应采用同一判断。

**F12 · WebDAV 多层基地址与绝对 href 组合错误。**

位置：`modules/webdav/clients.py:35`、`:49`、`:64`。

`_make_request` 去掉 href 开头的 `/`，同时 base_url 去掉末尾 `/`，导致 `urljoin` 按错误的相对路径拼接。基地址 `https://example.test/dav/root`，目录 href `/dav/root/folder/`，实际请求变成 `https://example.test/dav/dav/root/folder/`。

`_build_download_url` 对相对 href 也受基地址尾斜杠影响。应明确基地址、根相对 href、完整 URL 各自的解析规则；不能以根目录部署测试代替带路径部署测试。

**F13 · Aria2 连接忽略自定义 RPC 路径，并把无显式端口的 HTTPS 地址改成 6800。**

位置：`modules/webdav/clients.py:235`。

传给 aria2p 的只有 host / port；本地安装版本的 Client 会固定追加 `/jsonrpc`。输入 `https://example.test/aria2/jsonrpc`，实际 endpoint 为 `https://example.test:6800/jsonrpc`。这会破坏反向代理路径与 HTTPS 默认端口部署；显式 `http://host:6800/jsonrpc` 的常规格式不受此问题影响。

要么正确支持完整 RPC URL，要么明确验证并限制输入格式；不能保存用户地址后静默连接另一个地址。

**F14 · “最小体积”筛选依赖“仅视频”，与界面的两个独立选项不一致。**

位置：`modules/webdav/router.py:131`、`:312`；`modules/pan115/service.py:796`；`frontend/src/design/JavJaeger.dc.html:1332`。

后端将扩展名与大小判断放在同一个 `if video_filter and (...)` 中。关闭“仅视频”、设置最小 500 MB，文件夹内 1 KB 的样本仍会被 WebDAV 派发，115 也仍会解析该文件直链。当前层前端过滤不能覆盖用户直接选择整个目录的情况。

体积判断应独立于扩展名开关，在文件与递归目录路径中一致执行。

**F15 · 当前设计适配器读错真实响应字段，磁力名称和制作商显示失真。**

位置：`frontend/src/design/integration.mjs:59`、`:312`、`:354`、`:1054`；`modules/javbus_api/parser.py` 的磁力与详情响应构造。

真实磁力响应字段为 `title`，适配器及模板读取 `name`，并未归一化；真实返回交给前端得到 `displayed_name=null`、`最佳 undefined · 1 GB`。JavBus 详情的 `producer` 也没有映射到前端 `studio`，显示 `—`。

应在现有视图适配函数统一字段，而不是在每个页面补显示兜底；测试 fixture 必须使用后端真实字段。

**F16 · 多目录扫描部分失败时，成功入库的数据不刷新到当前页面。**

位置：`modules/movies/local_library.py` 的扫描汇总；`frontend/src/design/integration.mjs:407`。

扫描可以一部分已经落库、一部分失败；整体 job 标记 failed。前端只在成功分支刷新库，failed 分支直接提示并结束。实际适配器消费“1 个成功目录、1 个失败目录”的终态：`loadLibrary` 调用 0 次。应保留成功结果刷新并展示失败明细，不能把局部完成当作没有产生结果。

**F17 · 转码专业参数提供后端必拒选项，留空也不能取消预设高度上限。**

位置：`frontend/src/design/integration.mjs:622`、`:623`；`modules/movies/transcoding.py:200`、`:211`、`:233`。

界面提供 `film/animation/grain/...` tune，后端对所有非空 tune 都拒绝，实测 `tune='film'` 被拒。最大高度标注“留空保持原始”，前端传 null，后端合并时忽略所有 null，实测 `compatible_1080p + max_height=null` 仍得到 1080。

专业字段应按当前硬件能力提供；覆盖参数应区分“没传”和“显式清空”，避免预设悄悄覆盖用户选择。

**F18 · 刮削源 JavBus 的独立配置没有传到客户端，测试明细也读错字段。**

位置：`frontend/src/design/integration.mjs:974`、`:975`；`modules/movies/metadata_scrapers.py:1287`、`:1386`；`modules/javbus_api/client.py`；`modules/common/runtime.py`。

静态调用链确认：界面允许编辑 `scrapers.javbus.base_url/language/request_delay`，其他 provider 会收到自己的 provider_config，而 JavBus 分支只调用全局 `javbus_api_service`，实际使用顶层 JavBus 配置。保存刮削源内部这些字段不改变其请求行为。

此外测试结果后端返回 `duration_ms/error_message`，前端读 `elapsed_ms` 并把 note 固定为空，所以时延与具体失败信息丢失。应统一 JavBus 唯一有效配置来源，并映射测试结果字段。

**F19 · 关闭“覆盖已有资料”仍会重写现有 NFO。**

位置：`modules/movies/local_scrape.py:1195`、`:1262`、`:1614`。

调用 `_write_nfo` 没有传覆盖策略，函数直接写入。隔离执行 `organize=False, overwrite_existing=False, write_nfo=True`，已有 NFO 内容仍被替换。它与图片的覆盖判断不一致，会丢掉用户手工维护的 NFO。写 NFO 前应遵循同一覆盖选项。

**尚需补足的验证与产品闭环，不混作已复现故障**

**G01 · 转码替换前缺少媒体完整性检查。** `modules/movies/transcoding.py:871` 之后仅检查输出存在、非空和更小，在 `:882` 替换源，`:883` 才探测媒体；探测空结果也不阻止标记完成。真实 executor 会检查 FFmpeg 退出码，这是已有保护。但本次没有制造真实 FFmpeg 的截短输出，不能声称已实测转码损坏。对“安全覆盖原片”的产品承诺，仍需在临时文件上验证可读视频流和合理时长，再进行替换。

**G02 · 长任务的“运行中可追踪”未全部接到当前界面。** 115 已有 `/download-jobs`，当前派发仍使用同步 `/download`；自动任务的 `run_task` 要等 `_execute_task` 结束才记录 run，而界面提示可以查看运行进度。应复用已有任务机制、让运行中状态可读，并保留部分结果。这里没有用真实长时间下载测浏览器断线恢复。

**G03 · 当前测试会放过真实契约错误。** 一部分 frontend contract 测试仍读取旧 `components/*Page.jsx` 或旧 CSS 的字符串。实际适配器测试中也有 `name` 磁力 fixture（例如 `tests/frontend/designIntegration.test.mjs:156`），而真实后端返回 `title`。后端单元测试将选磁力函数替换为 mock 时，也不能检出 F06 的跨服务入参问题。测试全绿只说明这些测试预期成立。

不建议为了提高数量补更多字符串断言。优先让真实后端响应进入实际 `connectDesign`，并围绕这些缺陷增加最小回归：失败保留文件、保留目标优先、预览子集路径不变、部分成功落历史、过滤空集不回退、真实字段能显示。

**复现记录**

本次隔离脚本位于审查机器的系统临时目录，后续可能被系统清理；下表保留关键输入与观察结果，使报告不依赖脚本长期存在。

| 场景 | 关键观察 |
| --- | --- |
| 番号查询 `auto_download=false` | `found=1, magnet_results_present=false`；前端未请求下载器 |
| 自动任务 JavBus、一个番号 | `found=1, magnets=0, skipped=1, detail_requests=0, status=success` |
| 清洗时 ffprobe 超时 | `file_preserved=false, deleted=1` |
| 刮削跨盘复制失败 | `source_preserved=true, target_preserved=false` |
| `overwrite_existing=true + keep_target` | `target_preserved=false, source_preserved=false`，apply 报成功 |
| `overwrite_existing=false + write_nfo=true` | 已有 NFO 被覆盖 |
| 两个同番号文件、仅执行第二条 | 预览 `ABP-123-2.mp4`，执行计划 `ABP-123.mp4` |
| Cili 唯一候选为 4K、开启排除 | 仍返回该 4K 候选 |
| 应用测试结果、配置含假 API key | 假 key 出现在响应中 |
| 验证页 HTML 经真实详情 parser | javbus 被选中、title 为空、后备源调用 0 次 |
| WebDAV 多层基路径与根相对 href | `/dav/dav/root/folder/` |
| Aria2 HTTPS 自定义 RPC 路径 | 改为 `:6800/jsonrpc` |
| 115 第一批成功、第二批抛错 | 提交 2 批、历史保存 0 次 |
| PikPak 派发失败 | 真实响应缺少 movie_id，前端重试 disabled |
| 真实磁力和制作商字段 | `最佳 undefined · 1 GB`、制作商 `—` |
| 扫描部分目录失败 | 前端库刷新 0 次 |
| 最小 500 MB、关闭仅视频 | 1 KB 样本仍派发 / 解析直链 |
| 转码专业参数 | film 被拒；null 高度仍保留预设 1080 |
| 最新工作树、非转码页面且已有活跃转码 | 转码轮询 1 次，**此项通过，未列为缺陷** |

核心脚本：`C:\Users\Tong\AppData\Local\Temp\javjaeger-audit-20260907.py`、同名 `.mjs`。从项目根目录先运行 Python 脚本，再运行 Node 脚本；后者消费前者生成的假数据契约 JSON。最小体积与专业转码参数另以隔离内联脚本验证。

**处理顺序**

1. 先保护现有文件和秘密：F01–F04、F07、F19，并补 G01 的替换前校验。
2. 接通批量与默认自动任务：F05、F06；随后解决下载失败的可追踪与重试：F08、F09。
3. 统一过滤、地址、字段和设置契约：F10–F18；补齐 G02 的运行中结果。
4. 对每个修复先加入最小失败回归，再改共用根因。保留能验证真实行为的现有 harness，更新 G03 中与实际入口脱节的覆盖。

以上修改均可从现有职责模块着手，不需要另建一套派发、刮削或任务系统。


## 修复设计与验收 · 2026-09-07

本轮按「用户输入 → 查询/预览 → 确认 → 执行 → 持久化 → 结果展示 → 失败恢复」检查每个问题。文件操作优先保护现有媒体；派发只承诺下载器接收请求；没有新下载、部分失败和全部成功使用不同状态。改动沿既有模块完成，没有新增下载器、任务框架或依赖。

| 编号 | 用户需要及设计取舍 | 已落实的行为 | 回归依据 |
| --- | --- | --- | --- |
| F01 | “清洗无效文件”不能把暂时不可读当成坏片。 | 只删除扫描根范围内的零字节或明确无视频流文件；探测失败、磁盘断开、文件在探测期间变化均保留，并返回原因。 | `test_cleanup_preserves_files_when_probe_is_inconclusive`、`test_cleanup_preserves_changed_or_inaccessible_file_and_still_syncs_index` 与确认无效文件清理契约。 |
| F02 | 覆盖新片失败后，原目标仍必须可用。 | 同盘直接原子替换；跨盘先复制到目标目录的临时文件，检查大小与源文件状态，再替换目标，最后删除源。 | `test_scrape_failed_cross_volume_copy_preserves_both_files` 注入磁盘写满。 |
| F03 | 用户对视频冲突的选择必须高于资料更新选项。 | `overwrite_existing` 不再绕过 `keep_target`、`skip` 或缺失的冲突选择；覆盖视频只由冲突决策授权。 | `test_asset_overwrite_never_overrides_video_conflict_choice` 参数化覆盖三种选择。 |
| F04 | 应用源测试结果只需要配置状态，无需收到秘密。 | 设置查询与应用测试结果共用公开配置序列化，JavStash 仅返回 `has_api_key`。 | `test_scraper_apply_response_uses_the_public_config_contract`。 |
| F05 | 手工番号、批量派发必须从选磁力走到下载器。 | 使用 `/api/movies/batch` 的真实 `results[].best_magnet` 契约；失败/无磁力与本地已有分别呈现，成功项继续提交。 | Python 真实 parser/工作流校验共享 JSON；实际前端 handler 消费同一 JSON；浏览器批量派发。 |
| F06 | 默认 JavBus 自动任务必须完成详情补全，并准确说明是否提交。 | 共用磁力选择器缺 `gid/uc` 时补详情；无新资源返回 `noop`，混合结果返回 `partial`，下载器去重全部跳过也归为无新下载。 | `test_automation_javbus_completes_detail_before_selection`；`test_automation_reports_all_dispatch_skips_as_no_new_download`。 |
| F07 | 用户确认的目标文件名不能因只执行部分行而改变。 | apply 接受预览的 `target_video_path`，保留分片后缀；后端校验同一目标目录与命名规则，拒绝越界路径。 | `test_apply_subset_preserves_preview_destination_and_rejects_outside_path` 与实际前端 apply 载荷测试。 |
| F08 | 失败项要能在刷新后找到，并按原资源、原工具重试。 | 每项保留 movie_id、链接、来源；`failed_resources` 独立持久化且不参与成功链接去重。重试成功移除对应失败；忽略只清除指定失败项，不伪造下载成功。 | `test_failed_dispatch_survives_reload_and_can_retry_the_same_resource`、`test_dismissing_one_failure_preserves_other_history`；前端重试/忽略及真实 115 持久化流程。 |
| F09 | 前批已提交不能因后批失败而丢失记录。 | 每批保存历史，响应保留原输入顺序，未完成项返回明确失败；后台异常保留部分结果并使用公开错误信息。 | `test_115_partial_batches_keep_success_history_and_report_every_input`、`test_pan115_failed_job_returns_retryable_items_without_raw_exception`。 |
| F10 | 排除 4K 后没有合格资源，就应明确无结果。 | 始终使用过滤后的列表，空列表不回退至 4K 候选。 | `test_cilisousuo_excluding_all_4k_results_never_falls_back`。 |
| F11 | 验证页不能冒充资料成功并阻断其他源。 | JavBus parser 验证影片页面结构与标题；多源选择和源测试均要求有效 id、非空标题，不匹配则继续回退。 | 无效页面 parser 与元数据回退回归。 |
| F12 | WebDAV 配置的服务根和服务器 href 应指向同一资源。 | 共用 URL 拼接保留多层基地址，区分根入口、相对 href 和根绝对 href；凭据仍通过请求头传递。 | `test_webdav_keeps_service_root_and_resolves_absolute_and_relative_hrefs`。 |
| F13 | 用户填写的完整 Aria2 RPC 地址必须原样生效。 | 保留自定义路径、显式端口及 HTTP(S) 默认端口；拒绝 URL 内凭据，密钥仍单独提供。 | `test_aria2_preserves_rpc_endpoint` 的三种端点参数。 |
| F14 | “仅视频”和“最小体积”是独立筛选条件。 | WebDAV 单文件、递归目录和 115 解析均独立执行大小过滤，过滤项计为跳过。 | `test_recursive_size_filter_does_not_depend_on_video_only` 及既有派发契约。 |
| F15 | 搜索结果与详情应展示后端真实元数据。 | 磁力 `title` 在适配边界映射为设计需要的 `name`，制作商读取 `producer`，兼容既有字段。 | 共享 fixture 与 `workflow: backend title and producer fields render in the actual design`。 |
| F16 | 扫描部分目录失败后，用户仍要看到已成功导入的文件。 | 终态含结果即刷新库；失败摘要与目录明细保留，扫描状态解除。 | `workflow: failed scan still refreshes successful imports`。 |
| F17 | 专业参数不应提供必然失败的选择；留空应取消可选限制。 | 移除硬件编码不支持的 tune 控件；使用 `exclude_unset` 区分未传与显式 null，允许清空高度等可选上限。 | `test_explicit_empty_transcode_height_clears_the_preset_limit`，既有硬件参数/取消/重试 harness。 |
| F18 | 设置应只有一套有效来源，测试结果要能解释失败。 | JavBus 统一使用顶层配置，刮削源只控制启用；拒绝继续写入旧独立字段，界面说明使用已保存配置，展示 `duration_ms/error_message`。 | 公开设置契约、拒绝无效字段、实际源卡片与浏览器设置测试。 |
| F19 | 关闭覆盖资料必须保护用户已有 NFO。 | NFO 与图片遵守同一覆盖选项；关闭覆盖且文件存在时保留内容。 | NFO 覆盖开关回归及既有刮削资料契约。 |
| G01 | 原片替换前必须证明临时输出足以通过基础完整性检查。 | 先校验视频流、尺寸、合理时长和原有音轨，再检查源未变化、未取消且输出更小，最后原子替换；ffprobe 超时终止子进程。 | `test_transcode_validates_temporary_media_before_replacing_source` 注入有效、损坏、截短输出；转码 harness 保留失败与取消检查。 |
| G02 | 长任务离开页面、刷新和重启时都应有可理解的状态。 | 115 复用 download-jobs 与 sessionStorage 恢复；自动任务支持 HTTP 202 后台启动、阶段进度、同一运行记录更新。服务重启将未结束记录标为中断并停用，要求核对历史后重启任务。 | 后台运行并发保护/进度/单条终态/重启回归，实际前端跨页面轮询及浏览器真实 no-op 运行。 |
| G03 | 前后端不能各自 mock 出不相容的成功结果。 | 以真实 parser 和 batch 工作流验证共享 `dispatch-contract.json`，活动入口 handler 与浏览器消费同一 fixture；更新 title、duration 和状态等过时测试预期。 | 新回归直接执行生产函数；旧组件字符串检查不作为当前页面已闭环的证据。 |

本轮新增测试以故障注入先复现，再修复生产代码。既有转码 fake executor 的样本补齐可验证媒体信息；目录分页测试显式取消大小限制，避免把 1 KB 测试文件误当成实际合格视频。测试默认下载历史隔离到临时目录，新失败持久化分支也不会接触运行中的 `data/`。

**最终验证**

| 检查 | 结果 |
| --- | --- |
| `.venv\Scripts\python.exe -m pytest -o addopts='' -q` | **209 passed**；保留 4 个既有 FastAPI `on_event` 弃用警告 |
| `npm run test:frontend` | **150 passed** |
| `npm run test:browser` | **29 passed**；包含真实隔离后端的设置、资料整理、播放、索引移除、自动任务 no-op、115 失败持久化与忽略 |
| 前端 bundle | 由 `npm run test:browser` 前置构建重新生成 `static/app.js` / `static/app.css` |
| Python 语法、应用导入、路由顺序、HTML shell | 46 个 Python 文件 AST 通过；新增路由均在 proxy catch-all 前；shell 仍引用生成 bundle |
| `git diff --check` | 通过 |

新增后端回归共 36 个参数化用例，实际前端流程回归 9 项，真实 115 失败恢复浏览器流程 1 项。先前整套浏览器运行有 1 次初始化超时，失败快照中应用尚未挂载；同项独立重跑和最终 29 项整套运行均通过。前端仍依赖 CDN 资源，部署环境需要能加载这些资源。

测试使用临时文件、临时配置和 fake 外部服务，不提交真实网盘下载，不对现有媒体做删除或覆盖。真实网盘账号、外站可用性及 GPU 编码未实机联调；临时输出校验是基础完整性保护，并非逐帧质量验证。保留工作区原有的布局和后台指示器改动，未手工修改生成 bundle 或归档源码来实现修复。
