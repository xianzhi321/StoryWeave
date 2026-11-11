# v1.9.14 编辑器 UI 设计与代码说明

## 用户反馈

用户提供的安卓截图中：深色顶栏与系统状态栏不协调，正文被一张巨大带框卡片包裹，横线+松枝+浅白色的附加工具折叠区造成层叠与视觉干扰，标题和操作区占用较多空间。

## 改动范围

- 新增 `ui-manuscript.css`：仅作用于 `data-sw16-view="write"` 的正文写作页；保持书架、目录、人物、地图样式不变。
- 将编辑器容器改为无阴影、无大圆角的一体化正文页面；标题及顶部操作各自缩小为轻量分区。
- 「专注模式」按钮文案改为「专注」，「更多剧情工具」改为「更多功能」。
- 深色主题统一 `#202925` 表面色，文字使用 `#e7ece4`，弱化辅助文本和分隔线。
- 写作感知与本地保存状态仍保留，但取消冗余章节信息行的视觉占位。
- `v17.js` 新增布局设置 `quiet`，默认开启（存入现有布局偏好 JSON，不修改作品文件格式）；开启时仅隐藏正文背景图片/横线的展示，原有 `pine/mist/custom/ruled` 选项继续保留。关闭可恢复。
- `ui-manuscript.js` 监听当前视图和纸张主题，通过**限定为 ink/paper 两种值**的 Android `StoryBridge.setSystemBarStyle` 更新状态栏/导航栏背景，Web/PWA 更新 `<meta name="theme-color">`；不传正文内容，无网络请求。
- Android 源码和 Web 资源保持同步，PWA service worker 缓存版本递增。

## 设计稿

Figma： https://www.figma.com/design/rcVSgwmsseDSjlNfBL5NjX

新增可编辑的「04 · 墨夜 / 简洁正文 v1.9.14」画板，非实际运行截图。实测截图位于交付包外的 `StoryWeave-Editor-v1.9.14-dark.png` 和 `StoryWeave-Editor-v1.9.14-light.png`。

## 技术约束

无需引入新 UI 框架。不触碰存储格式、自动保存机制、AI 调用与正文内容。所有新样式遵守系统减少动态效果设置；输入时不触发新页面动画。

## 仍待验证

- 浏览器端 Chromium 测试已通过，但安卓 SDK 编译与真机状态栏颜色、软键盘窗口变化仍未实际验证。
- Android 15+ 的状态栏着色可能受系统强制 edge-to-edge 策略影响。
