package com.storyweave.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ManuscriptSplitterTest {

    @Test
    fun `blank text yields a single empty chapter`() {
        val result = ManuscriptSplitter.split("")
        assertEquals(1, result.size)
        assertEquals("", result[0].text)
    }

    @Test
    fun `no heading yields whole book as one chapter`() {
        val raw = "这是一段没有章节标题的正文，\n第二行继续。"
        val result = ManuscriptSplitter.split(raw, "未分章")
        assertEquals(1, result.size)
        assertEquals("未分章", result[0].title)
        assertEquals(raw, result[0].text)
    }

    @Test
    fun `chinese numbered chapters are split`() {
        val raw = """
楔子 内容在卷首。

第一章 · 雾起
林澈拆开信。

第二章 旧钟楼
沈雾在门外。

第三章 回声
谁也没有说话。
""".trimIndent()
        val result = ManuscriptSplitter.split(raw)
        assertEquals(4, result.size) // 卷首 + 3 章
        assertTrue(result[0].title.contains("楔子"))
        assertEquals("第一章 · 雾起", result[1].title)
        assertTrue(result[1].text.contains("林澈拆开信"))
        assertEquals("第二章 旧钟楼", result[2].title)
        assertEquals("第三章 回声", result[3].title)
        assertTrue(result[3].text.contains("谁也没有说话"))
    }

    @Test
    fun `crlf is normalised`() {
        val raw = "第一章 甲\r\n正文一\r\n第二章 乙\r\n正文二"
        val result = ManuscriptSplitter.split(raw)
        assertEquals(2, result.size)
        assertTrue(result[0].text.contains("正文一"))
        assertFalseCrlf(result)
    }

    @Test
    fun `english chapter headings are supported`() {
        val raw = "Chapter 1 The Beginning\nA\nChapter 2 The End\nB"
        val result = ManuscriptSplitter.split(raw)
        assertEquals(2, result.size)
        assertEquals("Chapter 1 The Beginning", result[0].title)
        assertTrue(result[1].text.contains("B"))
    }

    @Test
    fun `all text survives splitting when concatenated`() {
        val raw = "第一章 甲\n正文一\n第二章 乙\n正文二"
        val result = ManuscriptSplitter.split(raw)
        val joined = result.joinToString("\n") { it.title + "\n" + it.text }
        for (word in listOf("正文一", "正文二")) {
            assertTrue(joined.contains(word))
        }
    }

    private fun assertFalseCrlf(result: List<ManuscriptSplitter.Chapter>) {
        for (chapter in result) {
            assertTrue(!chapter.text.contains("\r"))
        }
    }
}
