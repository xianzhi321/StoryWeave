package com.storyweave.app.data.ai

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaTypeOrNull

/**
 * Cloud AI client.
 *
 * - Endpoint/key rules come from [AiRules] (same behaviour as the Web build).
 * - The key is stored in EncryptedSharedPreferences (Android Keystore-backed),
 *   keyed by base address, mirroring the Web build's "key per address, never in
 *   the manuscript backup" rule.
 * - One synchronous OkHttp call per request with the same timeouts as the Web
 *   bridge (chat 85 s read / models 15 s read).
 */
class AiClient(private val context: Context) {

    private val http = okhttp3.OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(85, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    private val prefs by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "storyweave_ai_keys",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    // ---- credential storage --------------------------------------------

    fun savedKey(base: String): String = prefs.getString(keyName(base), "") ?: ""

    fun storeKey(base: String, rawKey: String) {
        val key = AiRules.validatedKey(rawKey)
        prefs.edit().putString(keyName(base), key).apply()
    }

    fun clearKey(base: String) {
        prefs.edit().remove(keyName(base)).apply()
    }

    private fun keyName(base: String) = "key:" + AiRules.baseAddress(base)

    // ---- requests --------------------------------------------------------

    suspend fun listModels(base: String, key: String): List<ModelEntry> = withContext(Dispatchers.IO) {
        val trimmedBase = AiRules.baseAddress(base)
        val request = okhttp3.Request.Builder()
            .url("$trimmedBase/models")
            .header("Accept", "application/json")
            .apply { if (key.isNotEmpty()) header("Authorization", "Bearer $key") }
            .get()
            .build()
        val response = http.newCall(request).execute()
        response.use {
            val text = if (it.isSuccessful) it.body?.string().orEmpty() else ""
            if (!it.isSuccessful) throw IllegalStateException(AiRules.statusMessage(it.code, "models"))
            AiRules.extractModels(text)
        }
    }

    suspend fun chat(
        base: String,
        key: String,
        model: String,
        system: String,
        user: String,
        maxTokens: Int,
        purpose: String
    ): String = withContext(Dispatchers.IO) {
        val trimmedBase = AiRules.baseAddress(base)
        val body = AiRules.chatRequest(model, system, user, maxTokens, 0.75, purpose)
        val request = okhttp3.Request.Builder()
            .url("$trimmedBase/chat/completions")
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .apply { if (key.isNotEmpty()) header("Authorization", "Bearer $key") }
            .post(okhttp3.RequestBody.create("application/json; charset=utf-8".toMediaTypeOrNull(), body))
            .build()
        val response = http.newCall(request).execute()
        response.use {
            val text = if (it.isSuccessful) it.body?.string().orEmpty() else ""
            if (!it.isSuccessful) throw IllegalStateException(AiRules.statusMessage(it.code, "chat"))
            AiRules.extractChatText(text, purpose)
        }
    }
}
