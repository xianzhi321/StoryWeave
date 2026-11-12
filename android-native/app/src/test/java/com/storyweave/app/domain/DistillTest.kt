package com.storyweave.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The sampling must come from the beginning, middle AND late-middle of the
 * book — only sampling the opening would let the model miss how the style
 * actually develops. Mirrors balancedSamples().
 */
class DistillTest {

    private fun book(size: Int): String {
        val sb = StringBuilder()
        for (i in 0 until size) sb.append(('A' + (i % 26)))
        return sb.toString()
    }

    @Test
    fun `short book is returned as is`() {
        assertEquals("abc", Distill.balancedSamples("abc", 14000))
    }

    @Test
    fun `long book is sampled from four positions`() {
        val text = book(100000)
        val sample = Distill.balancedSamples(text, 14000)
        // Each slice is labelled with its position in the book.
        assertTrue(sample.contains("[片段 1，约位于全文 0% 位置]"))
        assertTrue(sample.contains("[片段 2，约位于全文 33% 位置]"))
        assertTrue(sample.contains("[片段 3，约位于全文 66% 位置]"))
        assertTrue(sample.contains("[片段 4，约位于全文 93% 位置]"))
        // Total length = 4 slices + labels + separators; each slice ≤ 3500.
        val sliceLength = 14000 / 4
        assertTrue(sample.length < 14000 + 400)
        // Slice 2 really comes from ~33%: its first body char matches the book's.
        val marker = "[片段 2，约位于全文 33% 位置]\n"
        val i2 = sample.indexOf(marker) + marker.length
        val expected = text[(100000 * 0.33).toInt()]
        assertEquals(expected, sample[i2])
    }

    // ---------- candidate skill parsing ----------

    @Test
    fun `valid skills are parsed and capped at seven`() {
        val one = """{"title":"节奏控制","category":"叙事","description":"x","rules":["r1","r2"],"evidence":"e"}"""
        val reply = "{\"skills\":[" + (1..10).joinToString(",") { one } + "]}"
        val skills = Distill.parseSkills(reply)
        assertEquals(7, skills.size)
        assertEquals("节奏控制", skills[0].title)
        assertEquals(listOf("r1", "r2"), skills[0].rules)
    }

    @Test
    fun `entries without title or rules are dropped`() {
        val reply = """
            {"skills":[
              {"title":"只有标题"},
              {"rules":["只有规则"],"title":"","category":"x"},
              {"title":"完整项","rules":["r"],"description":"d"}
            ]}
        """.trimIndent()
        val skills = Distill.parseSkills(reply)
        assertEquals(1, skills.size)
        assertEquals("完整项", skills[0].title)
    }

    @Test
    fun `missing skills array or bad json is rejected with the web message`() {
        assertFails("AI 返回的格式不正确") { Distill.parseSkills("{\"x\":1}") }
        assertFails("AI 返回的格式不正确") { Distill.parseSkills("not json") }
    }

    @Test
    fun `code fences are stripped`() {
        val reply = "```json\n{\"skills\":[{\"title\":\"T\",\"rules\":[\"r\"]}]}\n```"
        assertEquals(1, Distill.parseSkills(reply).size)
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
