# StoryWeave v1.9.16 · 原生平板阶段一

## 目标

将平板的主界面从 WebView 页面改为 Android 原生控件，减少对 HTML/CSS 布局的依赖，同时保证已有手机端与作品数据不被无声改写。

## 架构

- Android 主入口 `MainActivity` 在 `smallestScreenWidthDp >= 600` 时，直接启动 `NativeTabletActivity` 并退出，**不创建 WebView**。
- `NativeTabletActivity` 使用 `LinearLayout`、`FrameLayout`、`ListView`、`EditText`、`TextView`，无需 WebView、Compose 库或网络服务。
- 平板 `screenWidthDp >= 900` 时启用常驻章节侧栏，否则通过原生章节选择弹窗切换。
- 原生数据保存在 `filesDir/native-tablet-library.json`，由 `NativeStoryRepository` 使用 `AtomicFile` 保护。单线程队列异步写入，写入失败会停止后续覆盖。
- 旧版仍保存在 Android WebView IndexedDB。两者 **不是同一数据库**，不会自动同步。

## 本阶段已经实现

1. 原生书架、创建作品、打开作品、原生章节列表与搜索。
2. 新建、编辑、重命名、删除章节；中文输入由 Android 原生 IME 完成。
3. 输入速度（5 秒窗口）与停顿计时；输入法组合态不计入输入速度。
4. 深浅色切换、横竖屏原地布局重排（光标位置尽量保留）。
5. JSON 完整备份导入／导出。导入时保留未知字段以避免破坏旧版人物、事件、技能、地图等扩展数据。
6. 原生人物资料只读列表。
7. 原生保存队列及 Android 生命周期中的停止计时、提交未保存数据。

## 旧作品迁移（非常重要）

旧版作品不是自动出现在原生书架里，不能因此判断作品丢失。

- 方案一：平板侧边栏点 **旧版数据**，进入仅用于导出的旧界面；在旧版设置中选择「查看可复制的完整 JSON 备份」，复制完整内容；返回原生平板，点击 **粘贴备份**。注意检查所复制内容完整且符合 JSON 格式。
- 方案二：在旧版本中将完整 JSON 备份另存成文件，在原生侧边栏点击 **导入**，使用 Android 系统文件选择器选择 `.json` 文件。
- 导入操作会**替换原生作品库**，但绝不会改写原有 WebView IndexedDB。在确认旧版完整备份与原生新备份均已保存之前，不要清除应用数据或卸载旧版 APK。

迁移时提供的「旧版数据」入口是**一次性导出兼容入口**，正常原生平板编辑、显示、保存均不需要 WebView。

## 尚未原生移植

- 人物卡片的完整 CRUD、关系网、世界地图、年表、参考作品、技能工坊、AI 协作、云端账户与导入 EPUB 的全部行为。
- 复杂文本格式、图文混排、完整旧数据自动迁移。
- 这不等于完整功能版原生应用；不能直接用它替代依赖这些功能的 v1.9.15 工作流程。

## 构建

在 Android Studio 中打开 `android/`，安装 SDK 35、Build Tools 35.0.0、Gradle 8.10.2、JDK 17，然后运行 `:app:assembleDebug`。

当前执行环境没有 Android SDK/Gradle，未完成 APK 编译或安卓真机验收；仅完成 Java 源码结构审查、Manifest 解析、静态行为检查。本次没有生成 APK。

## 后续建议

先让原生平板运行稳定，再逐步迁移人物资料编辑、关系图、知识库和 AI 入口，最终统一手机与平板存储。如果将来需要完全移除 WebView，必须先提供经过实机验证的旧版 IndexedDB 数据迁移方案。
