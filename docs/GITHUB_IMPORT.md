# 完整源码导入说明

本仓库当前已包含 **StoryWeave v1.9.19 review-fix 完整源码**（872 项文件，按原目录同步），
无需再运行导入脚本即可取得全部源码。状态详见 [源码上传状态](UPLOAD_STATUS.md)。

仓库是**源码仓库，不是可安装包**：未编译 Android APK，也未做真机验收。
需要 Android Studio / SDK 35 / Build Tools 35 / JDK 17 / Gradle 8.10.2 本地构建。

## 何时需要重新导入

仅在持有官方源码包、且需要从零重建仓库时使用：

- 官方源码包：`StoryWeave-Source-v1.9.19-review-fix.zip`
- 大体积纹理还原：`python scripts/restore_large_assets.py`（离线，可校验 SHA-256）

```sh
git clone https://github.com/xianzhi321/StoryWeave.git
python StoryWeave/scripts/import_source_archive.py StoryWeave-Source-v1.9.19-review-fix.zip --repo StoryWeave
python StoryWeave/scripts/import_source_archive.py StoryWeave-Source-v1.9.19-review-fix.zip --repo StoryWeave --publish
```

第一条命令只校验，不提交。第二条会验证 ZIP、安全扫描、复制源码、提交并推送 main；
**它会把 `docs/UPLOAD_STATUS.md` 覆写成一句占位文字**，重新导入后请按 UPLOAD_STATUS.md 的
当前版本再次核对状态说明。推送前确认 GitHub 账号已授权，并检查项目中是否含个人作品或
不应公开的第三方资源；脚本已排除常见密钥、签名材料与构建产物，但不代替人工审查。

## 导入之后

1. 运行 `python scripts/restore_large_assets.py` 还原原始 Azgaar 纹理。
2. 在本地运行现有测试（见 README「测试」一节）。
3. 用 Android Studio / SDK 35 构建 `:app:assembleDebug`。
4. 在真机验证中文输入法组合态、横竖屏转场、备份导入导出与数据恢复。
5. 保留第三方 LICENSE 与版权声明（见 `docs/THIRD-PARTY.md` 及 vendor 目录）。

**不要用未验证的 APK 覆盖正在使用的正式版本数据。**
