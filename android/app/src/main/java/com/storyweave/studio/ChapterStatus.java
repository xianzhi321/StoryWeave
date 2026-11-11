package com.storyweave.studio;

/**
 * 纯 Java 的章节状态标签。无 Android 依赖、无 JSON 依赖、无 I/O，可在 JVM 下独立编译测试。
 *
 * 参考成熟方案重新实现，而非迁移旧版数据：
 *  - yWriter 的 Scene Status：Outline / Draft / 1st Edit / 2nd Edit / Done
 *  - novelWriter 的 Status / Importance 双标签：纯便利标记，不驱动其他功能
 *
 * 与本项目约束的关系：这是「只读视图状态」，不是写入作品库的章节标记；
 * 调用方不把结果写回 native-tablet-library.json，因此不违反「章节不加标记」。
 * 状态只描述完成度，不做打卡、连续天数、目标、断更判定。
 */
final class ChapterStatus {

    enum Stage {
        OUTLINE("提纲", "Outline", "大纲"),
        DRAFT("初稿", "Draft", "草稿"),
        EDIT1("一修", "1st Edit", "初修"),
        EDIT2("二修", "2nd Edit", "复修"),
        DONE("定稿", "Done", "完成");

        private final String label;
        private final String english;
        private final String alias;

        Stage(String label, String english, String alias) {
            this.label = label;
            this.english = english;
            this.alias = alias;
        }

        String label() { return label; }
        String english() { return english; }
        String alias() { return alias; }
    }

    private ChapterStatus() {}

    static Stage defaultStage() { return Stage.OUTLINE; }

    /**
     * 宽容解析：枚举名、中文标签、别名、yWriter 英文写法均可；大小写与首尾空白不敏感。
     * 未知或 null 一律回退到 OUTLINE，绝不抛异常——导入旧数据时不能让界面崩。
     */
    static Stage parse(String raw) {
        if (raw == null) return Stage.OUTLINE;
        String key = raw.trim().toLowerCase(java.util.Locale.ROOT);
        if (key.isEmpty()) return Stage.OUTLINE;
        for (Stage s : Stage.values()) {
            if (key.equals(s.name().toLowerCase(java.util.Locale.ROOT))
                || key.equals(s.label())
                || key.equals(s.alias())
                || key.equals(s.english().toLowerCase(java.util.Locale.ROOT))) {
                return s;
            }
        }
        return Stage.OUTLINE;
    }

    /** 单行只读展示；null 安全。 */
    static String displayLine(Stage stage) {
        Stage s = stage == null ? Stage.OUTLINE : stage;
        return "状态 · " + s.label();
    }

    /** 仅用于「是否完结」的只读判断，不触发任何写入。 */
    static boolean isFinal(Stage stage) {
        return stage == Stage.DONE;
    }
}
