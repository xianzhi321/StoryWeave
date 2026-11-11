# 源码上传状态

- 目标仓库：`xianzhi321/StoryWeave`（公开）
- 当前基线：**StoryWeave v1.9.19 review-fix 完整源码**
- 当前状态：**源码已完整同步**（提交 `b81fb52`，2026-11-11）；Android 原生平板、旧版 Web 客户端、桌面实验代码、测试脚本与第三方声明均在仓库内。

## 已完成

- 872 项源码及资源按原目录同步，包含 `NativeTabletActivity.java`、`MainActivity.java`、`NativeStoryRepository.java` 等全部原生类。
- 排除发布用 APK、签名材料与个人作品数据；`.gitignore` 覆盖密钥、日志、临时文件与构建产物。
- 大体积 Azgaar 纸张纹理以优化 PNG 入库，原始字节拆为七段无损数据保存；运行 `python scripts/restore_large_assets.py` 可还原并校验 SHA-256。详见 [源码传输说明](SOURCE_TRANSFER.md)。
- 已扫描常见 API 密钥与私钥特征；第三方压缩库中的类密钥字符串属于上游发行代码，已在 [SOURCE_TRANSFER.md](SOURCE_TRANSFER.md) 说明。

## 尚未完成（不要标成已完成）

- **未编译 Android APK**：本项目为源码仓库，需要 Android Studio / SDK 35 / Build Tools 35 / JDK 17 / Gradle 8.10.2 在本地构建 `:app:assembleDebug`。
- **未做真机验收**：中文输入法组合态、横竖屏转场、备份导入导出与数据恢复仍需在设备上验证。
- 不要用未验证的 APK 覆盖正在使用的正式版本数据。

## 历史说明

- 早期文档曾描述「部分上传、不可构建、基于 v1.9.17 基线」，那是初始占位状态，已由 v1.9.19 完整源码提交取代。
- `scripts/import_source_archive.py` 保留为离线重新导入源码包的工具；它在 `--publish` 时会覆写本文件，重新导入后请再次核对状态说明。

安全与已知限制另见 [SOURCE_TRANSFER.md](SOURCE_TRANSFER.md) 与 [TEST-LIMITATIONS-NATIVE.md](../TEST-LIMITATIONS-NATIVE.md)。
