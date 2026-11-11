## v1.9.18 IME/救援修复

新增 `NativeImePolicy.java`，修复未确认拼音污染正文、失败导出/重试和异常读取流。请先运行 `android/tests/test_native_safety_v1918.py`，有 JDK 时再运行 JVM 测试替身。真正 APK 仍需 SDK 35 编译及实机验证。

## v1.9.17 原生平板审计修复

工程现含原生平板数据安全修复（SDK 35 / Java 17，versionCode 62）。请查阅 `../docs/NATIVE-TABLET-v1.9.17-AUDIT.md`，先完成 `:app:assembleDebug` 和真机备份验证，再考虑用作正式写作。旧版手机 WebView 不变。

# v1.7.1 书籍操作

versionCode 22。书籍操作使用应用内确认，Android 分享调用系统选择面板。

# v1.7.0 设置与回收站

versionCode 21。支持分组设置、可选 AI 快捷入口与章节回收站。Android 工程使用共享 Web 资源。

# v1.6.0 写作体验

versionCode 20。加入续写位置、稿纸选项、排版预览及 Android 原生剪贴板复制。最低 Android 7.0。调试 APK 与本工程使用同一套 Web 资源。

# v1.5.0 手机写作与 AI 工坊

Android 工程使用 SDK 35、Build Tools 35.0.0 和 versionCode 19。软键盘采用 adjustResize，写作页也根据可见视口适配。工程资源与 Web 版本一致。

# v1.4.0 写作工作台

工程包含新版专注写作、章节蓝图与作品知识库。versionCode 为 18。Android 构建和真机验证待进行。

# v1.3.0 地图生成更新

工程已包含本地 Azgaar 生成引擎、地点导入与完整离线资源。versionCode 为 17。此交付为 Android Studio 工程，尚未编译 APK 或进行真机验收。打开工程后按下文流程构建。

# StoryWeave Android v1.2.0

v1.2.0 bundles Leaflet 1.9.4 with the shared map and location editor. Keep the vendor subdirectory, atlas.css, atlas-core.js and v12.js with the other web assets. Gradle uses versionCode 16. Images are stored with the work's JSON data. Android compilation and physical-device acceptance remain pending.

v1.1.1 updates the shared continuity audit with bounded local requests, a request preview, source validation, and stale finding dismissal. Gradle uses versionCode 15. Android compilation and physical-device acceptance remain pending.

- Open this folder (`android/`) in Android Studio, install SDK 35 and JDK 17, sync Gradle (Android Gradle Plugin 8.7.3).
- Build > Build APK(s), or run `gradle :app:assembleDebug` with Gradle 8.10.2.
- Debug builds have an automatically generated debug signing key. Release requires your own keystore and device testing.
- The new `StoryBridge.localAiRequest` uses native `HttpURLConnection` to **only** `127.0.0.1:8686`; it talks to the IRIDIS API service running on the same Android phone.
- Android Manifest references `res/xml/network_security_config.xml` for loopback HTTP, blocking remote cleartext traffic.
- Android WebView still loads only bundled assets. Do not change `setAllowUniversalAccessFromFileURLs(false)` or add arbitrary-URL bridge methods.
- IRIDIS must be installed and its API server started; this APK does not contain a GGUF inference engine.
- CI workflow is at `.github/workflows/android-debug.yml`, relative to this `android/` folder as the repository root.

- v0.5 adds `assets/v05.js` (Canon Ledger + separate role-context inference); keep it after `app.js` in `assets/index.html`.
- Browser app initialization now occurs after `v05.js` loads. Removing `v05.js` without moving bootstrap back will prevent the app from starting.
- No native build or device test was performed for v0.5.

- v0.5.1: Hardened system document picker and import validation.

- v0.6.0: Added `assets/v06.js` after `v05.js`, manuscript import input + preview, UTF-8/GB18030 handling and EPUB heading preservation. Keep assets in sync with `web/`.
- Added WebView `onRenderProcessGone` recovery handler (Android API 26+, compile SDK 35); **no device test has been performed**.

- v0.7.0: Added `assets/v07.js` after `v06.js`, writer workspace toolbar, context drawer, safe chapter replace and restore. `versionCode=10`, `versionName=0.7.0`.
- **No embedded model engine is planned**: keep the IRIDIS same-phone loopback integration and cloud API; do not add GGUF/LiteRT-LM native inference libraries.
- Android v0.7.0 has not been built/tested on a real Android device in this environment.

- v0.8.0: Added `assets/distill-core.js` and `assets/v08.js` after v07.js; multi-sample evidence-checked analysis tasks, author approval, writing skill recipes and A/B model test. Debug versionCode 11; versionName 0.8.0. Standard build and physical-device tests remain pending.

- v0.9.0: `assets/plot-core.js` and `assets/v09.js` after `v08.js`; plot branch editing, author approval of knowledge changes, feedback-based candidate skills. Debug `versionCode=12`, `versionName=0.9.0`. Standard Android SDK compilation and physical-device tests remain outstanding.

- v1.0.0: Added `assets/narrative-core.js` and `assets/v10.js` after v09.js. Includes chapter-level plot references, relationship change history, story-date events and evidence-verified AI continuity audit. Debug versionCode 13, versionName 1.0.0. Android build and physical-device tests remain pending.

- v1.1.0 adds `assets/archive-core.js` and `assets/v11.js` after `v10.js`. The Android and web assets share the scene manager, chapter relationship graph, whole-book scan, growth history, and AI archive review. The Gradle settings use `versionCode 14` and `versionName '1.1.0'`. Android device acceptance remains pending.
