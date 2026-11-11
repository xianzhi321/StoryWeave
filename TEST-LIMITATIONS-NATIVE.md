## v1.9.19 审查回归限制

原生恢复通道、候选暂存和导出安全检查通过有限的 Java JVM 桩测试；这不是 Android `AtomicFile` 或系统输入法真机证明。未完成 Android APK 构建、故障注入与大型作品持久化压力测试。完整说明见 `docs/NATIVE-TABLET-v1.9.19-CODE-REVIEW-RESPONSE.md`。

## v1.9.18 原生复核

本次 JVM（模拟 Android 类）测试通过；未执行 Android SDK 编译或真机中断保存、输入法验证。Java 工具缺失时脚本退出 77 表示 SKIP。

# v1.9.17 原生平板复核补充

- 新增：源码安全断言与原生存储 Java 类的有限 JVM 测试替身；测试通过不代表 Android 设备编译。
- 已修改：异步写入序号、导入故障锁、备份解析线程、未确认输入与编辑位置保护。
- 仍然未完成：Android SDK 编译、APK、真实设备验证和强杀恢复保证。完整范围见 `docs/NATIVE-TABLET-v1.9.17-AUDIT.md`。

# v1.9.16 原生平板验证与限制

- 已完成：AndroidManifest.xml XML 解析、平板启动路由校验、原生控件静态校验、AtomicFile 提交/回滚路径校验、Android 备份导入导出入口校验、横竖屏重排与中文输入法相关源码检查。
- 未完成：使用 Android SDK 35 的 Java 编译、Gradle assembleDebug、安装 APK、平板横竖屏真机测试、输入法组合态及 10 万字正文压力实测、数据库故障注入恢复实测。
- 当前系统提供 JDK 17，但不包含 Android SDK / android.jar，纯 javac 的 Android 类型缺失报错不能作为构建结果。
- 原生模块当前属于阶段一，并未实现旧版所有功能；正常写作原生，旧版导出通道仍会打开原 WebView。
