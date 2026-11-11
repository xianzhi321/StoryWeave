#!/usr/bin/env bash
# 独立验证 ChapterStatus：只编译该纯 Java 类 + 本脚本生成的测试替身。
# 不读取、不修改任何现有源码，不是 Android SDK 构建。
set -eu
if ! command -v javac >/dev/null 2>&1 || ! command -v java >/dev/null 2>&1; then
    echo 'SKIP: Java JDK (javac and java) is unavailable.' >&2
    exit 77
fi
HERE="$(cd "$(dirname "$0")" && pwd)"
STATUS="${HERE}/../app/src/main/java/com/storyweave/studio/ChapterStatus.java"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
mkdir -p "$TEMP/com/storyweave/studio"
cat > "$TEMP/com/storyweave/studio/ChapterStatusTest.java" <<'EOF'
package com.storyweave.studio;
public class ChapterStatusTest {
    static void check(boolean ok,String msg){if(!ok)throw new AssertionError(msg);}
    public static void main(String[] args) throws Exception {
        // 1. 五个状态与顺序（参考 yWriter）
        ChapterStatus.Stage[] ss=ChapterStatus.Stage.values();
        check(ss.length==5,"five stages");
        check(ss[0]==ChapterStatus.Stage.OUTLINE && ss[4]==ChapterStatus.Stage.DONE,"stage order");
        check(ChapterStatus.Stage.DONE.label().equals("定稿"),"done label");
        // 2. 默认值
        check(ChapterStatus.defaultStage()==ChapterStatus.Stage.OUTLINE,"default outline");
        // 3. 解析：枚举名、中文标签、yWriter 写法、大小写、空白、未知、null
        check(ChapterStatus.parse("DRAFT")==ChapterStatus.Stage.DRAFT,"enum name");
        check(ChapterStatus.parse("draft")==ChapterStatus.Stage.DRAFT,"lowercase");
        check(ChapterStatus.parse("  二修  ")==ChapterStatus.Stage.EDIT2,"trim chinese label");
        check(ChapterStatus.parse("1st Edit")==ChapterStatus.Stage.EDIT1,"yWriter 1st Edit");
        check(ChapterStatus.parse("2nd Edit")==ChapterStatus.Stage.EDIT2,"yWriter 2nd Edit");
        check(ChapterStatus.parse("Done")==ChapterStatus.Stage.DONE,"yWriter Done");
        check(ChapterStatus.parse("大纲")==ChapterStatus.Stage.OUTLINE,"chinese outline");
        check(ChapterStatus.parse("不存在的状态")==ChapterStatus.Stage.OUTLINE,"unknown falls back");
        check(ChapterStatus.parse("")==ChapterStatus.Stage.OUTLINE,"empty falls back");
        check(ChapterStatus.parse(null)==ChapterStatus.Stage.OUTLINE,"null falls back");
        // 4. 只读展示
        check(ChapterStatus.displayLine(ChapterStatus.Stage.EDIT1).equals("状态 · 一修"),"display line");
        check(ChapterStatus.displayLine(null).equals("状态 · 提纲"),"null display falls back");
        // 5. 完结判定
        check(ChapterStatus.isFinal(ChapterStatus.Stage.DONE),"done is final");
        check(!ChapterStatus.isFinal(ChapterStatus.Stage.DRAFT),"draft not final");
        check(!ChapterStatus.isFinal(null),"null not final");
        // 6. 不写库：类中不含 JSON / Android / 文件 IO 引用
        String src=new String(java.nio.file.Files.readAllBytes(
            java.nio.file.Paths.get(System.getProperty("status.source"))),java.nio.charset.StandardCharsets.UTF_8);
        for(String banned:new String[]{"org.json","android.","java.io","FileOutputStream","SharedPreferences"})
            check(!src.contains(banned),"must not touch persistence: "+banned);
        System.out.println("PASS: ChapterStatus (6 groups): stages, default, tolerant parse, display, final flag, no persistence deps");
    }
}
EOF
javac -encoding UTF-8 -d "$TEMP/classes" "$STATUS" "$TEMP/com/storyweave/studio/ChapterStatusTest.java"
java -Dstatus.source="$STATUS" -cp "$TEMP/classes" com.storyweave.studio.ChapterStatusTest
