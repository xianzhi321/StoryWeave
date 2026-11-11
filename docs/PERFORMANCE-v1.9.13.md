# v1.9.13 性能改动与验证

## 改动原则

保留 v1.9.12 的界面和作品存储模型，不改变正文保存、章节选择和编辑操作语义；优先减少长作品的主线程工作。

## 目录增量渲染

`web/v14.js` 在目录初次挂载最多 120 个章节行，并使用 IntersectionObserver 或“继续显示章节”按钮分页增加行数。全文搜索、章节状态过滤、批量选择和卷折叠仍使用完整章节数据而非当前 DOM。大作品滚动到后段时可渐进加载；该实现并非恒定 DOM 数量的真正虚拟滚动，已载入的行仍会保留。

## 字数统计

`web/app.js` 的 `count()` 不再创建剔除空白后的字符串和码点数组；对于原始文本以 Unicode 码点计数，沿用 `\s` 空白排除的原始规则。`chapterWordCount()` 用 WeakMap 缓存给定章节文本引用的统计值，章节正文发生修改后更新缓存。对包含组合字符、表情、空白和代理项的随机编辑执行等价性断言。

## 离屏绘制与手机键盘

`web/ui-performance.css` 给目录行和人物卡片应用 `content-visibility:auto`，浏览器不支持时自然退化；弹窗用动态视口高度 `dvh`，避免虚拟键盘覆盖输入框。`prefers-reduced-motion` 继续受支持。

## 验证（本地 Chromium 模拟）

- `node test_performance_core.cjs`：随机 Unicode 编辑等价及长文本耗时对比；耗时仅是此环境样本，不代表真机加速比例。
- `python test_performance_ui.py`：550 章、180 人物；首批 120 行，查询和批量选择全量，支持卷折叠与后续加载；输入、深色稿纸、320/360/390/768px 宽度及减少动态效果。
- `node test_offline_assets.cjs` 和既有 `test_writing_sense.cjs`、`test_archive_core.cjs`、`test_atlas_core.cjs`、`test_narrative_core.cjs`、`test_generator_core.cjs` 通过。
- `python test_atelier_ui.py` 和 `python test_fluid_ui.py` 通过。

## 未验证

未构建 APK，未开展安卓真机软键盘、输入法和滑动帧率测量；不能保证每种手机上的交互性能。目录仍有进一步实现完全虚拟化的余地。
