# 叙境重构审计

本记录随实现更新。表中“待验”表示已找到源码入口或现有实现，仍需验证其完整调用链与实际行为。

## 对照基线

- 叙境 v1.9.7。前端使用 JavaScript、DOM 和 IndexedDB，Android 用 Java WebView 与系统文件选择器，桌面宿主使用 WinForms/WebView2。当前业务分布于 `web/app.js`、版本扩展脚本和各核心模块。历史版本用于查明行为变化，开发以 v1.9.7 的可运行路径为准。
- [书童 Pagekin e2910f3](https://github.com/EthanYoQ/Pagekin/tree/e2910f3ed6f50ca8460a6bcf8ceceadc574326cd)。检出 `src`、`electron`、`test`、`docs`、`plugins` 与根配置，跳过大部分二进制素材。React/TypeScript/CodeMirror 界面经 Electron IPC 调用数据库、文件和 AI 服务。SQLite 数据库启用 WAL 和外键约束，知识库另有 LanceDB 向量存储。根许可证为 GPL-3.0，本阶段独立实现可验证的行为。
- [文舟 Vela 7b546cc](https://github.com/KingPennymore/WengzhouVela-AnOpenSourceNovelEditorAndManager/tree/7b546ccbfceed3a63773cec22f5e9b3499dcf07d)。检出 Web、Android、HarmonyOS、Windows、组件、测试与文档，跳过大部分二进制素材。Web 核心使用 ES 模块和 CodeMirror，Android 由 Java 桥接文件工作区，HarmonyOS 由 ArkTS 桥接，Android 文件操作由 `WorkspaceFiles.java` 维护事务和恢复记录。根许可证为 MIT，平台及捆绑第三方内容需另查通知文件。下表所列新代码为叙境独立实现。

## 功能映射

| 模块 | 书童原版依据 | 文舟原版依据 | 叙境差异与处理 |
| --- | --- | --- | --- |
| 作品与上下文操作 | `electron/controllers/project-controller.ts`、`project-path.ts`；以本地项目路径作为项目上下文 | `web/file-manager.mjs`、Android `WorkspaceFiles.java`；文件改名、删除移入回收区及恢复 | `web/app.js`、`book-actions.js` 已有书架和长按。新建、改名提交后才更新 UI；删除补齐作品专属技能及依赖清理。整部作品回收与恢复仍待实现 |
| 章节生命周期 | `chapter-lifecycle-controller.ts`、`chapter-deletion-service.ts`，有删除测试与章节重开服务 | `web/chapters.mjs`、`tests/chapters.test.mjs` | `web/chapter-trash.js` 已处理关联记录和恢复位置。阶段、定稿后状态回滚与长篇目录性能待逐项核对 |
| 文件选择与 EPUB 导入 | `import-controller.ts` 通过文件授权读入，`epub-extraction-service.ts` 对 ZIP 声明大小和流实际输出设限，数据库事务提交；有损坏和超限测试 | `web/document-import.mjs` 分段读取、校验文件大小和版本、支持取消；Android `ImportedArchives.java` 提供原生暂存通道 | `web/v06.js`、`web/app.js` 已有 TXT/Markdown/EPUB 与导入预览。重构共享 EPUB 解压，限制实际输出并迭代提取深层 HTML；真实 Android 文件选择待验 |
| 自动保存与恢复 | `src/stores/project-editor-draft-ledger.ts` 跟踪编辑、确认保存和重设基线；`electron/database.ts` 使用 WAL | `WorkspaceFiles.java` 用事务目录记录与回滚文件；`web/workspace-save-worker.js` 为保存工作线程入口 | 抽离 `web/workspace-store.js` 统一提交顺序，保留当前 IndexedDB 和数据格式；崩溃恢复、分章存储和双窗口写入仍待验 |
| 导出与备份 | `project-archive-controller.ts` 使用选取授权，`portable-project-archive.ts` 处理可移植存档 | `web/workspace-backup.mjs` 有备份解析、恢复规划与合并，`web/chapter-export.mjs`、`web/epub-export.mjs` | `backup-restore.js` 有追加预览、整库恢复、ID 冲突防护，已具 TXT/Markdown 导出。单作品完整资料归档和 EPUB 导出待核对 |
| 编辑与移动适配 | `package.json`、`src/components` 和编辑草稿测试表明使用 CodeMirror；键盘与输入行为待逐项验证 | `web/editor-index.mjs`、`completion-ime.mjs`、`tests/editor-input-regressions-browser.mjs`、Android `PortInstrumentation.java` | 保留现有全屏、输入法保护、历史和快捷标点。性能、系统输入法、后台切换和不同屏幕尺寸需真机核对 |
| 人物、世界、资料与长篇连续性 | `electron/knowledge-base.ts`、`generation-knowledge-source.ts`、`finalization-generation.ts`；有原文保全、嵌入与重排测试 | `web/glossary.mjs`、`outline-graph.mjs`、`map-layers.mjs`；交互与边界待验 | 叙境已有关系、认知、记忆、知识卡、地图和事件关联。全文资料召回、可追溯引用、定稿提取需细分功能核对 |
| AI、审稿与写作技能 | `generation-controller.ts`、`generation-source-binding.ts`、`review-revision-generation.ts`、`writing-skill-package.ts`；有生成来源、预算与技能测试 | `web/ai-workspace.mjs`、`ai-providers.mjs`、`tests/ai-failure-guards-browser.mjs`；多端桥接可查 | `v15.js`、`cloud-ai.js`、`skill-batch.js` 已有预览、逐处采用、模型与技能。阶段上下文、任务取消与断点恢复待逐项核对 |
| 其他平台能力 | Electron 更新和独立插件入口见 `update-controller.ts`、`plugins/` | `web/document-components.mjs`、`plugin-package.mjs`、`rich-text-editor.mjs`、CSV/PDF/LaTeX/阅读入口 | 暂列待验；桌面或系统特有组件需先确认移动端适配方式。跨设备同步按本阶段范围延后 |

## 架构判断

保留现有 Android 应用 ID、WebView 来源、IndexedDB 键和 JSON 备份格式。先把书架、导入、备份和其他现有事务从技能工坊拆到独立写入模块。原页面逐步改用先写入、后公布的状态更新。待有大书稿、异常退出和迁移实测数据，再决定是否引入分章存储。替换整个编辑器、换库或照搬桌面界面都需要单独验证历史数据与输入行为。

## v1.9.8 实现与验证

| 变更 | 叙境实现位置 | 验证 |
| --- | --- | --- |
| 统一写入及后台提交 | `web/workspace-store.js`、`web/app.js`，技能工坊原写入 API 作为兼容别名 | Chromium 真实 IndexedDB 读取已提交作品；一次事务故障后仍可继续提交。浏览器故障注入覆盖删除落盘后、状态切换前触发后台保存 |
| 读取失败保护 | `web/app.js`、`web/v05.js` | 模拟 IndexedDB 读取异常和损坏兼容 JSON；界面进入重新读取页，原记录未被示例数据替换 |
| 作品与章节管理 | `web/app.js`、`web/book-actions.js`、`web/v14.js`、`web/v17.js` | 长按和右键、分组、分享桥接、置顶、取消与删除最后一本；注入写入失败，核对新建、改名、新章与删除重试 |
| EPUB 安全导入 | `web/epub-archive.js`、`web/v06.js`、`web/app.js` | 核对合法 EPUB 阅读顺序与分卷预览、伪造解压大小时拒绝、写入失败不创建书稿；编码和切章核心测试 |
| 构建与检查 | `verify_core.ps1`、`build_release_assets.py` | JavaScript 语法检查、两个新模块的 Prettier 检查、离线资源、地图与叙事等核心测试；Android Debug 离线构建和签名校验 |

文舟原仓库的文件管理、章节识别和文稿保存三个测试文件共通过 13 项。书童本轮查阅了相关源码和测试用例，尚未运行其 Electron 测试套件。叙境 Android 安装包已构建，当前没有已连接的设备或模拟器。系统文件选择、低内存导入、全屏输入、实际杀进程恢复还需设备验收。

## 继续对照的原版行为

- 书童 `chapter-reopen-service.ts` 的已定稿章节重开与正文版本隔离。叙境已有版本与定稿状态，需进一步核对对下游摘要、人物状态和时间线的影响。
- 书童 `generation-run-service.ts` 在暂停时保存运行收据并中止请求，`generation-source-binding.ts` 校验原始资料是否仍匹配。叙境现有分段提炼可续跑，章节生成的取消与恢复还要按任务逐个验证。
- 书童 `writing-skill-package.ts` 的目录读取、包清单和安装资源读取。叙境的技能卡和配方格式不同，须另行验证提示词、附件白名单与阶段绑定。
- 文舟 `file-manager.mjs` 与 `WorkspaceFiles.java` 的回收恢复在遇到名称冲突时保留回收项。叙境已覆盖章节回收站，整部作品仍走确认删除。作品级回收需同时处理备份、关联资料与 ID 冲突。
- 文舟 `glossary.mjs` 从作品关联的术语库收集词条并参与补全，`completion-ime.mjs` 处理输入法组合时机。叙境已有术语表和快捷输入，正文补全仍待适配。
- 文舟 `chapter-export.mjs` 处理章范围和纯文本转换，`reading-position.mjs` 基于可见文字偏移恢复阅读位置。叙境已有分卷导出和写作光标恢复，阅读模式位置与多格式导出待对照。
