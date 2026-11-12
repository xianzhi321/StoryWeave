package com.storyweave.app.ui.p1

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Editor helpers that must match the Web build's behaviour exactly, otherwise
 * word counts drift between the two clients.
 */
class EditorLogicTest {

    @Test
    fun `char count ignores all whitespace`() {
        assertEquals(4, charCount("雾 从\n河\t面"))
        assertEquals(0, charCount("   \n\t "))
        assertEquals(0, charCount(""))
    }

    @Test
    fun `char count matches web behaviour for cjk punctuation`() {
        // Verified against the Web build's count(): only \s is stripped, so
        // punctuation and full-width brackets all count.
        assertEquals(7, charCount("他说：“走吧”"))
    }

    @Test
    fun `full width space is stripped like the web build`() {
        // JS \s matches U+3000; Kotlin isWhitespace() must agree or counts drift.
        assertEquals(2, charCount("a\u3000b"))
        assertEquals(0, charCount("\u3000"))
    }

    @Test
    fun `char count is stable for long paragraphs`() {
        val paragraph = "雾从河面升起时，钟楼刚敲过六下。"
        assertEquals(paragraph.length, charCount(paragraph))
        assertEquals(paragraph.length * 100, charCount(paragraph.repeat(100)))
    }

    @Test
    fun `composition state is false for empty editable`() {
        assertEquals(false, isComposing(null))
    }
}
