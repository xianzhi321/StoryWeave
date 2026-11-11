# StoryWeave v1.9.13 · GitHub 写作软件对照与取舍

2026-11-09。此文记录实际查看的公开仓库代码，不是从其他项目复制模块。许可和技术栈各不相同。

| 项目 | 核实的源码或功能 | 借鉴 | 本版本取舍 |
| --- | --- | --- | --- |
| [noveditor](https://github.com/torifo/noveditor/blob/main/web/src/editor/Editor.svelte) | `composing` 防护、编辑位置/滚动恢复、300ms 滚动保存、`requestAnimationFrame` 重建位置 | 中文输入法完成组词后才进行正文计数与保存 | 增加 composition 事件防护；保留《叙境》已有章节位置记忆机制 |
| [易创](https://github.com/yilujian/easy-writing) | TipTap、160ms 本地防抖保存、每章版本历史和统计；公开说明与源码 | 输入渲染与写入解耦，优先数据安全 | 保留《叙境》已有 270ms 保存队列，不盲目缩短以免整库写入更多 |
| [Kindling](https://github.com/smith-and-web/kindling/blob/main/src/lib/components/WritingStatusBar.svelte) | 派生的统计状态、独立写作状态栏 | 状态栏单独渲染 | 沿用 v1.9.9 写作感知独立模块，不用额外框架 |
| [ManuHaven](https://github.com/julianavellaneda/manuhaven/blob/main/components/editor/TiptapEditor.tsx) | 编辑器组件以 onUpdate 通知上层；章节导航分离 | 不将统计与页面重绘绑定到输入事件 | 《叙境》继续 textarea+事件模块，暂不迁移编辑器框架 |
| [TanStack Virtual](https://github.com/TanStack/virtual) | 框架无关的窗口化列表 | 缩小 DOM 节点数量 | 暂用逐批挂载（120 行），保留卷折叠/全书搜索/多选；后续实测必要时再考虑窗口化 |

## 实际改动

- `web/app.js`：Unicode 字数扫描改为低分配遍历；带 WeakMap 的章节计数缓存；输入法组词时不提前提交候选字；恢复旧 `short()` 工具；快捷章节条缩到当前章附近（完整章节目录仍可访问）。
- `web/v14.js`：章节目录增量挂载、全数据搜索与多选范围不变。
- `web/ui-performance.css`：大列表离屏绘制与键盘弹出布局调整（浏览器支持时生效）。
- Web / Android assets 保持对应一致，不改变作品数据格式或原有离线储存方案。

## 测试边界

运行 `node test_performance_core.cjs`（含 3000 次随机 Unicode 编辑及长文本计数对照）、`python test_performance_ui.py`（550 章、180 人物、搜索、卷折叠、多选、输入/组词、窄屏、深色模式），再运行既有核心测试、旧版 UI 冒烟与资源一致性检查。

测试仅代表 Chromium 和项目提供的测试环境。未构建新 APK，尚未在 Android Gboard、微信输入法或极长小说真机上测量卡顿、光标稳定性或耗电。旧版 `test_v05.cjs` 中的 `Bootstrap missing` 断言与当前启动方式不匹配，未在本版修复。
