# StoryWeave v1.9.19 · 对 v1.9.18 代码审查报告的修复

核对依据：用户上传的 `StoryWeave-1.9.18-CODE-REVIEW.md`。本次以 v1.9.18 完整源码为基准，重点修复原生平板的 P1–P5，并单独修复一处已证实的 Web HTML 注入。

## 高优先级修复

### P1 · 初始作品库损坏后无法恢复

- 启动读取失败的弹窗直接提供「从备份恢复」「粘贴备份」按钮，书架也保留「从备份恢复」入口。
- `NativeStoryRepository.recoverFromBackup` **先验证所选备份**，再将现存 `native-tablet-library.json`、`.bak`、`.new` 逐字节复制并 `fsync()` 到唯一的 `native-tablet-library.corrupt-<时间>-<随机>.json[.bak|.new]` 归档。
- 本实现选择**先复制而非先改名**：恢复过程突然中断时，原始位置的文件仍在；归档失败不执行覆盖写入，已归档的副本可保留。
- 归档成功才使用 `AtomicFile` 写入新库，之后清除故障锁、切换 UI。旧手机 WebView 数据库不受影响。
- 注意：归档文件位于应用私有存储目录，当前没有图形界面用于直接导出旧损坏库；需要设备级文件提取。具体可靠性仍待 Android 真机断电/存储故障注入验证。

### P2 · `stageField` 删除候选的顺序错误

- 将决策抽成纯 Java 的 `NativeImePolicy.decide()`，明确组合候选、禁止写入和确认提交三个状态；本轮不再由普通 `stageField()` 隐式删除已暂存候选。
- 无法写盘时，无论之前是否组合态，**已保存的 `draft:` 都不会因为一次清理回调而丢失**。
- 源码约束检查以及 JVM 策略表测试均覆盖这三个分支。

### P3 · 输入法暂存生命周期

- 新增跨章节的「待确认（N）」入口以及编辑器内「有未确认输入」提示，可查看、复制单条或全部，明确确认后才能删除单条。
- **不自动把拼音候选合并进正文，不在切章时静默清除**。这是对审查建议「切章前归并或清除」采取更保守的方式，避免无法判断候选是否已选择完成时丢稿。
- 成功导入新备份后统一清除旧库 `draft:` 键；导入失败则保留。抢救备份 `_recovery.pendingIme` 收录全部章节的待确认输入。
- 导入时 `_recovery` 不作为日常作品库数据继续保存，请保留原始抢救备份供独立取证。

### P4 · 全库序列化与保存 revision 抖动

- `captureEditorDraft()` 中的正文和标题一次捕获最多调用一次 `enqueueSave()`，降低不必要的 revision 增长。
- **未解决**：`flushSave()` 与导出仍会在 UI 线程进行全库 `library.toString()`，长篇项目可能卡顿。应在后续的 Room/SQLite 逐章事务迁移中根治。

### P5 · 备份和测试行为

- 文件选择器返回时若库初始读取失败，显示明确提示，不再无声返回。
- 导出时记录 `unverified` 状态和原因；若用户在文件选择期间从 verified 变成 unverified，拒绝生成标记不符的文件，并尽可能删除文件选择器留下的空文档。
- 已 `SKIP` 的 JVM 测试不算通过。本次环境包含 `java`、`javac`，所以确实执行了存储测试；其他环境缺 JDK 时脚本会退出 77，标注 `SKIP`。
- 已修复过时的 v0.5 启动源码断言；两个旧版 Playwright 测试改用 `CHROMIUM_BIN`/系统浏览器查找，不再硬编码 `/usr/bin/chromium`。

## 本轮补充的 Web 安全修复

- `web/app.js` 的关系历史 `type/detail` 在进入模态 HTML 模板前执行 `esc()` 转义，防止恶意备份把 `<img onerror=...>` 作为活跃 DOM 元素插入。
- `test_relation_history_escape.cjs` 使用恶意历史文本验证 HTML 转义，Web 与 Android `assets/app.js` 同步。
- PWA 缓存键更新到 `storyweave-v1-9-19`，保证升级时更新资源。

## 已执行验证

- `python android/test_native_tablet.py`
- `python android/tests/test_native_safety_v1917.py`
- `python android/tests/test_native_safety_v1918.py`
- `python android/tests/test_native_safety_v1919.py`
- `bash android/tests/test_native_repository_jvm.sh`：真实 Java 仓库逻辑配合**测试替身**；验证损坏库复制归档、无效恢复不覆盖、文件 sidecar 保全、连续零长度流终止及 IME 决策。
- `node test_relation_history_escape.cjs`
- `node test_offline_assets.cjs`、`node test_writing_sense.cjs`、`node test_archive_core.cjs`、`node test_atlas_core.cjs`、`node test_narrative_core.cjs`、`node test_generator_core.cjs`、`node test_v05.cjs` 等核心测试。

## 保留问题（不要标成已修）

1. **无 Android SDK/Gradle 实际构建与设备测试**，仍不能确认完整 Activity 的编译或真实输入法和存储异常表现。
2. 仅复制归档并文件 `fsync()`；不能绝对保证系统强杀、极端断电时目录项完全持久化，需真机验证。
3. 主线程全库 JSON 序列化、进程快速强杀导致的最后一次异步保存丢失，尚未根治。
4. Web 回退到 `localStorage` 后没有可靠自动回迁；整库备份恢复仍可能处理未知字段有损；**页面 CSP 尚未配置**，不能将单处 escaping 修复宣称为全面 XSS 防护。
5. `test_v05_ui.py` 旧版浏览器测试等待已经过时的页面结构，仍不能作为当前 UI 的成功验收；其浏览器路径已改为可配置。另一个旧浏览器用例是否通过需独立环境运行，不计入通过数。
6. `draft:` 输入法候选的暂存不等于 IME 组合上下文恢复；暂存文字存在本机偏好及用户主动导出的救援备份中，请注意数据隐私。

**不建议在 Android 构建与真实设备恢复演练前覆盖日常使用的稳定 APK。**
