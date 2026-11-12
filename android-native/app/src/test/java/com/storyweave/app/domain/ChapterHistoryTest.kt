package com.storyweave.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ChapterHistoryTest {

    private fun entry(id: String, at: String, title: String = "T", text: String = "X") =
        ChapterHistory.Entry(id, at, title, text)

    @Test
    fun `newest first insert`() {
        val h = ChapterHistory.push(emptyList(), entry("a", "d1"))
        val h2 = ChapterHistory.push(h, entry("b", "d2"))
        assertEquals("b", h2[0].id)
        assertEquals("a", h2[1].id)
    }

    @Test
    fun `capped at thirty like the web build`() {
        var h = emptyList<ChapterHistory.Entry>()
        for (i in 1..35) h = ChapterHistory.push(h, entry("e$i", "d$i"))
        assertEquals(30, h.size)
        assertEquals("e35", h[0].id)
        assertEquals("e6", h[29].id)
    }

    @Test
    fun `decode encode round trip`() {
        val original = listOf(
            entry("h-1", "2026-11-12T10:00", "第一章（旧）", "旧文本"),
            entry("h-2", "2026-11-12T09:00", "第一章（更旧）", "更旧文本")
        )
        val json = ChapterHistory.encode(original)
        val decoded = ChapterHistory.decode(json)
        assertEquals(original, decoded)
    }

    @Test
    fun `malformed history decodes to empty like the web build fallback`() {
        assertEquals(emptyList<ChapterHistory.Entry>(), ChapterHistory.decode("not json"))
        assertEquals(emptyList<ChapterHistory.Entry>(), ChapterHistory.decode("[]"))
    }
}

class GlobalSearchTest {

    @Test
    fun `empty query returns nothing`() {
        assertTrue(GlobalSearch.search("  ", emptyList(), emptyMap(), emptyList(), emptyList()).isEmpty())
    }

    @Test
    fun `matches title text characters and events`() {
        val hits = GlobalSearch.search(
            "列车",
            chapters = listOf("c-1" to "第一章", "c-2" to "失踪列车之谜"),
            chapterTexts = mapOf("c-1" to "站台上停着那趟失踪的列车。"),
            characters = listOf("r-1" to "列车长"),
            events = listOf("t-1" to "列车失踪事件")
        )
        val kinds = hits.map { it.kind to it.title }
        assertTrue(kinds.contains(Pair("chapter", "失踪列车之谜")))
        assertTrue(kinds.contains(Pair("character", "列车长")))
        assertTrue(kinds.contains(Pair("event", "列车失踪事件")))
        // c-1 的正文命中带上下文摘录
        val textHit = hits.first { it.id == "c-1" }
        assertTrue(textHit.detail.contains("列车"))
    }

    @Test
    fun `no match returns nothing`() {
        val hits = GlobalSearch.search(
            "不存在的词",
            chapters = listOf("c-1" to "第一章"),
            chapterTexts = mapOf("c-1" to "正文"),
            characters = listOf("r-1" to "某人"),
            events = emptyList()
        )
        assertTrue(hits.isEmpty())
    }
}
