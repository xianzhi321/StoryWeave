# 第三方组件与改动记录

## Azgaar Fantasy Map Generator

- 官方仓库：https://github.com/Azgaar/Fantasy-Map-Generator
- 固定标签：`v1.109`；其 `versioning.js` 声明 `1.109.1`。
- 官方源码归档：https://codeload.github.com/Azgaar/Fantasy-Map-Generator/zip/refs/tags/v1.109
- 官方源码归档 SHA-256：`950cd43d3c0ae1d06857bcccdb0aec2fd18749d0acf7aba072c9fca73de21ec1`。
- Copyright 2017–2024 Max Haniyeu (Azgaar)。MIT 原文随运行资源保存在 `web/vendor/azgaar/LICENSE` 和 Android 对应目录。
- 保留了所带第三方库中的版权和许可证声明，包括 D3、jQuery 等。未把上游代码声称为 StoryWeave 原创。

适配由根目录 `build_azgaar.py` 可重复执行，`azgaar_bridge.js` 是新增的生成及导出桥接脚本：

1. `index.html` 去除 Google Analytics 和独立应用 manifest，规范本地脚本 URL，加入离线启动、网络限制和桥接脚本。
2. `main.js` 关闭引擎自身的 Service Worker 和自动启动流程。由桥接控制一次生成，生成异常交给宿主处理。
3. 将默认样式 JSON 作为本地 JavaScript 数据载入，避免 `file://` 模式下的 fetch 限制；字体采用系统回退字体。
4. 通过独立内存对象隔离 localStorage；生成器不使用持久 IndexedDB。每次生成创建新的 iframe，结果回传后释放。
5. 宿主验证消息来源窗口和请求标识，再检查版本、种子、模板、坐标、图片格式及城镇数据。设置变化和窗口关闭会使旧结果失效。
6. 栅格导出不包含地名、城镇图标或外部纹理。城镇位置和名称进入 StoryWeave 的地点集合；不导入上游 SVG/HTML 作为可执行内容。

此版本为离线地图生成目的保留上游运行目录；上游完整交互式编辑器不作为本产品的可用入口。扩展地图编辑时应单独评估升级版本和数据迁移。

## Leaflet

Leaflet 1.9.4，用于地图平移、缩放及地点标记。源码和许可证位于 `web/vendor/leaflet/`。
