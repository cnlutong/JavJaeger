# JavJaeger TV

原生 Android TV 客户端，通过现有 JavJaeger HTTP API 浏览和播放服务器影视库。支持 Android 6.0（API 23）及以上的 Android TV，使用遥控器方向键、确认键与返回键操作。

编译好的 v0.2.0 测试版 APK 可从 [GitHub Releases](https://github.com/cnlutong/JavJaeger/releases/tag/android-tv-v0.2.0) 下载。该版本使用调试签名，适合自用安装和测试；下载后按下方步骤连接现有服务器。

## 使用

1. 在服务器的管理网页中配置媒体目录，扫描影视库并补全封面和资料。
2. 在电视安装 APK，从电视应用列表打开 **JavJaeger TV**。
3. 输入电视可访问的服务器地址，例如 `http://192.168.1.100:8000`，选择“连接服务器”。不要填写电视自身的 `localhost`、服务器文件路径或网盘地址。
4. 浏览海报，按标题、番号或演员搜索。打开详情后选择文件播放；已标记缺失的文件不可选择，多段影片自动顺序播放后续可用文件。

影院与网页版使用相同的暗色、青色强调色和内容层级，提供“推荐、全部影片、标签、演员、VR”导航。推荐页包含精选影片及最近入库、高清收藏和 VR 横排；演员目录可进入个人影片墙，VR 按分辨率分区。

标签页替代原来的系列入口，展示影视库中的实际标签和影片数量，支持搜索、分页和多选。“匹配任一标签”取所选标签的并集，“匹配全部标签”只显示同时包含所有所选标签的影片。结果页可继续组合演员、制作商、分辨率和标签条件，按入库时间、发行日期、体积或番号排序，并逐项移除条件或清空。详情中的演员与标签也可直接进入对应筛选结果。

播放器支持遥控器暂停、继续、进度条定位、切换播放文件和停止播放。返回详情或浏览页保留查询、筛选和浏览位置。“管理界面”和“在影视库中管理”通过电视的系统浏览器打开服务器管理页；电视没有浏览器时，界面显示可在其他设备访问的地址。通过“更换服务器”可连接其他 JavJaeger 服务。

客户端仅保存不含账号、查询参数或片段的服务器地址。它沿用服务器的私有网络访问边界，没有独立认证；带登录的反向代理需要另行适配。地址可使用 HTTP 或 HTTPS，HTTPS 使用系统证书校验。列表、封面与播放地址固定使用同一个服务器，不接收任意服务器本地路径。

视频直接播放原文件，编码与内封音轨、字幕支持取决于电视。当前没有实时转码、外挂字幕加载或跨设备观看进度；不支持的编码可先在服务器管理网页完成转码。

## 构建 APK

需要 JDK 21、Android SDK 与网络连接。SDK 路径通过 `ANDROID_HOME` 或本机 `local.properties` 的 `sdk.dir` 指定，SDK 平台版本以 `app/build.gradle` 的 `compileSdk` 为准。Gradle Wrapper 会下载固定版本的构建工具和依赖。

在仓库根目录执行：

```bash
cd android-tv
./gradlew testDebugUnitTest lintDebug assembleDebug
```

成功后生成 `app/build/outputs/apk/debug/app-debug.apk`。该 APK 使用调试签名，适合自用安装和测试；正式分发时需要自行配置稳定的发布签名。

启用电视的开发者选项与 ADB 后，安装 APK：

```bash
adb -s <电视序列号> install -r app/build/outputs/apk/debug/app-debug.apk
```

也可以把 APK 复制到电视，通过电视的文件管理器安装。电视端不需要配置下载器、网盘账号或媒体挂载。

## 隔离工作流回归

启动一个一次性 Android TV 模拟器后，在仓库根目录执行：

```bash
python3 tests/android_tv_smoke.py --serial emulator-5556 --apk android-tv/app/build/outputs/apk/debug/app-debug.apk
```

脚本只接受模拟器，会清空模拟器中 JavJaeger TV 的应用数据。它启动临时 HTTP 服务，用合成影片和已保存的测试视频验证连接、标签组合、演员和 VR 浏览、分页、搜索、遥控器导航、缺失分段跳过、播放及返回，不访问真实服务器、账号或媒体库。运行时不需要 FFmpeg；测试 MP4 是预先生成的纯色无声视频。

默认将请求记录、界面树与截图保存在 `/tmp/javjaeger-tv-smoke/`。单元测试另外验证筛选、排序、分页、元数据解析、服务器地址校验、固定播放地址、错误脱敏及网络响应大小限制。

## 源码边界

`app/src/main/java/com/javjaeger/tv/` 负责原生界面、HTTP 数据读取和 Media3 播放。客户端只调用已有的 `/api/movies/local-library` 列表、演员、详情、封面、播放接口，`/api/system/info` 部署信息及 `/api/image-proxy` 图片代理，不复制 Python 服务或网页运行时。服务端和浏览器 bundle 继续按仓库原有流程构建。
