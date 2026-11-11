# v1.3.0 验证记录

验证日期：2026-11-08。环境：Windows、Node.js 24.20.0、桌面 Chromium 的无头模式。

- 11 个核心/资源测试文件通过：archive、atlas、generator、narrative、offline-assets、v0.4、v0.4.1、v0.5、v0.6、v0.8、v0.9。
- 原有 `test_v11_browser.cjs` 通过：包含写作、人物、AI 模拟审核、地图图片导入、事件与章节筛选、经纬度坐标、备份与删除。
- `test_generator_browser.cjs` 通过：运行真实 Azgaar 引擎，覆盖全部七种模板、两种样式、固定种子重复生成、从保存的设置重新生成、存储失败原子性与重试、城镇采纳、仅图像采纳、备份和取消释放。
- 浏览器交互测试为 390 × 844 视口；另外生成并检查了 1280 × 1000 截图。截图保存于本目录。
- Web 与 Android 349 个资源文件逐一比对 SHA-256 相同，PWA 离线清单 348 个入口（包含根目录入口）。
- 三个发布 ZIP 在创建后逐项读取，检查条目集合和每个文件的 SHA-256 与原目录一致。ZIP 自身摘要记录在交付目录的 SHA256.txt 中。

地图算法并非模拟。写入故障通过模拟存储注入；AI 回归使用模拟响应。未构建 APK，未验证 Android 真机、真实 AI 服务、真实设备 IndexedDB 的长期持久化和 PWA 断网重启。详见根目录 TEST-LIMITATIONS.md。
