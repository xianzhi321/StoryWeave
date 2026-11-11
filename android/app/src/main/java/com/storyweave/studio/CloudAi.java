package com.storyweave.studio;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.net.URI;
import java.security.KeyStore;
import java.util.HashMap;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import static java.nio.charset.StandardCharsets.UTF_8;

/** The native credential never needs to be returned to JavaScript. */
final class CloudAi {
    private static final String ALIAS = "storyweave.cloud.aes";
    private final SharedPreferences vault;
    private final Map<String, String> session = new HashMap<>();

    CloudAi(Context context) {
        vault = context.getSharedPreferences("cloud_credentials", Context.MODE_PRIVATE);
    }

    static void validateBase(String base) throws Exception {
        if (base == null || base.length() > 2048 || base.endsWith("/")) throw new Exception("接口地址无效");
        URI uri = new URI(base);
        String host = uri.getHost();
        boolean allowed = "https".equals(uri.getScheme()) ||
            ("http".equals(uri.getScheme()) && ("127.0.0.1".equals(host) || "localhost".equals(host)));
        if (!allowed || host == null || uri.getRawUserInfo() != null ||
            uri.getRawQuery() != null || uri.getRawFragment() != null) throw new Exception("接口地址无效");
    }

    static boolean validKey(String key) {
        return key != null && key.length() <= 4096 && key.chars().allMatch(ch -> ch >= 33 && ch <= 126);
    }

    synchronized String state(String base) {
        if (session.containsKey(base)) return "session";
        return vault.contains(base) ? "saved" : "missing";
    }

    synchronized void save(String base, String key, boolean remember) throws Exception {
        validateBase(base);
        if (!validKey(key)) throw new Exception("API Key 格式无效");
        SharedPreferences.Editor edit = vault.edit();
        if (remember && !key.isEmpty()) {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, encryptionKey(true));
            cipher.updateAAD(base.getBytes(UTF_8));
            String iv = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP);
            String encrypted = Base64.encodeToString(cipher.doFinal(key.getBytes(UTF_8)), Base64.NO_WRAP);
            edit.putString(base, iv + "." + encrypted);
        } else edit.remove(base);
        if (!edit.commit()) throw new Exception("设备未能保存密钥");
        if (!remember && !key.isEmpty()) session.put(base, key);
        else session.remove(base);
    }

    synchronized String load(String base) throws Exception {
        if (session.containsKey(base)) return session.get(base);
        String record = vault.getString(base, "");
        if (record.isEmpty()) return "";
        try {
            String[] fields = record.split("\\.", 2);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, encryptionKey(false),
                new GCMParameterSpec(128, Base64.decode(fields[0], Base64.NO_WRAP)));
            cipher.updateAAD(base.getBytes(UTF_8));
            return new String(cipher.doFinal(Base64.decode(fields[1], Base64.NO_WRAP)), UTF_8);
        } catch (Exception error) {
            throw new Exception("本机保存的 API Key 无法读取，请重新输入");
        }
    }

    private SecretKey encryptionKey(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        SecretKey key = (SecretKey) store.getKey(ALIAS, null);
        if (key != null) return key;
        if (!create) throw new Exception("设备加密密钥已失效");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build());
        return generator.generateKey();
    }
}
