package com.storyweave.studio;

import java.util.List;

/**
 * 纯 Java 的连续性账本模型。无 Android 依赖、无 JSON 依赖、无 I/O，可在 JVM 下独立编译测试。
 *
 * 参考网络成熟方案重新实现，而非迁移旧版 WebView 数据：
 *  - webnovel-handbook《连续性与伏笔台账》：四类核心台账（章节事件／人物状态／设定规则／
 *    伏笔闭环）、伏笔五态（已埋／已激活／已回收／延后／废弃需处理）、写前／写后／
 *    五章复盘三道门，以及「一条事实一行、不要把整章复述进台账」。
 *  - Novel Copilot 的一作品一目录纯文本状态库思路：账本独立、可移植。
 *
 * 边界：本类只提供只读模型与纯函数，不持有作品库、不解析 JSON、不写
 * native-tablet-library.json；不实现 AI 审查、关系图、地图或时间线可视化。
 * 章节「不加标记」的约束不变——账本条目是独立文本，不是章节字段。
 */
final class StoryLedger {

    /** 一章事实一行的最大长度，超出截断并加省略号，避免台账变成章节复述。 */
    static final int MAX_FACT_LINE = 120;

    /** 每 5 章复盘一次，来自 webnovel-handbook 的「五章复盘门」。 */
    static final int REVIEW_EVERY_CHAPTERS = 5;

    enum Book {
        CHAPTER_EVENTS("章节事件账", "时间地点、出场人物、关键事件、局面改变、章末状态"),
        CHARACTER_STATE("人物状态账", "掌握信息、利益压力、情绪位置、关系变化、待处理"),
        SETTING_RULE("设定规则账", "规则/限制、首次确认、例外/代价、当前状态"),
        HOOK_CLOSURE("伏笔闭环账", "埋入章、表面作用、真实用途、最晚回收、状态");

        private final String label;
        private final String fields;
        Book(String label, String fields) { this.label = label; this.fields = fields; }
        String label() { return label; }
        String fields() { return fields; }
    }

    enum HookState {
        PLANTED("已埋", true),
        ACTIVATED("已激活", true),
        RESOLVED("已回收", false),
        DEFERRED("延后", true),
        ABANDONED("废弃需处理", false);

        private final String label;
        private final boolean active;
        HookState(String label, boolean active) { this.label = label; this.active = active; }
        String label() { return label; }
        boolean isActive() { return active; }
    }

    enum Gate {
        BEFORE_WRITE("写前门"),
        AFTER_WRITE("写后门"),
        FIVE_CHAPTER_REVIEW("五章复盘门");

        private final String label;
        Gate(String label) { this.label = label; }
        String label() { return label; }
    }

    private StoryLedger() {}

    static Book[] books() { return Book.values(); }
    static HookState[] hookStates() { return HookState.values(); }
    static Gate[] gates() { return Gate.values(); }

    /** 章号是否落在五章复盘点；0 与负数不触发。 */
    static boolean isReviewDue(int chapterNumber) {
        return chapterNumber > 0 && chapterNumber % REVIEW_EVERY_CHAPTERS == 0;
    }

    /** 统计仍活跃的伏笔：已埋／已激活／延后；null 条目忽略。 */
    static int countActive(List<HookState> states) {
        if (states == null) return 0;
        int n = 0;
        for (HookState s : states) if (s != null && s.isActive()) n++;
        return n;
    }

    /**
     * 把旧版 plots.status 的四种既有取值映射到本枚举。只读既有数据，不新增任何字段。
     * 旧版取值：未展开 / 已埋设 / 发展中 / 已回收。
     * 「未展开」尚未埋下，不参与活跃计数，返回 null；未知值同样返回 null，绝不猜。
     */
    static HookState parseLegacyHookStatus(String raw) {
        if (raw == null) return null;
        String key = raw.trim();
        if (key.isEmpty()) return null;
        switch (key) {
            case "已埋设":
            case "PLANTED":
                return HookState.PLANTED;
            case "发展中":
            case "ACTIVATED":
                return HookState.ACTIVATED;
            case "已回收":
            case "RESOLVED":
                return HookState.RESOLVED;
            case "延后":
            case "DEFERRED":
                return HookState.DEFERRED;
            case "废弃需处理":
            case "ABANDONED":
                return HookState.ABANDONED;
            default:
                return null; // 「未展开」及其它未知值：不计入活跃，不臆测
        }
    }

    /** 伏笔闭环账的只读统计行。 */
    static String hookSummaryLine(int total, int active) {
        if (total <= 0) return Book.HOOK_CLOSURE.label() + " · 暂无";
        return Book.HOOK_CLOSURE.label() + " · 共 " + total + " 条（活跃 " + active + "）";
    }

    /** 单条伏笔的只读行：· 标题 [状态]；状态为空时不显示方括号。 */
    static String hookRow(String title, String status) {
        String t = SettingCard.normalize(title, MAX_FACT_LINE);
        if (t.isEmpty()) return "";
        String s = SettingCard.normalize(status, 16);
        return s.isEmpty() ? "· " + t : "· " + t + " [" + s + "]";
    }

    /**
     * 一条事实一行：trim、折叠换行与制表、超长截断加省略号；null 或空白返回空串。
     * 刻意不提供按章存储，避免把整章正文复述进台账。
     * 截断一律走 SettingCard.normalize() 的安全前缀，绝不 substring 拆开 UTF-16 代理对。
     */
    static String factLine(String raw) {
        String head = SettingCard.normalize(raw, MAX_FACT_LINE);
        if (head.isEmpty()) return "";
        // 多给 2 个字符的余量：能放下即说明原文未超限；放不下即说明确实被截断。
        String probe = SettingCard.normalize(raw, MAX_FACT_LINE + 2);
        return probe.length() > head.length() ? head + "…" : head;
    }
}
