package com.storyweave.app.data.ai

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * AI request rules must match the Web build's cloud-ai.js, otherwise the same
 * key/endpoint pair behaves differently on the two clients. The cross-validation
 * test compares against the Web engine's actual output on one shared input.
 */
class AiRulesTest {

    // ---------- baseAddress ----------

    @Test
    fun `base normalises trailing segments and defaults`() {
        assertEquals("https://api.openai.com/v1", AiRules.baseAddress("https://api.openai.com/v1/"))
        assertEquals(
            "https://api.openai.com/v1",
            AiRules.baseAddress("https://api.openai.com/v1/chat/completions")
        )
        assertEquals("https://api.openai.com/v1", AiRules.baseAddress("https://api.openai.com/v1/models/"))
    }

    @Test
    fun `http is only allowed on loopback`() {
        assertEquals("http://127.0.0.1:8686/v1", AiRules.baseAddress("http://127.0.0.1:8686/v1"))
        assertEquals("http://localhost:9000", AiRules.baseAddress("http://localhost:9000"))
        assertFailsMessage("接口须使用 HTTPS 或手机回环地址，且地址中不能包含密钥、查询参数或片段") {
            AiRules.baseAddress("http://api.example.com/v1")
        }
    }

    @Test
    fun `credentials query fragment are rejected`() {
        assertFailsMessage("接口须使用 HTTPS 或手机回环地址，且地址中不能包含密钥、查询参数或片段") {
            AiRules.baseAddress("https://api.openai.com/v1?key=secret")
        }
        assertFailsMessage("接口须使用 HTTPS 或手机回环地址，且地址中不能包含密钥、查询参数或片段") {
            AiRules.baseAddress("https://user:pass@api.openai.com/v1")
        }
        assertFailsMessage("接口须使用 HTTPS 或手机回环地址，且地址中不能包含密钥、查询参数或片段") {
            AiRules.baseAddress("https://api.openai.com/v1#frag")
        }
    }

    @Test
    fun `incomplete urls are rejected`() {
        assertFailsMessage("请输入完整的 API 地址") { AiRules.baseAddress("api.openai.com/v1") }
        assertFailsMessage("请输入完整的 API 地址") { AiRules.baseAddress("") }
    }

    // ---------- key ----------

    @Test
    fun `pasted key is normalised like the web build`() {
        // Bearer prefix, quotes, zero-width marks and stray spaces all cleaned.
        assertEquals(
            "sk-abc123",
            AiRules.normalizePastedKey("Bearer sk-abc123")
        )
        assertEquals("sk-abc123", AiRules.normalizePastedKey("authorization: Bearer \"sk-abc123\""))
        assertEquals("sk-abc123", AiRules.normalizePastedKey(" sk-abc123 "))
    }

    @Test
    fun `redacted keys are rejected`() {
        assertFailsMessage("本机校验 · 请复制控制台提供的完整 API Key，或保留已保存的密钥") {
            AiRules.normalizePastedKey("sk-abc***")
        }
        assertFailsMessage("本机校验 · 请复制控制台提供的完整 API Key，或保留已保存的密钥") {
            AiRules.normalizePastedKey("••••••")
        }
    }

    @Test
    fun `keys with non printable characters are rejected`() {
        assertFailsMessage("本机校验 · API Key 含内部空白或非标准字符，请从控制台复制完整密钥") {
            AiRules.validatedKey("sk-abc def")
        }
    }

    // ---------- request body ----------

    @Test
    fun `chat body has model messages stream and limits`() {
        val body = AiRules.chatRequest("deepseek-chat", "系统提示", "用户输入", 1200, 0.75, "writing")
        assertTrue(body.contains("\"model\":\"deepseek-chat\""))
        assertTrue(body.contains("\"role\":\"system\""))
        assertTrue(body.contains("\"user\""))
        assertTrue(body.contains("\"stream\":false"))
        assertTrue(body.contains("\"max_tokens\":1200"))
        assertFalse(body.contains("thinking"))
        assertFalse(body.contains("response_format"))
    }

    @Test
    fun `deepseek probe disables thinking`() {
        val body = AiRules.chatRequest("deepseek-chat", "s", "u", 100, 0.75, "probe")
        assertTrue(body.contains("\"thinking\":{\"type\":\"disabled\"}"))
        assertFalse(body.contains("response_format"))
    }

    @Test
    fun `deepseek distillation also forces json output`() {
        val body = AiRules.chatRequest("deepseek-chat", "s", "u", 100, 0.75, "distillation")
        assertTrue(body.contains("\"thinking\":{\"type\":\"disabled\"}"))
        assertTrue(body.contains("\"response_format\":{\"type\":\"json_object\"}"))
    }

    @Test
    fun `bare deepseek model id is rejected`() {
        assertFailsMessage("DeepSeek 是服务商名称。请先拉取并选择具体模型 ID") {
            AiRules.chatRequest("DeepSeek", "s", "u", 100, 0.75, "probe")
        }
        assertFailsMessage("请先选择或填写模型 ID") {
            AiRules.chatRequest("", "s", "u", 100, 0.75, "probe")
        }
    }

    // ---------- response parsing ----------

    @Test
    fun `chat text is extracted from choices`() {
        val body = """
            {"choices":[{"message":{"role":"assistant","content":"你好，正文。"},"finish_reason":"stop"}]}
        """.trimIndent()
        assertEquals("你好，正文。", AiRules.extractChatText(body, "writing"))
    }

    @Test
    fun `reasoning only answer is rejected with the web message`() {
        val body = """
            {"choices":[{"message":{"role":"assistant","content":"","reasoning_content":"思考过程"},"finish_reason":"stop"}]}
        """.trimIndent()
        assertFailsMessage("模型未返回正文，可能在输出上限内只生成了推理内容") {
            AiRules.extractChatText(body, "writing")
        }
    }

    @Test
    fun `distillation with truncated output reports retry advice`() {
        val body = """
            {"choices":[{"message":{"role":"assistant","content":""},"finish_reason":"length"}]}
        """.trimIndent()
        assertFailsMessage("本段未返回完整分析。可关闭服务商思考模式或调整模型输出上限，再重试本段") {
            AiRules.extractChatText(body, "distillation")
        }
    }

    @Test
    fun `non json body is rejected`() {
        assertFailsMessage("服务商返回的内容不是 JSON，请确认填写的是 API 地址") {
            AiRules.extractChatText("<html>error</html>", "writing")
        }
    }

    @Test
    fun `models list is sorted and deduped`() {
        val body = """
            {"data":[{"id":"m-b","name":"Beta"},{"id":"m-a"},{"id":"m-b"},{"id":"m-c","name":"Gamma"}]}
        """.trimIndent()
        val models = AiRules.extractModels(body)
        assertEquals(listOf("m-a", "m-b", "m-c"), models.map { it.id })
        assertEquals("", models.first { it.id == "m-a" }.name)
        assertEquals("Beta", models.first { it.id == "m-b" }.name)
    }

    @Test
    fun `status messages match the web table`() {
        assertEquals("HTTP 401 · 鉴权失败，请检查当前地址对应的 API Key", AiRules.statusMessage(401, "chat"))
        assertEquals("HTTP 404 · 未找到模型列表。可手填模型 ID 后测试", AiRules.statusMessage(404, "models"))
        assertEquals("HTTP 404 · 未找到模型或对话接口，请核对 API 地址和模型 ID", AiRules.statusMessage(404, "chat"))
    }

    // ---------- helpers ----------

    private fun assertFailsMessage(message: String, block: () -> Unit) {
        try {
            block()
            throw AssertionError("期望抛出「$message」但没有抛出")
        } catch (error: IllegalArgumentException) {
            assertEquals(message, error.message)
        } catch (error: IllegalStateException) {
            assertEquals(message, error.message)
        }
    }
}
