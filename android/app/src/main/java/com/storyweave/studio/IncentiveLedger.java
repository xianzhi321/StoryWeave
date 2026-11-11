package com.storyweave.studio;

/**
 * 纯 Java 的激励机制核心：存稿安全感 + 只读数字回看。无 Android 依赖、无 I/O、
 * 不持有作品库，可在 JVM 下独立编译测试。
 *
 * 设计红线（借口袋写作「只读数字回看」形态，弃其账号与云同步）：
 *  - 激励对象是「攒下来的存量」，不是「今天写了没」；
 *  - 不建立连续天数概念，因此不存在断更、清零、补签、惩罚；
 *  - 删除文字不倒扣累计，避免「越改越少」的挫败；
 *  - 所有输出文案不得出现打卡、目标、排名、断更等施压字样；
 *  - 本类不写 native-tablet-library.json，统计由调用方另存独立文件。
 */
final class IncentiveLedger {

    private IncentiveLedger() {}

    /** 存稿按字数还能撑几天；不足一天按 0 天（保守，不虚报）。 */
    static int draftDaysByChars(int unpublishedChars, int dailyChars) {
        if (unpublishedChars <= 0 || dailyChars <= 0) return 0;
        return unpublishedChars / dailyChars;
    }

    /** 存稿按章还能撑几天；网文按章发布，章是原子单位。 */
    static int draftDaysByChapters(int unpublishedChapters, int chaptersPerDay) {
        if (unpublishedChapters <= 0 || chaptersPerDay <= 0) return 0;
        return unpublishedChapters / chaptersPerDay;
    }

    /**
     * 只增不清零的累计：新增为正才累加，删除（delta<=0）保持原值。
     * 用于今日字数与历史总量，避免断更或删改时把已有成果抹掉。
     */
    static int accumulate(int previous, int delta) {
        int base = previous < 0 ? 0 : previous;
        if (delta <= 0) return base;
        long sum = (long) base + delta;
        return sum > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) sum;
    }

    /** 首页唯一主数字；措辞刻意只描述存量，不评价行为。 */
    static String stockLine(int draftDays) {
        if (draftDays <= 0) return "还没有存稿";
        return "存稿还能撑 " + draftDays + " 天";
    }
}
