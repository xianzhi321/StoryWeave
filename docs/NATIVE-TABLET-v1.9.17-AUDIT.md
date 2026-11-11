# StoryWeave v1.9.17 原生平板源码审计

## 审查对象

基于 v1.9.16 的 `NativeTabletActivity.java`、`NativeStoryRepository.java` 和 Android 构建配置。正常原生平板路线仍由 Java Android View 承载；WebView 仅留作旧作品的临时迁移入口，未将新版编辑器改回 WebView。

## 已验证的缺陷及本轮修复

| 问题 | 原来的风险 | 修改 |
|---|---|---|
| 假的“已保存” | 先前任意一次后台写盘完成时就清除等待状态，即使之后有新稿 | `editRevision/queuedRevision/persistedRevision` 保证只在最新已持久化时显示成功 |
| 失败队列后继续覆盖 | 写盘任务失败后，队列里已排入的后续任务可能继续操作文件 | 原子故障锁 `diskWriteFailed` 在后台立即阻止剩余任务 |
| 故障库被覆盖 | 原生作品库读取失败后仍允许选择备份、执行导入，导致原始库被取代 | 故障状态拒绝导入、导出普通备份及新建操作 |
| 大备份主线程卡顿 | 读取和解析 64 MB JSON、格式化并写备份在 UI 线程 | 单独 `backupIo` 串行后台队列处理解析和文件 IO；保存写入使用独立 `writer` 队列 |
| 横竖屏切换丢位置 | 重新生成 `EditText` 后只恢复单个光标位置，不保留选区与滚动 | 每章独立保存光标、选区、滚动值；同一章节重建时还原 |
| IME 未提交文字进入自动保存 | 每次 onTextChanged 都会直接更新 JSON，即使是拼音候选态 | 组合态时跳过正文提交，确认后更新；失焦、重建或后台时保护当前草稿 |
| 粘贴造成不真实的超高字速 | 一次性新增数百字按连续敲键计数 | 单次新增超过 8 字跳过字速记录 |
| 巨大目录弹窗容易分配过多对象 | 每次打开预先复制所有章节标题到字符串数组 | `BaseAdapter` 仅创建可见行，可复用列表项 |
| 库文件仅剩 .new 时被视为空库 | 恢复期间残留写入中间文件，旧逻辑可能按新安装生成空库 | 有残留 `.new` 时抛出读取异常，进入只读故障保护 |
| 有损 UTF-8 读取 | 受损 UTF-8 字节可能被悄悄替换成乱码字符 | 使用严格 UTF-8 解码，拒绝损坏的备份；兼容标准 UTF-8 BOM |
| 导入重复 ID | 相同作品或章节 ID 会导致编辑目标不明确 | `HashSet` 拦截重复作品 ID、同作品章节 ID |

## 已执行检查

- `python android/test_native_tablet.py`：原生启动路径、Manifest、结构与数据操作约束。
- `python android/tests/test_native_safety_v1917.py`：更新后的源码安全合同。
- `bash android/tests/test_native_repository_jvm.sh`：使用 **模拟** Android `AtomicFile` 和简化 JSON 测试替身，编译并运行**实际** `NativeStoryRepository` 中的 UTF-8 与 64MB 读取、无效写入不覆盖，以及 `.new` 残留阻止按空库启动的测试。此结果**不等于**真实 Android `AtomicFile` 的设备行为。
- `node test_writing_sense.cjs`、`node test_archive_core.cjs`、`node test_atlas_core.cjs`、`node test_narrative_core.cjs`：旧版共用核心回归。

## 未完成与已知风险

1. 本环境没有 Android SDK/Gradle。未编译 APK，未验证 JNI、Android 运行时、输入法实机组合和横竖屏转场。
2. 每次保存仍会在主线程将全作品库序列化为 JSON。特别大的作品可能短时卡顿，未来应改为逐章数据库事务（Room/SQLite），而不是继续无限放大全库 JSON。
3. 进入后台的最后一次保存仍通过异步任务写盘；如果系统立刻强杀进程，无法保证这次写入已完成。需要独立的草稿恢复日志/按章事务与设备测试。
4. 简洁原生平板仍不支持原有复杂人物编辑、关系图、地图、AI 工坊等全部功能。原生和 WebView 的数据仍必须显式备份迁移。
5. 备份上限 64 MB 且是整个 JSON 的大小，不支持超大型完整工程直接迁移。
6. 当前导入是**替换**原生库，不是合并；请导出原生备份再导入。
7. 标准 JVM 测试替身只验证有限的 IO 合约，不验证 Android SDK 的真实编译或行为。

## 构建与部署

需 Android Studio、SDK 35、Build Tools 35、JDK 17、Gradle 8.10.2，在 `android/` 构建 `:app:assembleDebug`，之后通过真实备份测试导入、切章与旋转、后台回到编辑器、中文输入法，并对比 SHA-256。**勿覆盖正在使用的正式版本之前唯一一份数据。**
