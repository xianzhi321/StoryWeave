# StoryWeave v1.9.19 · 轻激励与成熟做法移植（补丁说明 v2）

基线：`StoryWeave-Source-v1.9.19-review-fix.zip`（sha256 92a93f20…，872 文件）
目标：安卓原生平板写作端，排除同步功能，参考网络成熟方案**重新实现**（非迁移旧版 WebView 代码）。
**未做真机测验；本环境未编译 APK（无 Android SDK）。**

## 一、新增 6 个纯 Java 类（无 Android/JSON/IO 依赖，各自带 JVM 测试）

| 类 | 参考的成熟方案 | 实现内容 | 界面状态 |
|---|---|---|---|
| `WordCountPolicy` | 纯纯写作中文计数口径、口袋写作字速 | 不含空格换行计数、粘贴 >8 字不计字速、5 秒窗口严格边界 | ✅ 已接（书架总字数、卡片章字数） |
| `IncentiveLedger` | 口袋写作只读数字回看 | 存稿天数（按字数/按章）、只增不清零累计、无施压词文案 | ❌ 未接（无发布标记） |
| `SettingCard` | 口袋写作「作品相关」薄版 | 40/400 上限、trim、换行压平、**代理对安全截断** | ✅ 已接（人物性格/目标） |
| `ChapterStatus` | yWriter / novelWriter 状态标签 | 五态：提纲/初稿/一修/二修/定稿，宽容解析 | ❌ 未接（chapters 无 status 字段） |
| `StoryLedger` | webnovel-handbook 连续性台账 | 四类账、伏笔五态、三道门、五章复盘、一条事实一行 | ✅ 已接（真实伏笔统计与前 5 条） |
| `CharacterCard` | bibisco 角色访谈 / Campfire 可选字段 | 六字段：名字/角色/欲望/软肋/矛盾/成长弧 | ✅ 已接（名字+角色摘要） |

## 二、对 NativeTabletActivity.java 的改动（纯只读，未碰保存链路）

1. 新增 `chapterWordCountLine()`：按中文口径统计章字数
2. 书架卡片副标题改为「章节 N · X 字」（原为占位 genre）
3. 书架标题下新增「已写下 N 字」只读回看
4. 人物行改用 `CharacterCard.summaryLine()`，并追加真实「性格/目标」两行
5. 「其他资料」区接入伏笔闭环账：读旧版 `plots.status`（未展开/已埋设/发展中/已回收），显示统计与前 5 条；其余三类账保持真实空态

## 三、修复的 2 个真实缺陷（同源）

`SettingCard.normalize()` 与 `StoryLedger.factLine()` 原本按 char 截断，截断点落在 emoji 的 UTF-16 代理对中间时会留下**孤立代理项**（显示为方块乱码）。已修复为「成对代理要么整体放下、要么不拆」，并在两处测试中固化了回归断言。

## 四、明确没做（红线）

- 章节**不新增任何标记字段**；JSON 结构、备份格式、导入导出一个字不变
- 不碰 `NativeStoryRepository`、三态 revision、`diskWriteFailed`、IME 组合态、保存队列
- 不做账号、云同步、广告、AI 代笔、关系图/地图/时间线可视化
- 不做打卡、连续天数、目标、补签、拼字、强制码字

## 五、验证状态（实测）

- 11 项测试全绿：4 项原有 Python 契约 + 原 JVM 仓库测试 + 6 项新增 JVM 测试
- 11 个 Java 文件 AST 语法解析全 OK
- 4 个未改动文件（CloudAi/MainActivity/NativeImePolicy/NativeStoryRepository）SHA-256 与基线逐字节一致
- 禁改区 6 项关键串全部保留

## 六、验证边界（务必知悉）

- 本环境无 Android SDK，未编译 APK、未做真机验收
- 上线前仍需：Android Studio / SDK 35 / Gradle 8.10.2 编译 `:app:assembleDebug`，验证中文输入法、横竖屏、备份恢复
- 不要用未验证 APK 覆盖正在使用的正式版本数据

## 七、文件清单

新增（6 类 + 6 测试 + 本文档）：
- android/app/src/main/java/com/storyweave/studio/{WordCountPolicy,IncentiveLedger,SettingCard,ChapterStatus,StoryLedger,CharacterCard}.java
- android/tests/test_{word_count_policy,incentive_ledger,setting_card,chapter_status,story_ledger,character_card}_jvm.sh
- PATCH-NOTES-v1.9.19-incentive.md

修改：
- android/app/src/main/java/com/storyweave/studio/NativeTabletActivity.java

## 八、回退方式

删除上述新增文件，并把 `NativeTabletActivity.java` 还原为 v1.9.19 基线版本即可；作品库数据格式完全未变，回退不影响已有作品。
