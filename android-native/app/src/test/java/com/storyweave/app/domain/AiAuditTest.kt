package com.storyweave.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlinx.serialization.json.Json

/**
 * The AI findings gate must behave exactly like the Web build's
 * parseAuditFindings(): a model cannot invent locations — every finding must
 * quote the chapter verbatim, inside the selected range, with sane lengths.
 */
class AiAuditTest {

    private val chapters = listOf(
        AiAudit.ChapterRef("ch-1", "第一章", "雾从河面升起时，钟楼刚敲过六下。林澈拆开那封信。"),
        AiAudit.ChapterRef("ch-2", "第二章", "沈雾把录音带放在桌上，谁也没有说话。")
    )
    private val selected = listOf("ch-1", "ch-2")

    @Test
    fun `valid finding with verbatim quote is accepted`() {
        val reply = """
            {"findings":[{"chapterId":"ch-1","severity":"warning","title":"信件时间矛盾",
            "detail":"信封提到十三年前，但本章写的是十二年前。","suggestion":"统一年份。",
            "quote":"钟楼刚敲过六下。林澈拆"}]}
        """.trimIndent()
        val result = AiAudit.parseFindings(reply, chapters, selected)
        assertEquals(1, result.valid.size)
        assertEquals(0, result.rejectedCount)
        assertEquals(8, result.valid[0].offset)
        assertEquals("warning", result.valid[0].severity)
    }

    @Test
    fun `quote not in chapter text is rejected`() {
        val reply = """
            {"findings":[{"chapterId":"ch-1","severity":"warning","title":"标题够长",
            "detail":"细节描述足够长，超过十二个字。","suggestion":"改写。",
            "quote":"这段话原文里不存在"}]}
        """.trimIndent()
        val result = AiAudit.parseFindings(reply, chapters, selected)
        assertEquals(0, result.valid.size)
        assertEquals(1, result.rejectedCount)
    }

    @Test
    fun `quote shorter than eight chars is rejected`() {
        val reply = """
            {"findings":[{"chapterId":"ch-1","severity":"warning","title":"标题够长",
            "detail":"细节描述足够长，超过十二个字。","suggestion":"改写。",
            "quote":"钟楼刚敲"}]}
        """.trimIndent()
        val result = AiAudit.parseFindings(reply, chapters, selected)
        assertEquals(1, result.rejectedCount)
    }

    @Test
    fun `unselected chapter is rejected`() {
        val reply = """
            {"findings":[{"chapterId":"ch-9","severity":"warning","title":"标题够长",
            "detail":"细节描述足够长，超过十二个字。","suggestion":"改写。",
            "quote":"雾从河面升起时，钟楼刚敲"}]}
        """.trimIndent()
        val result = AiAudit.parseFindings(reply, chapters, selected)
        assertEquals(1, result.rejectedCount)
    }

    @Test
    fun `invalid severity is rejected`() {
        val reply = """
            {"findings":[{"chapterId":"ch-1","severity":"毁灭性","title":"标题够长",
            "detail":"细节描述足够长，超过十二个字。","suggestion":"改写。",
            "quote":"雾从河面升起时，钟楼刚敲"}]}
        """.trimIndent()
        val result = AiAudit.parseFindings(reply, chapters, selected)
        assertEquals(1, result.rejectedCount)
    }

    @Test
    fun `short title or detail is rejected`() {
        val reply = """
            {"findings":[{"chapterId":"ch-1","severity":"warning","title":"短",
            "detail":"太短。","suggestion":"","quote":"雾从河面升起时，钟楼刚敲"}]}
        """.trimIndent()
        val result = AiAudit.parseFindings(reply, chapters, selected)
        assertEquals(1, result.rejectedCount)
    }

    @Test
    fun `code fences are stripped before parsing`() {
        val reply = "```json\n" + """
            {"findings":[{"chapterId":"ch-2","severity":"notice","title":"对白缺少回应方",
            "detail":"桌上的录音带没有引发任何一方回应。","suggestion":"补一条反应。",
            "quote":"沈雾把录音带放在桌上"}]}
        """.trimIndent() + "\n```"
        val result = AiAudit.parseFindings(reply, chapters, selected)
        assertEquals(1, result.valid.size)
        assertTrue(result.valid[0].suggestion.contains("补一条"))
    }

    @Test
    fun `findings capped at fifteen`() {
        val one = """{"chapterId":"ch-1","severity":"info","title":"第 N 条审查发现",
        "detail":"细节描述足够长，超过十二个字。","suggestion":"可选建议。",
        "quote":"雾从河面升起时，钟楼刚敲过"}"""
        val reply = "{\"findings\":[" + (1..20).joinToString(",") { one } + "]}"
        val result = AiAudit.parseFindings(reply, chapters, selected)
        assertEquals(15, result.valid.size)
    }

    @Test
    fun `missing findings array is rejected with the web message`() {
        assertFails("AI 结果缺少 findings 数组") { AiAudit.parseFindings("{\"x\":1}", chapters, selected) }
        assertFails("AI 未返回合法 JSON") { AiAudit.parseFindings("不是 JSON", chapters, selected) }
    }

    // ---------- payload ----------

    @Test
    fun `payload caps chapters and truncates text`() {
        val many = (1..8).map { AiAudit.ChapterRef("ch-$it", "第${it}章", "字".repeat(9000)) }
        val payload = AiAudit.buildPayload(
            "测试书", "悬疑", "简介",
            many, emptyList(), emptyList(), emptyList(), emptyList()
        )
        val root = Json.parseToJsonElement(payload.toString()) as kotlinx.serialization.json.JsonObject
        val chapters = root["chapters"] as kotlinx.serialization.json.JsonArray
        assertEquals(5, chapters.size)
        val first = chapters[0] as kotlinx.serialization.json.JsonObject
        val text = (first["text"] as kotlinx.serialization.json.JsonPrimitive).content
        assertEquals(2800, text.length) // 14000 / 5
        assertTrue((first["truncated"] as kotlinx.serialization.json.JsonPrimitive).content == "true")
    }

    private fun assertFails(message: String, block: () -> Unit) {
        try {
            block()
            throw AssertionError("期望抛出「$message」")
        } catch (error: IllegalStateException) {
            assertEquals(message, error.message)
        }
    }
}
