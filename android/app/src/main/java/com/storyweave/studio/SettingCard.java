package com.storyweave.studio;

/**
 * 纯 Java 的「薄设定卡」载体。无 Android 依赖、无 JSON 依赖、无 I/O、不可变，
 * 可在 JVM 下独立编译测试。
 *
 * 借口袋写作「作品相关」四项的思路，但刻意只留人物与设定两类，且不做成面板：
 *  - 一张卡 = 名字 + 内容 + 分类，仅此而已；
 *  - 只做文本规范化与只读展示，不持有作品库、不写 native-tablet-library.json；
 *  - 调用方（将来的 buildInfo）负责从既有 characters 数组只读取出并展示；
 *  - 不实现伏笔账本、时间线、关系图，避免重新长成第三个面板。
 */
final class SettingCard {

    enum Category {
        CHARACTER("人物"),
        SETTING("设定");

        private final String label;
        Category(String label) { this.label = label; }
        String label() { return label; }
    }

    /** 名字与内容都设上限，防止把整章正文塞进设定卡。 */
    static final int MAX_NAME = 40;
    static final int MAX_VALUE = 400;

    private final String name;
    private final String value;
    private final Category category;

    SettingCard(String name, String value, Category category) {
        this.name = normalize(name, MAX_NAME);
        this.value = normalize(value, MAX_VALUE);
        this.category = category == null ? Category.SETTING : category;
    }

    String name() { return name; }
    String value() { return value; }
    Category category() { return category; }

    boolean isEmpty() { return name.isEmpty(); }

    /** 单行只读展示；换行会被压平，保证不会撑破列表行。 */
    String displayLine() {
        if (isEmpty()) return "";
        if (value.isEmpty()) return category.label() + " · " + name;
        return category.label() + " · " + name + "　" + value;
    }

    /** trim + 折叠换行/制表 + 截断；null 视为空串，绝不抛异常。
     *  截断时绝不拆分 UTF-16 代理对（emoji 等），否则会留下孤立代理项导致显示乱码。 */
    static String normalize(String raw, int max) {
        if (raw == null || max <= 0) return "";
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < raw.length() && out.length() < max; i++) {
            char c = raw.charAt(i);
            if (c == '\n' || c == '\r' || c == '\t') c = ' ';
            boolean pair = Character.isHighSurrogate(c)
                    && i + 1 < raw.length()
                    && Character.isLowSurrogate(raw.charAt(i + 1));
            if (pair) {
                if (out.length() + 2 > max) break; // 放不下整个代理对就停止，不拆
                out.append(c).append(raw.charAt(i + 1));
                i++;
            } else {
                out.append(c);
            }
        }
        return out.toString().trim();
    }
}
