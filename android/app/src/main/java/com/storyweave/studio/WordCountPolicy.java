package com.storyweave.studio;

import java.util.ArrayDeque;

/**
 * 纯 Java 的中文计数与字速口径。无 Android 依赖、无 I/O、不持有作品库，
 * 可在 JVM 下独立编译与测试。借纯纯写作的中文计数口径与口袋写作的码字时速做法，
 * 但只保留网文连载所需部分：不做打卡、连续天数、目标与排行。
 *
 * 计数单位为 UTF-16 char，与 Android EditText.length() 及既有 chapter.text
 * 的处理保持一致；一个 emoji 代理对计 2，此行为由测试固定，避免日后被误改。
 *
 * 本类独立于 native-tablet-library.json，任何返回值都不会写回作品库。
 */
final class WordCountPolicy {

    /** 与既有 refreshWritingStatus() 一致的 5 秒滑动窗口。 */
    static final long SPEED_WINDOW_MS = 5000L;

    /** 单次新增超过此值视为粘贴或导入，不计字速；既有实现为 8。 */
    static final int MAX_KEYSTROKE_DELTA = 8;

    private WordCountPolicy() {}

    /** 网文最常用口径：不含空格与换行，标点计入。 */
    static int countManuscriptChars(String text) {
        if (text == null || text.isEmpty()) return 0;
        int n = 0;
        for (int i = 0; i < text.length(); i++) {
            if (!isWhitespace(text.charAt(i))) n++;
        }
        return n;
    }

    private static boolean isWhitespace(char c) {
        return c == ' ' || c == '\n' || c == '\r' || c == '\t'
            || c == '\u000B' || c == '\f'
            || c == '\u3000' || c == '\u00A0';
    }

    /** 既有 afterTextChanged 的「粘贴不计字速」规则，抽成纯函数。 */
    static boolean isKeystrokeDelta(int delta) {
        return delta > 0 && delta <= MAX_KEYSTROKE_DELTA;
    }

    /** 丢弃 5 秒窗口外的击键时间戳；返回被丢弃的个数。 */
    static int trimExpired(ArrayDeque<Long> keystrokes, long now) {
        if (keystrokes == null) return 0;
        int removed = 0;
        while (!keystrokes.isEmpty() && now - keystrokes.peekFirst() > SPEED_WINDOW_MS) {
            keystrokes.removeFirst();
            removed++;
        }
        return removed;
    }

    /** 既有 refreshWritingStatus() 的 recentKeystrokes.size()/5.0。 */
    static double charactersPerSecond(int keystrokesInWindow) {
        return keystrokesInWindow / 5.0;
    }
}
