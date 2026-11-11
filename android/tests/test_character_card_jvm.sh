#!/usr/bin/env bash
# 独立验证 CharacterCard：只编译该纯类 + 它依赖的 SettingCard。
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
cat > "$TEMP/com/storyweave/studio/CharacterCardTest.java" <<'EOF'
package com.storyweave.studio;
public class CharacterCardTest {
    static void check(boolean ok,String msg){if(!ok)throw new AssertionError(msg);}
    public static void main(String[] args) throws Exception {
        // 1. 六字段规范化 + 只读摘要
        CharacterCard c=new CharacterCard("  林砚  "," 主角 ","找回妹妹","怕失去","冷漠实则害怕失去","从独行到托付");
        check(c.name().equals("林砚"),"name trimmed");
        check(c.storyRole().equals("主角"),"role trimmed");
        check(c.desire().equals("找回妹妹"),"desire kept");
        check(c.flaw().equals("怕失去"),"flaw kept");
        check(c.contradiction().equals("冷漠实则害怕失去"),"contradiction kept");
        check(c.arc().equals("从独行到托付"),"arc kept");
        check(!c.isEmpty(),"non-empty card");
        check(c.summaryLine().equals("林砚 · 主角"),"summary with role");
        // 2. 全部可选：空字段、null、空名
        CharacterCard minimal=new CharacterCard("阿甲",null,null,null,null,null);
        check(minimal.summaryLine().equals("阿甲"),"summary without role");
        check(minimal.filledFieldCount()==0,"no optional fields");
        CharacterCard blank=new CharacterCard("  ","主角",null,null,null,null);
        check(blank.isEmpty(),"blank name is empty");
        check(blank.summaryLine().isEmpty(),"blank has no summary");
        check(blank.filledFieldCount()==1,"role still counted on blank card");
        // 3. 换行压平与截断
        CharacterCard multiline=new CharacterCard("甲\n乙","角\n色","欲\n望",null,null,null);
        check(multiline.name().equals("甲 乙"),"name newline flattened");
        check(multiline.storyRole().equals("角 色"),"role newline flattened");
        StringBuilder longVal=new StringBuilder();for(int i=0;i<900;i++)longVal.append('欲');
        check(new CharacterCard("乙",null,longVal.toString(),null,null,null).desire().length()==CharacterCard.MAX_FIELD,"desire capped");
        // 4. 已填字段计数
        check(c.filledFieldCount()==5,"all five optional fields filled");
        CharacterCard partial=new CharacterCard("丙","配角",null,"怯懦",null,null);
        check(partial.filledFieldCount()==2,"two fields filled");
        // 5. 字段标签
        String[] labels=CharacterCard.fieldLabels();
        check(labels.length==5,"five labels");
        check(labels[0].equals("故事角色") && labels[4].equals("成长弧"),"label order");
        // 6. 上限与 SettingCard 一致
        check(CharacterCard.MAX_NAME==40 && CharacterCard.MAX_FIELD==400,"caps consistent");
        // 7. 不写库：类中不含 Android / JSON / 文件 IO 引用
        String src=new String(java.nio.file.Files.readAllBytes(
            java.nio.file.Paths.get(System.getProperty("card.source"))),java.nio.charset.StandardCharsets.UTF_8);
        for(String banned:new String[]{"org.json","android.","java.io","FileOutputStream","SharedPreferences"})
            check(!src.contains(banned),"must not touch persistence: "+banned);
        System.out.println("PASS: CharacterCard (7 groups): fields, optional/null, normalization, caps, field count, labels, no persistence deps");
    }
}
EOF
javac -encoding UTF-8 -d "$TEMP/classes" "$D/SettingCard.java" "$D/CharacterCard.java" "$TEMP/com/storyweave/studio/CharacterCardTest.java"
java -Dcard.source="$D/CharacterCard.java" -cp "$TEMP/classes" com.storyweave.studio.CharacterCardTest
