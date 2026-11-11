# 完整源码导入说明

当前 GitHub 连接器不支持把 ChatGPT 沙盒内的 ZIP 直接上传成 Git 提交，因此目前仅已提交一部分原生代码与项目配置。**不要将仓库误认为可构建。**

若在已授权的本地电脑上拥有官方源码包 `StoryWeave-Source-v1.9.17-native-tablet-audit.zip`，可运行：

```sh
git clone https://github.com/xianzhi321/StoryWeave.git
python StoryWeave/scripts/import_source_archive.py StoryWeave-Source-v1.9.17-native-tablet-audit.zip --repo StoryWeave
python StoryWeave/scripts/import_source_archive.py StoryWeave-Source-v1.9.17-native-tablet-audit.zip --repo StoryWeave --publish
```

第一条 Python 命令只检查，不提交。第二条命令会在本地验证 ZIP、安全扫描、复制源码、提交并尝试推送 main。推送前确认 GitHub 账号已授权，并检查项目中是否含个人作品或不应公开的第三方资源。

推送后需要另行验证 Android Studio/SDK 35、Gradle 编译、JSON 备份恢复及真机输入法。不要用未验证 APK 覆盖唯一的正式作品数据。
