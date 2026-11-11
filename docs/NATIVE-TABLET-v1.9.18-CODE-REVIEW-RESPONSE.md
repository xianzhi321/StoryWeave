# StoryWeave v1.9.18 · v1.9.17 审查意见修复记录

日期：2026-11-11。基于 `StoryWeave-Source-v1.9.17-native-tablet-audit.zip` 的原生平板源码，保持 Web 资产及手机端旧版运行路径不变。

## 审查意见与修改

| 审查指出的问题 | 原因 | 本次修改 |
|---|---|---|
| 未上屏拼音被写入 `chapter.text` | `captureEditorDraft()` 绕过 `afterTextChanged` 的组合态拦截 | 统一使用 `stageField()`；检测 Android IME composing span 后只把候选字片段存入 SharedPreferences 的 `draft:<work>:<chapter>:body/title`，不写 `chapter.text`；不自动回填候选串。候选片段最长 512 UTF-16 单元，避免将整章写入偏好。 |
| 保存失败后无法复制和抢救 | 旧代码同时禁用 `EditText` 和禁止导出 | 改为可选择、可复制的只读编辑器，并提供「复制正文」「输入法暂存」入口。原生库成功读取过时，允许导出 `_recovery.unverified` 备份，保留内存中已确认的章节正文；不将读取失败后生成的空占位库伪装为备份。 |
| `diskWriteFailed` 无法解除 | 故障锁永远不复位 | 增加显式「重试保存」，重试时提高写任务代际序号并作废以前队列中的快照；最新成功写盘前不显示「已保存」。初次读取失败禁止直接复位保护。 |
| 导入成功后旧 `editorChapter` 参与 `render()` | 旧绑定仍在 `render()` 的清理阶段使用 | 导入成功后先 `clearOldEditorBinding()`，再切换 `library` 与视图；防止旧数据被误写入新库。 |
| `InputStream.read()` 连续返回 `0` | `continue` 无界，可能陷入死循环 | 连续空块达到 8 次时抛出 `IOException`，正常读取恢复时清零计数。 |
| JVM 测试 `javac` 缺失 | 测试脚本未检查前置条件 | 开头检查 `java` 和 `javac`，缺失时明确输出 `SKIP` 并以代码 `77` 退出，不能报告成通过；Python 源码约束测试不依赖 JDK。 |

## 其他防护

- 从编辑器切换作品时，暂存键绑定真实的 `editorWorkId`，而非已切换的新 `workId`。
- 导出 `_recovery` 中记录 `reason`、`memoryRevision`、`exportedAt`，对当前输入法待确认候选字提供独立的 `pendingIme` 元数据，而不是合并至正文。
- 编辑器底部救援操作改为两行，以免较窄的原生平板竖屏截断按钮。
- `NativeImePolicy.java` 为纯 Java IME 策略，可在 JVM 下独立验证组成态与已确认输入的边界。

## 测试与可复现性

从源码目录运行：

```sh
python android/test_native_tablet.py
python android/tests/test_native_safety_v1917.py
python android/tests/test_native_safety_v1918.py
bash android/tests/test_native_repository_jvm.sh
node test_writing_sense.cjs
node test_archive_core.cjs
node test_atlas_core.cjs
node test_narrative_core.cjs
```

本次执行环境**有 JDK（java、javac）**，因此 JVM 测试替身已实际编译并通过：验证了流重复零长度读取、UTF-8、备份边界、AtomicFile 测试替身与 IME 策略。若另一环境没有 JDK，脚本会报 `SKIP`（退出码 77），不能说这些测试通过。所有 JVM 桩均非 Android 系统实现。

本环境**没有 Android SDK**，不能执行真正的 `:app:assembleDebug`、启动 Android 真机，也未证明 Android 输入法生命周期与真实存储故障时的行为。测试通过不等于可安全直接覆盖正式安装包。

## 尚存问题

1. 正文仍作为整个 JSON 在 UI 线程序列化，超大书籍会造成卡顿；仍需要 Room/SQLite 的逐章事务存储。
2. 应用在 `onPause()` 之后立刻被强杀，异步存盘任务可能来不及完成，未实现完整 WAL/同步草稿恢复。
3. 单独 `draft:` 中最多保存 512 单元的候选片段，仅作为救援提示，不能保证自动还原输入法选择状态、上下文或全部未上屏文字。
4. 缺少真实中文输入法（Gboard、搜狗、微信）和 Android 系统进程回收、磁盘写满及文件选择器的设备级回归。
5. 原生平板阶段的复杂人物编辑、地图和 AI 功能依旧未迁移，不应直接替换正式版。

## 回滚

保留原版 v1.9.17 源码及原 APK 数据。此补丁未更改作品库 JSON 结构；紧急备份新增的根字段 `_recovery` 只作为元数据，未写回正文或改变章节 ID。导入前请另存一份已有原生备份。
