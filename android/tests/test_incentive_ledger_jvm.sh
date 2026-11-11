#!/usr/bin/env bash
# 独立验证 IncentiveLedger：只编译该纯 Java 类 + 本脚本生成的测试替身。
# 不读取、不修改任何现有源码，不是 Android SDK 构建。
set -eu
if ! command -v javac >/dev/null 2>&1 || ! command -v java >/dev/null 2>&1; then
    echo 'SKIP: Java JDK (javac and java) is unavailable.' >&2
    exit 77
fi
HERE="$(cd "$(dirname "$0")" && pwd)"
LEDGER="${HERE}/../app/src/main/java/com/storyweave/studio/IncentiveLedger.java"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
mkdir -p "$TEMP/com/storyweave/studio"
cat > "$TEMP/com/storyweave/studio/IncentiveLedgerTest.java" <<'EOF'
package com.storyweave.studio;
public class IncentiveLedgerTest {
    static void check(boolean ok,String msg){if(!ok)throw new AssertionError(msg);}
    public static void main(String[] args){
        // 1. 按字数：整除、向下取整、零与非法输入
        check(IncentiveLedger.draftDaysByChars(24000,4000)==6,"24000/4000=6 days");
        check(IncentiveLedger.draftDaysByChars(23000,4000)==5,"floor, not round");
        check(IncentiveLedger.draftDaysByChars(3999,4000)==0,"less than one day = 0 (conservative)");
        check(IncentiveLedger.draftDaysByChars(0,4000)==0,"no drafts");
        check(IncentiveLedger.draftDaysByChars(100,-1)==0,"invalid daily rate");
        // 2. 按章：网文按章发布的原子单位
        check(IncentiveLedger.draftDaysByChapters(12,2)==6,"12 chapters / 2 per day = 6");
        check(IncentiveLedger.draftDaysByChapters(1,2)==0,"one chapter cannot cover a 2/day schedule");
        check(IncentiveLedger.draftDaysByChapters(5,0)==0,"zero chapters per day");
        // 3. 只增不清零：删除不倒扣，负数基线归零，溢出封顶
        check(IncentiveLedger.accumulate(1000,300)==1300,"positive delta accumulates");
        check(IncentiveLedger.accumulate(1000,-500)==1000,"deletion never reduces stock");
        check(IncentiveLedger.accumulate(1000,0)==1000,"zero delta unchanged");
        check(IncentiveLedger.accumulate(-5,10)==10,"negative baseline clamped to zero");
        check(IncentiveLedger.accumulate(Integer.MAX_VALUE-2,100)==Integer.MAX_VALUE,"overflow capped");
        // 4. 文案只描述存量，不出现施压词
        String[] lines={IncentiveLedger.stockLine(0),IncentiveLedger.stockLine(1),IncentiveLedger.stockLine(9)};
        check(lines[0].equals("还没有存稿"),"empty stock line");
        check(lines[1].equals("存稿还能撑 1 天"),"one day line");
        check(lines[2].equals("存稿还能撑 9 天"),"nine day line");
        for(String line:lines){
            for(String banned:new String[]{"打卡","连续","断更","清零","补签","目标","排名","未完成","失败"})
                check(!line.contains(banned),"line must not contain pressure word: "+banned);
        }
        System.out.println("PASS: IncentiveLedger (4 groups): chars/chapters draft days, add-only accumulation, pressure-free wording");
    }
}
EOF
javac -encoding UTF-8 -d "$TEMP/classes" "$LEDGER" "$TEMP/com/storyweave/studio/IncentiveLedgerTest.java"
java -cp "$TEMP/classes" com.storyweave.studio.IncentiveLedgerTest
