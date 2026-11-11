#!/usr/bin/env bash
# 独立验证 StoryLedger：只编译该纯类 + 它依赖的 SettingCard。
# 不读取、不修改任何现有源码，不是 Android SDK 构建。
set -eu
if ! command -v javac >/dev/null 2>&1 || ! command -v java >/dev/null 2>&1; then
    echo 'SKIP: Java JDK (javac and java) is unavailable.' >&2
    exit 77
fi
HERE="$(cd "$(dirname "$0")" && pwd)"
D="${HERE}/../app/src/main/java/com/storyweave/studio"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
mkdir -p "$TEMP/com/storyweave/studio"
cat > "$TEMP/com/storyweave/studio/StoryLedgerTest.java" <<'EOF'
package com.storyweave.studio;
import java.util.*;
public class StoryLedgerTest {
    static void check(boolean ok,String msg){if(!ok)throw new AssertionError(msg);}
    public static void main(String[] args) throws Exception {
        // 1. 四类账齐全且顺序固定
        StoryLedger.Book[] bs=StoryLedger.books();
        check(bs.length==4,"four ledger books");
        check(bs[0]==StoryLedger.Book.CHAPTER_EVENTS,"first book");
        check(bs[3]==StoryLedger.Book.HOOK_CLOSURE,"last book");
        check(StoryLedger.Book.HOOK_CLOSURE.label().equals("伏笔闭环账"),"hook book label");
        // 2. 伏笔五态与活跃判定
        StoryLedger.HookState[] hs=StoryLedger.hookStates();
        check(hs.length==5,"five hook states");
        check(StoryLedger.HookState.PLANTED.label().equals("已埋"),"planted label");
        check(StoryLedger.HookState.ABANDONED.label().equals("废弃需处理"),"abandoned label");
        check(StoryLedger.HookState.PLANTED.isActive(),"planted active");
        check(StoryLedger.HookState.ACTIVATED.isActive(),"activated active");
        check(StoryLedger.HookState.DEFERRED.isActive(),"deferred active");
        check(!StoryLedger.HookState.RESOLVED.isActive(),"resolved not active");
        check(!StoryLedger.HookState.ABANDONED.isActive(),"abandoned not active");
        // 2b. 旧版 plots.status 四态映射（只读既有数据）
        check(StoryLedger.parseLegacyHookStatus("已埋设")==StoryLedger.HookState.PLANTED,"legacy 已埋设");
        check(StoryLedger.parseLegacyHookStatus("发展中")==StoryLedger.HookState.ACTIVATED,"legacy 发展中");
        check(StoryLedger.parseLegacyHookStatus("已回收")==StoryLedger.HookState.RESOLVED,"legacy 已回收");
        check(StoryLedger.parseLegacyHookStatus("未展开")==null,"legacy 未展开 maps to null");
        check(StoryLedger.parseLegacyHookStatus("RESOLVED")==StoryLedger.HookState.RESOLVED,"enum name accepted");
        check(StoryLedger.parseLegacyHookStatus("  已埋设  ")==StoryLedger.HookState.PLANTED,"trimmed");
        check(StoryLedger.parseLegacyHookStatus("未知值")==null,"unknown maps to null, never guessed");
        check(StoryLedger.parseLegacyHookStatus(null)==null,"null safe");
        check(StoryLedger.parseLegacyHookStatus("")==null,"empty safe");
        // 2c. 统计行与条目行
        check(StoryLedger.hookSummaryLine(0,0).equals("伏笔闭环账 · 暂无"),"empty summary");
        check(StoryLedger.hookSummaryLine(12,7).equals("伏笔闭环账 · 共 12 条（活跃 7）"),"summary with counts");
        check(StoryLedger.hookRow("十三年前的列车","已埋设").equals("· 十三年前的列车 [已埋设]"),"hook row with status");
        check(StoryLedger.hookRow("十三年前的列车","").equals("· 十三年前的列车"),"hook row without status");
        check(StoryLedger.hookRow("  ","已埋设").isEmpty(),"blank hook title skipped");
        check(StoryLedger.hookRow(null,"已埋设").isEmpty(),"null hook title skipped");
        StringBuilder longTitle=new StringBuilder();for(int i=0;i<300;i++)longTitle.append('伏');
        check(!StoryLedger.hookRow(longTitle.toString(),"已埋设").isEmpty(),"long title still renders");
        // 3. 三道门
        check(StoryLedger.gates().length==3,"three gates");
        check(StoryLedger.Gate.FIVE_CHAPTER_REVIEW.label().equals("五章复盘门"),"gate label");
        // 4. 五章复盘节奏
        check(StoryLedger.isReviewDue(5),"chapter 5 due");
        check(StoryLedger.isReviewDue(10),"chapter 10 due");
        check(!StoryLedger.isReviewDue(6),"chapter 6 not due");
        check(!StoryLedger.isReviewDue(0),"zero not due");
        check(!StoryLedger.isReviewDue(-5),"negative not due");
        check(StoryLedger.REVIEW_EVERY_CHAPTERS==5,"review interval");
        // 5. 活跃伏笔计数
        List<StoryLedger.HookState> mix=Arrays.asList(
            StoryLedger.HookState.PLANTED,StoryLedger.HookState.RESOLVED,
            StoryLedger.HookState.DEFERRED,null,StoryLedger.HookState.ABANDONED);
        check(StoryLedger.countActive(mix)==2,"two active hooks");
        check(StoryLedger.countActive(null)==0,"null list");
        // 6. 一条事实一行：trim、压平、截断、null 安全
        check(StoryLedger.factLine("  林砚抵达青云城  ").equals("林砚抵达青云城"),"trim");
        check(StoryLedger.factLine("甲\n乙\t丙").equals("甲 乙 丙"),"newline flattened");
        check(StoryLedger.factLine(null).isEmpty(),"null fact");
        check(StoryLedger.factLine("   ").isEmpty(),"blank fact");
        StringBuilder longFact=new StringBuilder();for(int i=0;i<400;i++)longFact.append('事');
        String capped=StoryLedger.factLine(longFact.toString());
        check(capped.length()==StoryLedger.MAX_FACT_LINE+1,"long fact capped with ellipsis");
        check(capped.endsWith("…"),"ellipsis appended");
        // 截断不拆 UTF-16 代理对（119 个普通字 + emoji = 121 字符，正好跨过 120 上限）
        StringBuilder mixed=new StringBuilder();
        for(int i=0;i<119;i++)mixed.append('事');
        mixed.append("\uD83D\uDE00");
        String safe=StoryLedger.factLine(mixed.toString());
        boolean loneFact=false;
        for(int i=0;i<safe.length();i++){
            char ch=safe.charAt(i);
            if(Character.isHighSurrogate(ch)){
                if(i+1>=safe.length()||!Character.isLowSurrogate(safe.charAt(i+1))){loneFact=true;break;}
                i++;
            } else if(Character.isLowSurrogate(ch)){loneFact=true;break;}
        }
        check(!loneFact,"factLine must not produce lone surrogate");
        check(safe.endsWith("…"),"truncated fact keeps ellipsis");
        // 7. 不写库：类中不含 Android / JSON / 文件 IO 引用
        String src=new String(java.nio.file.Files.readAllBytes(
            java.nio.file.Paths.get(System.getProperty("ledger.source"))),java.nio.charset.StandardCharsets.UTF_8);
        for(String banned:new String[]{"org.json","android.","java.io","FileOutputStream","SharedPreferences"})
            check(!src.contains(banned),"must not touch persistence: "+banned);
        System.out.println("PASS: StoryLedger (7 groups): books, hook states, gates, review cadence, active count, one-line facts, no persistence deps");
    }
}
EOF
javac -encoding UTF-8 -d "$TEMP/classes" "$D/SettingCard.java" "$D/StoryLedger.java" "$TEMP/com/storyweave/studio/StoryLedgerTest.java"
java -Dledger.source="$D/StoryLedger.java" -cp "$TEMP/classes" com.storyweave.studio.StoryLedgerTest
