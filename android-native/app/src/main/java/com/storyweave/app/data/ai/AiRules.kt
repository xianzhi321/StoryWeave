package com.storyweave.app.data.ai

/**
 * OpenAI-compatible cloud AI client rules, ported 1:1 from the Web build's
 * cloud-ai.js. Pure logic (no OkHttp call here) so every validation and parse
 * path is testable on the JVM.
 */
object AiRules {

    const val DEEPSEEK_BASE = "https://api.deepseek.com"

    /**
     * Normalises the endpoint exactly like baseAddress():
     * HTTPS only (or http on loopback), no credentials/query/fragment,
     * trailing /chat/completions and /models stripped, ≤2048 chars.
     */
    fun baseAddress(input: String): String {
        val trimmed = input.trim()
        val url = try {
            java.net.URI(trimmed)
        } catch (_: Exception) {
            throw IllegalArgumentException("请输入完整的 API 地址")
        }
        // JS new URL() throws when there is no scheme at all, so a bare host
        // must fail with the same message instead of a scheme error.
        val scheme = url.scheme?.lowercase() ?: ""
        val host = url.host ?: ""
        if (host.isEmpty() || scheme !in listOf("http", "https")) {
            throw IllegalArgumentException("请输入完整的 API 地址")
        }
        val loopback = host == "localhost" || host == "127.0.0.1"
        if ((scheme != "https" && !(scheme == "http" && loopback)) ||
            !url.userInfo.isNullOrEmpty() || !url.query.isNullOrEmpty() || !url.fragment.isNullOrEmpty()
        ) {
            throw IllegalArgumentException("接口须使用 HTTPS 或手机回环地址，且地址中不能包含密钥、查询参数或片段")
        }
        if (host.isEmpty()) throw IllegalArgumentException("请输入完整的 API 地址")
        val rawPath = url.path.orEmpty().trimEnd('/')
            .replace(Regex("/(?:chat/completions|models)$"), "").trimEnd('/')
        val port = if (url.port !in listOf(-1, 443, 80)) ":${url.port}" else ""
        val result = "${url.scheme}://$host$port$rawPath"
        if (result.length > 2048) throw IllegalArgumentException("API 地址过长")
        return result
    }

    fun isDeepSeek(base: String): Boolean =
        base == DEEPSEEK_BASE || base == DEEPSEEK_BASE + "/v1"

    /** Same rule as validatedKey(): printable ASCII only, ≤4096. */
    fun validatedKey(key: String): String {
        if (key.length > 4096 || Regex("[^!-~]").containsMatchIn(key)) {
            throw IllegalArgumentException("本机校验 · API Key 含内部空白或非标准字符，请从控制台复制完整密钥")
        }
        return key
    }

    private val INVISIBLE = Regex("[­​­‏  ﻿⁠⁦-⁯﻿]")

    private fun unwrap(text: String, open: Char, close: Char): String =
        if (text.length > 1 && text.first() == open && text.last() == close) text.drop(1).dropLast(1).trim() else text

    /**
     * Same cleanup as normalizePastedKey(): strip zero-width characters and
     * direction marks, unwrap quotes, drop a pasted "Bearer" prefix, reject
     * redacted/partial keys.
     */
    fun normalizePastedKey(input: String): String {
        if (input.isEmpty()) return ""
        var key = INVISIBLE.replace(input, "").trim()
        key = unwrap(key, '"', '"')
        key = unwrap(key, '\'', '\'')
        key = unwrap(key, '“', '”')
        key = unwrap(key, '‘', '’')
        key = unwrap(key, '「', '」')
        key = key.replace(Regex("^(?:authorization\\s*:\\s*)?bearer(?:\\s+|$)", RegexOption.IGNORE_CASE), "").trim()
        for (pair in listOf('"' to '"', '\'' to '\'', '“' to '”', '‘' to '’', '「' to '」')) {
            key = unwrap(key, pair.first, pair.second)
        }
        if (key.isEmpty() || Regex("[•●…]").containsMatchIn(key) ||
            Regex("^[*·]+$").containsMatchIn(key) ||
            Regex("^sk-[A-Za-z0-9_-]*\\*{3,}$").containsMatchIn(key)
        ) {
            throw IllegalArgumentException("本机校验 · 请复制控制台提供的完整 API Key，或保留已保存的密钥")
        }
        return validatedKey(key)
    }

    /** Chat request body, mirroring the Web build's completion(): options only
     *  apply to DeepSeek and only for probe/distillation purposes. */
    fun chatRequest(
        model: String,
        system: String,
        user: String,
        maxTokens: Int,
        temperature: Double,
        purpose: String
    ): String {
        if (model.isBlank()) throw IllegalArgumentException("请先选择或填写模型 ID")
        if (Regex("^deepseek$", RegexOption.IGNORE_CASE).matches(model)) {
            throw IllegalArgumentException("DeepSeek 是服务商名称。请先拉取并选择具体模型 ID")
        }
        val json = kotlinx.serialization.json.buildJsonObject {
            put("model", kotlinx.serialization.json.JsonPrimitive(model))
            put("messages", kotlinx.serialization.json.buildJsonArray {
                add(kotlinx.serialization.json.buildJsonObject {
                    put("role", kotlinx.serialization.json.JsonPrimitive("system"))
                    put("content", kotlinx.serialization.json.JsonPrimitive(system))
                })
                add(kotlinx.serialization.json.buildJsonObject {
                    put("role", kotlinx.serialization.json.JsonPrimitive("user"))
                    put("content", kotlinx.serialization.json.JsonPrimitive(user))
                })
            })
            put("stream", kotlinx.serialization.json.JsonPrimitive(false))
            put("max_tokens", kotlinx.serialization.json.JsonPrimitive(maxTokens))
            put("temperature", kotlinx.serialization.json.JsonPrimitive(temperature))
            // DeepSeek-specific options mirror the Web build; the base check is
            // delegated to the caller through purpose-tagged rules.
            if (isDeepSeekPurpose(purpose)) {
                put("thinking", kotlinx.serialization.json.buildJsonObject {
                    put("type", kotlinx.serialization.json.JsonPrimitive("disabled"))
                })
            }
            if (purpose == "distillation") {
                put("response_format", kotlinx.serialization.json.buildJsonObject {
                    put("type", kotlinx.serialization.json.JsonPrimitive("json_object"))
                })
            }
        }
        return json.toString()
    }

    /** The Web build only adds thinking/response_format for DeepSeek bases. */
    fun isDeepSeekPurpose(purpose: String) = purpose == "probe" || purpose == "distillation"

    /** HTTP status → message, same table as readResponse(). */
    fun statusMessage(status: Int, route: String): String {
        val detail = when (status) {
            400 -> "模型 ID 或接口参数被拒绝，请核对服务商要求"
            401 -> "鉴权失败，请检查当前地址对应的 API Key"
            403 -> "访问被拒绝，请检查密钥权限"
            404 -> if (route == "models") "未找到模型列表。可手填模型 ID 后测试" else "未找到模型或对话接口，请核对 API 地址和模型 ID"
            405 -> "接口不支持此操作。若拉取列表失败，可手填模型 ID 后测试"
            429 -> "请求受限，请检查额度或稍后再试"
            in 300..399 -> "接口发生重定向，请填写最终 API 地址"
            else -> "服务商暂时无法完成请求"
        }
        return "HTTP $status · $detail"
    }

    /** chat/completions → assistant text; mirrors the Web build's content handling. */
    fun extractChatText(body: String, purpose: String): String {
        val root = try {
            kotlinx.serialization.json.Json.parseToJsonElement(body).jsonObjectSafe()
        } catch (_: Exception) {
            throw IllegalStateException("服务商返回的内容不是 JSON，请确认填写的是 API 地址")
        }
        val choices = root["choices"] as? kotlinx.serialization.json.JsonArray
            ?: throw IllegalStateException("服务商未返回对话结果")
        val choice = choices.firstOrNull() as? kotlinx.serialization.json.JsonObject
            ?: throw IllegalStateException("服务商未返回对话结果")
        val message = choice["message"] as? kotlinx.serialization.json.JsonObject
        val content = message?.get("content")
        val text = when {
            content is kotlinx.serialization.json.JsonPrimitive && content.isString -> content.content
            content is kotlinx.serialization.json.JsonArray -> content
                .mapNotNull { part -> (part as? kotlinx.serialization.json.JsonObject)?.get("text") }
                .filterIsInstance<kotlinx.serialization.json.JsonPrimitive>()
                .filter { it.isString }
                .joinToString("") { it.content }
            else -> ""
        }
        val finishReason = (choice["finish_reason"] as? kotlinx.serialization.json.JsonPrimitive)?.content
        val reasoning = (message?.get("reasoning_content") as? kotlinx.serialization.json.JsonPrimitive)?.content
        if (purpose == "distillation" && (finishReason == "length" || (text.isBlank() && !reasoning.isNullOrBlank()))) {
            throw IllegalStateException("本段未返回完整分析。可关闭服务商思考模式或调整模型输出上限，再重试本段")
        }
        if (text.isNotBlank()) return text
        if (!reasoning.isNullOrBlank() || finishReason == "length") {
            throw IllegalStateException("模型未返回正文，可能在输出上限内只生成了推理内容")
        }
        throw IllegalStateException("模型没有返回正文，请核对所选模型是否支持对话")
    }

    /** /models → sorted entries, mirroring modelEntries(). */
    fun extractModels(body: String): List<ModelEntry> {
        val root = try {
            kotlinx.serialization.json.Json.parseToJsonElement(body).jsonObjectSafe()
        } catch (_: Exception) {
            throw IllegalStateException("服务商返回的内容不是 JSON，请确认填写的是 API 地址")
        }
        val rawList: kotlinx.serialization.json.JsonArray = when {
            root["data"] is kotlinx.serialization.json.JsonArray -> root.getValue("data") as kotlinx.serialization.json.JsonArray
            root["models"] is kotlinx.serialization.json.JsonArray -> root.getValue("models") as kotlinx.serialization.json.JsonArray
            else -> kotlinx.serialization.json.Json.parseToJsonElement(body) as? kotlinx.serialization.json.JsonArray
                ?: throw IllegalStateException("服务商未返回可用的模型列表，可手填模型 ID 后测试")
        }
        val models = LinkedHashMap<String, String>()
        for (item in rawList) {
            val id = when (item) {
                is kotlinx.serialization.json.JsonPrimitive -> if (item.isString) item.content else null
                is kotlinx.serialization.json.JsonObject ->
                    (item["id"] as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it.isString }?.content
                else -> null
            }?.trim() ?: continue
            if (id.isEmpty() || id.length > 240) continue
            val name = (item as? kotlinx.serialization.json.JsonObject)
                ?.get("name")?.let { it as? kotlinx.serialization.json.JsonPrimitive }
                ?.takeIf { it.isString }?.content?.trim()?.take(120) ?: ""
            if (name.isNotEmpty() || !models.containsKey(id)) models[id] = name
        }
        return models.entries.sortedBy { it.key }.map { ModelEntry(it.key, it.value) }
    }

    private fun kotlinx.serialization.json.JsonElement.jsonObjectSafe(): kotlinx.serialization.json.JsonObject =
        this as? kotlinx.serialization.json.JsonObject
            ?: throw IllegalStateException("服务商返回的内容不是 JSON，请确认填写的是 API 地址")
}

data class ModelEntry(val id: String, val name: String)
