#!/usr/bin/env bash
# 独立验证 SettingCard：只编译该纯 Java 类 + 本脚本生成的测试替身。
# 不读取、不修改任何现有源码，不是 Android SDK 构建。
set -eu
if ! command -v javac >/dev/null 2>&1 || ! command -v java >/dev/null 2>&1; then
    echo 'SKIP: Java JDK (javac and java) is unavailable.' >&2
    exit 77
fi
HERE="$(cd "$(dirname "$0")" && pwd)"
CARD="${HERE}/../app/src/main/java/com/storyweave/studio/SettingCard.java"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
mkdir -p "$TEMP/com/storyweave/studio"
cat > "$TEMP/com/storyweave/studio/SettingCardTest.java" <<'EOF'
package com.storyweave.studio;
public class SettingCardTest {
    static void check(boolean ok,String msg){if(!ok)throw new AssertionError(msg);}
    public static void main(String[] args){
        // 1. 规范化：trim、换行压平、null 安全
        check(SettingCard.normalize("  境界体系  ",400).equals("境界体系"),"trim");
        check(SettingCard.normalize("甲\n乙\t丙",400).equals("甲 乙 丙"),"newline and tab flattened");
        check(SettingCard.normalize(null,400).isEmpty(),"null is empty");
        check(SettingCard.normalize("abcdef",0).isEmpty(),"non-positive max");
        // 2. 截断：名字 40、内容 400
        StringBuilder longName=new StringBuilder();for(int i=0;i<80;i++)longName.append('名');
        check(SettingCard.normalize(longName.toString(),SettingCard.MAX_NAME).length()==40,"name capped at 40");
        StringBuilder longVal=new StringBuilder();for(int i=0;i<900;i++)longVal.append('设');
        check(SettingCard.normalize(longVal.toString(),SettingCard.MAX_VALUE).length()==400,"value capped at 400");
        // 2b. 截断绝不拆分 UTF-16 代理对（emoji），否则会留下孤立代理导致乱码
        String emoji="\uD83D\uDE00"; // 😀
        String cut=SettingCard.normalize("a"+emoji,2);
        check(cut.equals("a"),"surrogate pair not split when it does not fit");
        boolean lone=false;
        for(int i=0;i<cut.length();i++){
            char ch=cut.charAt(i);
            if(Character.isHighSurrogate(ch)){
                if(i+1>=cut.length()||!Character.isLowSurrogate(cut.charAt(i+1))){lone=true;break;}
                i++;
            } else if(Character.isLowSurrogate(ch)){lone=true;break;}
        }
        check(!lone,"no lone surrogate in truncated output");
        check(SettingCard.normalize(emoji+emoji,4).equals(emoji+emoji),"pairs kept when they fit");
        check(SettingCard.normalize(emoji+emoji,3).equals(emoji),"second pair dropped whole");
        // 3. 构造与分类
        SettingCard c=new SettingCard("  林砚  ","筑基境，棕眼睛",SettingCard.Category.CHARACTER);
        check(c.name().equals("林砚"),"name normalized on construction");
        check(c.value().equals("筑基境，棕眼睛"),"value kept");
        check(c.category()==SettingCard.Category.CHARACTER,"category kept");
        check(!c.isEmpty(),"non-empty card");
        check(c.displayLine().equals("人物 · 林砚　筑基境，棕眼睛"),"character display line");
        SettingCard s=new SettingCard("九天玄雷","",SettingCard.Category.SETTING);
        check(s.displayLine().equals("设定 · 九天玄雷"),"empty value omits separator");
        // 4. 空名与 null 分类
        SettingCard blank=new SettingCard("  ","some value",SettingCard.Category.CHARACTER);
        check(blank.isEmpty(),"blank name is empty");
        check(blank.displayLine().isEmpty(),"blank card has no display line");
        SettingCard nullCat=new SettingCard("无名","x",null);
        check(nullCat.category()==SettingCard.Category.SETTING,"null category falls back to SETTING");
        check(SettingCard.Category.CHARACTER.label().equals("人物"),"category label");
        System.out.println("PASS: SettingCard (4 groups): normalize, caps, construction/display, blanks and fallback");
    }
}
EOF
javac -encoding UTF-8 -d "$TEMP/classes" "$CARD" "$TEMP/com/storyweave/studio/SettingCardTest.java"
java -cp "$TEMP/classes" com.storyweave.studio.SettingCardTest
