#!/usr/bin/env bash
# 独立验证 WordCountPolicy：只编译该纯 Java 类 + 本脚本生成的测试替身。
# 不读取、不修改任何现有源码，不是 Android SDK 构建。
set -eu
if ! command -v javac >/dev/null 2>&1 || ! command -v java >/dev/null 2>&1; then
    echo 'SKIP: Java JDK (javac and java) is unavailable.' >&2
    exit 77
fi
HERE="$(cd "$(dirname "$0")" && pwd)"
POLICY="${HERE}/../app/src/main/java/com/storyweave/studio/WordCountPolicy.java"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
mkdir -p "$TEMP/com/storyweave/studio"
cat > "$TEMP/com/storyweave/studio/WordCountPolicyTest.java" <<'EOF'
package com.storyweave.studio;
import java.util.ArrayDeque;
public class WordCountPolicyTest {
    static void check(boolean ok,String msg){if(!ok)throw new AssertionError(msg);}
    public static void main(String[] args){
        // 1. 空值与空串
        check(WordCountPolicy.countManuscriptChars(null)==0,"null text");
        check(WordCountPolicy.countManuscriptChars("")==0,"empty text");
        // 2. 中文正文，标点计入，空格与换行不计
        check(WordCountPolicy.countManuscriptChars("第一章，他来了。")==8,"chinese with punctuation");
        check(WordCountPolicy.countManuscriptChars("他来了 他走了\n下一章")==9,"spaces and newline excluded");
        // 3. 全角空格与不换行空格同样排除
        check(WordCountPolicy.countManuscriptChars("甲\u3000乙\u00A0丙")==3,"ideographic and nbsp excluded");
        // 4. UTF-16 口径固定：emoji 代理对计 2
        check(WordCountPolicy.countManuscriptChars("\uD83D\uDE00")==2,"surrogate pair counts as two chars");
        // 5. 粘贴/删除不计字速，仅 1..8 计
        check(WordCountPolicy.isKeystrokeDelta(1),"single keystroke");
        check(WordCountPolicy.isKeystrokeDelta(8),"eight keystrokes");
        check(!WordCountPolicy.isKeystrokeDelta(9),"nine is paste/import");
        check(!WordCountPolicy.isKeystrokeDelta(0),"zero delta");
        check(!WordCountPolicy.isKeystrokeDelta(-3),"deletion");
        // 6. 5 秒滑动窗口
        ArrayDeque<Long> q=new ArrayDeque<>();
        q.addLast(1000L);q.addLast(4000L);q.addLast(6000L);
        int removed=WordCountPolicy.trimExpired(q,7000L);
        check(removed==1,"one timestamp older than 5000ms removed");
        check(q.size()==2,"two remain");
        check(WordCountPolicy.trimExpired(q,7000L)==0,"nothing more to trim");
        check(WordCountPolicy.trimExpired(null,7000L)==0,"null queue is safe");
        // 与既有 refreshWritingStatus() 一致：严格 >5000 才过期，恰好 5000 保留。
        ArrayDeque<Long> edge=new ArrayDeque<>();edge.addLast(2000L);
        check(WordCountPolicy.trimExpired(edge,7000L)==0,"exactly 5000ms is kept (strict >)");
        check(edge.size()==1,"edge entry survives");
        // 7. 字速换算与既有 size()/5.0 一致
        check(WordCountPolicy.charactersPerSecond(10)==2.0,"10 keys over 5s = 2.0 cps");
        check(WordCountPolicy.charactersPerSecond(0)==0.0,"idle = 0");
        System.out.println("PASS: WordCountPolicy (7 groups): null/empty, CJK punctuation, fullwidth space, UTF-16, paste guard, sliding window, cps");
    }
}
EOF
javac -encoding UTF-8 -d "$TEMP/classes" "$POLICY" "$TEMP/com/storyweave/studio/WordCountPolicyTest.java"
java -cp "$TEMP/classes" com.storyweave.studio.WordCountPolicyTest
