package com.storyweave.studio;

/**
 * 纯 Java 的人物卡模型。无 Android 依赖、无 JSON 依赖、无 I/O、不可变，
 * 可在 JVM 下独立编译测试。
 *
 * 参考网络成熟方案重新实现，而非迁移旧版 WebView 数据：
 *  - bibisco 的「角色访谈」：品质／缺陷／矛盾、成长弧、故事角色，聚焦人物的
 *    「人性」而非脸谱化标签；角色在名字下带一个 story role，便于大阵容里辨认。
 *  - Campfire Characters 模块：字段全部可选，「用得上就拿，用不上就留空」。
 *
 * 边界：只保留 6 个字段（名字／故事角色／欲望／软肋／核心矛盾／成长弧），
 * 不做关系网、参考图片、数值属性、时间线；不持有作品库、不解析 JSON、
 * 不写 native-tablet-library.json。所有字段规范化后只读，空名卡片视为无效。
 */
final class CharacterCard {

    /** 与 SettingCard 共享的字段上限，避免两处口径漂移。 */
    static final int MAX_NAME = SettingCard.MAX_NAME;
    static final int MAX_FIELD = SettingCard.MAX_VALUE;

    private final String name;
    private final String storyRole;
    private final String desire;
    private final String flaw;
    private final String contradiction;
    private final String arc;

    CharacterCard(String name, String storyRole, String desire,
                  String flaw, String contradiction, String arc) {
        this.name = SettingCard.normalize(name, MAX_NAME);
        this.storyRole = SettingCard.normalize(storyRole, MAX_FIELD);
        this.desire = SettingCard.normalize(desire, MAX_FIELD);
        this.flaw = SettingCard.normalize(flaw, MAX_FIELD);
        this.contradiction = SettingCard.normalize(contradiction, MAX_FIELD);
        this.arc = SettingCard.normalize(arc, MAX_FIELD);
    }

    String name() { return name; }
    String storyRole() { return storyRole; }
    String desire() { return desire; }
    String flaw() { return flaw; }
    String contradiction() { return contradiction; }
    String arc() { return arc; }

    /** bibisco：名字下显示一个故事角色；空名卡片无效。 */
    boolean isEmpty() { return name.isEmpty(); }

    /**
     * 只读摘要行：名字 +（可选）故事角色。刻意不把六个字段全塞进一行，
     * 避免像 setting card 那样在窄屏上撑破列表。
     */
    String summaryLine() {
        if (isEmpty()) return "";
        return storyRole.isEmpty() ? name : name + " · " + storyRole;
    }

    /** 已填写字段个数（不含名字），用于「这张卡填了多少」的只读展示。 */
    int filledFieldCount() {
        int n = 0;
        if (!storyRole.isEmpty()) n++;
        if (!desire.isEmpty()) n++;
        if (!flaw.isEmpty()) n++;
        if (!contradiction.isEmpty()) n++;
        if (!arc.isEmpty()) n++;
        return n;
    }

    /** 字段标签，供调用方逐行展示；顺序与构造器一致。 */
    static String[] fieldLabels() {
        return new String[]{"故事角色", "欲望", "软肋", "核心矛盾", "成长弧"};
    }
}
