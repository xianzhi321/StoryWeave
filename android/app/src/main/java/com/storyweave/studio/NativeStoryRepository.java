package com.storyweave.studio;

import android.content.Context;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.util.HashSet;

/** Tablet-only local JSON repository; never reads or modifies the legacy WebView IndexedDB.
 *  AtomicFile keeps the previous good copy if writing fails midway.
 */
final class NativeStoryRepository {
    private static final int MAX_JSON_BYTES = 64 * 1024 * 1024;
    private final AtomicFile storage;

    NativeStoryRepository(Context context) {
        storage = new AtomicFile(new File(context.getFilesDir(), "native-tablet-library.json"));
    }

    synchronized JSONObject read() throws Exception {
        try (FileInputStream input = storage.openRead()) {
            return parse(readBounded(input));
        } catch (FileNotFoundException missing) {
            // AtomicFile.openRead() attempts its own crash/backup recovery first.
            // Only a truly absent library is interpreted as a new installation.
            if (!storage.getBaseFile().exists() &&
                    !new File(storage.getBaseFile().getPath() + ".bak").exists() &&
                    !new File(storage.getBaseFile().getPath() + ".new").exists()) {
                return emptyLibrary();
            }
            throw missing;
        }
    }

    synchronized void save(String text) throws Exception {
        // Check the byte limit before parsing: untrusted imports may be much larger
        // than the amount of heap available on older tablets.
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_JSON_BYTES) throw new IOException("作品库超过64 MB写入限制");
        parse(text); // Validate before touching the previous good copy.
        FileOutputStream output = null;
        try {
            output = storage.startWrite();
            output.write(bytes);
            storage.finishWrite(output);
        } catch (Exception failure) {
            if (output != null) storage.failWrite(output);
            throw failure;
        }
    }

    static String readBounded(java.io.InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] block = new byte[8192];
        int n;
        while ((n = in.read(block)) != -1) {
            if (n == 0) continue;
            if (n > MAX_JSON_BYTES - out.size()) throw new IOException("备份过大（上限64 MB）");
            out.write(block, 0, n);
        }
        // Reject malformed UTF-8 instead of silently replacing damaged manuscript bytes.
        try {
            String decoded = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(out.toByteArray())).toString();
            return decoded.startsWith("\uFEFF") ? decoded.substring(1) : decoded;
        } catch (CharacterCodingException invalid) {
            throw new IOException("备份文本不是有效的 UTF-8，已拒绝导入以避免乱码", invalid);
        }
    }

    static JSONObject parse(String content) throws JSONException {
        JSONObject value = new JSONObject(content);
        JSONArray works = value.optJSONArray("projects");
        if (works == null || works.length() > 2000) throw new JSONException("备份缺少作品列表或作品数超限");
        HashSet<String> workIds = new HashSet<>();
        for (int i = 0; i < works.length(); i++) {
            JSONObject project = works.optJSONObject(i);
            if (project == null || project.optString("id").isEmpty() ||
                    !(project.opt("title") instanceof String))
                throw new JSONException("第" + (i + 1) + "个作品格式不正确");
            if (!workIds.add(project.optString("id")))
                throw new JSONException("作品 ID 重复，导入可能覆盖错误作品");
            JSONArray chapters = project.optJSONArray("chapters");
            if (chapters == null || chapters.length() > 100000)
                throw new JSONException("作品章节列表格式不正确");
            HashSet<String> chapterIds = new HashSet<>();
            for (int j = 0; j < chapters.length(); j++) {
                JSONObject chapter = chapters.optJSONObject(j);
                if (chapter == null || chapter.optString("id").isEmpty() ||
                        !(chapter.opt("text") instanceof String))
                    throw new JSONException("章节正文格式不正确");
                if (!chapterIds.add(chapter.optString("id")))
                    throw new JSONException("章节 ID 重复，无法安全选择或编辑");
            }
        }
        // Keep all legacy sections (characters, settings, maps, skills, etc.) untouched.
        return value;
    }

    static JSONObject emptyLibrary() {
        JSONObject data = new JSONObject();
        try {
            data.put("version", 3);
            data.put("selected", JSONObject.NULL);
            data.put("projects", new JSONArray());
            for (String key : new String[]{"characters", "relations", "skills", "documents", "events", "plots", "sceneCards", "annotations"}) {
                data.put(key, new JSONArray());
            }
            data.put("settings", new JSONObject());
        } catch (JSONException impossible) { throw new IllegalStateException(impossible); }
        return data;
    }
}
