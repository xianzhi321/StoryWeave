#!/usr/bin/env bash
# Exercises the actual Java NativeStoryRepository with minimal test doubles.
# This is NOT an Android SDK build or an emulator test.
set -eu
if ! command -v javac >/dev/null 2>&1 || ! command -v java >/dev/null 2>&1; then
    echo 'SKIP: Java JDK (javac and java) is unavailable; run the Python source tests instead.' >&2
    exit 77
fi
HERE="$(cd "$(dirname "$0")" && pwd)"
MAIN="${HERE}/../app/src/main/java/com/storyweave/studio/NativeStoryRepository.java"
IME="${HERE}/../app/src/main/java/com/storyweave/studio/NativeImePolicy.java"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
mkdir -p "$TEMP/android/content" "$TEMP/android/util" "$TEMP/org/json" "$TEMP/com/storyweave/studio"
cat > "$TEMP/android/content/Context.java" <<'EOF'
package android.content;
import java.io.File;
public class Context {
    private final File root;
    public Context(File root) { this.root=root; }
    public File getFilesDir(){ return root; }
}
EOF
cat > "$TEMP/android/util/AtomicFile.java" <<'EOF'
package android.util;
import java.io.*;
public class AtomicFile {
    private final File base;
    public AtomicFile(File base){this.base=base;}
    public File getBaseFile(){return base;}
    public FileInputStream openRead() throws FileNotFoundException {return new FileInputStream(base);}
    public FileOutputStream startWrite() throws IOException {return new FileOutputStream(base.getPath()+".new");}
    public void finishWrite(FileOutputStream out) throws IOException {
        out.close();File part=new File(base.getPath()+".new");
        if(!part.renameTo(base))throw new IOException("rename failed");
    }
    public void failWrite(FileOutputStream out) {try{out.close();}catch(IOException ignored){}new File(base.getPath()+".new").delete();}
}
EOF
cat > "$TEMP/org/json/JSONException.java" <<'EOF'
package org.json;
public class JSONException extends Exception {public JSONException(String message){super(message);}}
EOF
cat > "$TEMP/org/json/JSONArray.java" <<'EOF'
package org.json;
import java.util.*;
public class JSONArray {
    private final java.util.ArrayList<Object> a=new java.util.ArrayList<>();
    public int length(){return a.size();}
    public JSONObject optJSONObject(int i){return i>=0&&i<a.size()&&a.get(i) instanceof JSONObject?(JSONObject)a.get(i):null;}
    public JSONArray put(Object o){a.add(o);return this;}
}
EOF
cat > "$TEMP/org/json/JSONObject.java" <<'EOF'
package org.json;
import java.util.*;
public class JSONObject {
    public static final Object NULL=new Object();
    private final HashMap<String,Object> values=new HashMap<>();
    private String original="{}";
    public JSONObject() {}
    public JSONObject(String source) throws JSONException {
        // Only the minimal JSON shape used by these IO tests is accepted.
        if(!source.equals("{\"projects\":[]}"))throw new JSONException("invalid test JSON");
        this.original=source;values.put("projects",new JSONArray());
    }
    public JSONObject put(String name,Object value) throws JSONException {values.put(name,value);return this;}
    public JSONArray optJSONArray(String name){Object o=values.get(name);return o instanceof JSONArray?(JSONArray)o:null;}
    public JSONObject optJSONObject(String name){Object o=values.get(name);return o instanceof JSONObject?(JSONObject)o:null;}
    public Object opt(String name){return values.get(name);}
    public boolean has(String name){return values.containsKey(name);}
    public String optString(String name){Object o=values.get(name);return o instanceof String?(String)o:"";}
    @Override public String toString(){return original;}
}
EOF
cat > "$TEMP/com/storyweave/studio/RepoTest.java" <<'EOF'
package com.storyweave.studio;
import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
public class RepoTest {
    static void check(boolean ok,String msg){if(!ok)throw new AssertionError(msg);}
    static boolean failed(Throwing action){try{action.run();return false;}catch(Exception expected){return true;}}
    interface Throwing{void run() throws Exception;}
    public static void main(String[] args) throws Exception {
        byte[] utf8="中文、😀、English".getBytes(StandardCharsets.UTF_8);
        check(NativeStoryRepository.readBounded(new ByteArrayInputStream(utf8)).equals("中文、😀、English"),"UTF-8 reading");
        InputStream broken=new InputStream(){
            public int read(){return 0;}
            @Override public int read(byte[] b,int offset,int len){return 0;}
        };
        check(failed(()->NativeStoryRepository.readBounded(broken)),"repeated zero-length reads must terminate");
        check(NativeImePolicy.decide(true,false)==NativeImePolicy.StageDecision.STASH_CANDIDATE,
            "composing candidate gets stashed");
        check(NativeImePolicy.decide(true,true)==NativeImePolicy.StageDecision.STASH_CANDIDATE,
            "composing candidate survives storage failure");
        check(NativeImePolicy.decide(false,true)==NativeImePolicy.StageDecision.KEEP_PENDING_BLOCKED,
            "storage failure must preserve pending candidate");
        check(NativeImePolicy.decide(false,false)==NativeImePolicy.StageDecision.COMMIT_CONFIRMED,
            "commit decision only after composition and write guards");
        check(!NativeImePolicy.mayCommit(true,false),"IME candidate must not commit to chapter.text");
        check(NativeImePolicy.mayCommit(false,false),"confirmed text may commit");
        check(!NativeImePolicy.mayCommit(false,true),"blocked writes must not commit");
        check(NativeImePolicy.pendingCandidate("abc-zhongwen-abc",4,12).equals("zhongwen"),"candidate is separate from confirmed text");
        check(NativeImePolicy.pendingCandidate("abc",-1,3).isEmpty(),"invalid candidate bounds ignored");
        check(failed(()->NativeStoryRepository.readBounded(new ByteArrayInputStream(new byte[]{(byte)0xE4,(byte)0xB8}))),"reject malformed UTF-8");
        check(NativeStoryRepository.readBounded(new ByteArrayInputStream("\uFEFF{\"projects\":[]}".getBytes(StandardCharsets.UTF_8))).startsWith("{"),"strip UTF-8 BOM");
        check(failed(()->NativeStoryRepository.readBounded(new ByteArrayInputStream(new byte[64*1024*1024+1]))),"64MB read cap");
        File dir=Files.createTempDirectory("storyweave-native-repo-").toFile();
        try {
            NativeStoryRepository repo=new NativeStoryRepository(new Context(dir));
            check(repo.read().optJSONArray("projects").length()==0,"new library");
            repo.save("{\"projects\":[]}");
            check(repo.read().optJSONArray("projects").length()==0,"atomic write/read");
            check(failed(()->repo.save("{}")),"reject malformed JSON");
            check(Files.readString(new File(dir,"native-tablet-library.json").toPath()).equals("{\"projects\":[]}"),"prior version preserved");
            File base=new File(dir,"native-tablet-library.json");
            check(base.delete(),"remove base for crash-sentinel test");
            Files.writeString(new File(dir,"native-tablet-library.json.new").toPath(),"partial");
            check(failed(()->repo.read()),"unfinished .new must not be treated as empty install");
            // Recovery must retain the byte-identical source AND sidecar archive.
            File badBase=new File(dir,"native-tablet-library.json");
            Files.writeString(badBase.toPath(),"BROKEN-ORIGINAL",StandardCharsets.UTF_8);
            File oldSidecar=new File(dir,"native-tablet-library.json.new");
            Files.writeString(oldSidecar.toPath(),"UNFINISHED-WRITE",StandardCharsets.UTF_8);
            check(failed(()->repo.recoverFromBackup("{}")),"invalid import must not touch a damaged original");
            check(Files.readString(badBase.toPath()).equals("BROKEN-ORIGINAL"),"invalid recovery left original unchanged");
            File rescued=repo.recoverFromBackup("{\"projects\":[]}");
            check(rescued!=null && rescued.isFile(),"recovery archive created");
            check(Files.readString(rescued.toPath()).equals("BROKEN-ORIGINAL"),"original bytes archived");
            check(Files.readString(new File(rescued.getPath()+".new").toPath()).equals("UNFINISHED-WRITE"),"sidecar bytes archived");
            check(repo.read().optJSONArray("projects").length()==0,"recovered library readable");
        }finally {
            File[] children=dir.listFiles();if(children!=null)for(File file:children)file.delete();dir.delete();
        }
        System.out.println("PASS: Java repository and IME policy tests (JVM stubs): zero-length reads, Unicode, invalid-write protection, atomic read/write, candidate isolation");
    }
}
EOF
javac -encoding UTF-8 -d "$TEMP/classes" "$MAIN" "$IME" $(find "$TEMP" -name '*.java')
java -cp "$TEMP/classes" com.storyweave.studio.RepoTest
