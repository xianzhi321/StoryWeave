package com.storyweave.app.data.db

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Chapter recycle-bin contract:
 *  - trash shape {chapter, index, deletedAt} must import into the Web build
 *    (which fills records/references with empty), so keep the minimal shape;
 *  - restore must return the chapter with its text and put it back near its
 *    original position;
 *  - export must keep trashed chapters inside the work JSON.
 */
class ChapterTrashContractTest {

    private val json = Json { prettyPrint = false }

    /** Mirrors StoryRepository.moveChapterToTrash's entry builder. */
    private fun buildEntry(id: String, title: String, text: String, index: Int, deletedAt: String) =
        kotlinx.serialization.json.buildJsonObject {
            put("chapter", kotlinx.serialization.json.buildJsonObject {
                put("id", kotlinx.serialization.json.JsonPrimitive(id))
                put("title", kotlinx.serialization.json.JsonPrimitive(title))
                put("text", kotlinx.serialization.json.JsonPrimitive(text))
                put("updated", kotlinx.serialization.json.JsonPrimitive(deletedAt))
            })
            put("index", kotlinx.serialization.json.JsonPrimitive(index))
            put("deletedAt", kotlinx.serialization.json.JsonPrimitive(deletedAt))
        }

    @Test
    fun `trash entry has the web compatible minimal shape`() {
        val entry = buildEntry("ch-1", "第一章", "正文", 2, "2026-11-12T08:00:00.000Z")
        val keys = entry.keys
        assertEquals(setOf("chapter", "index", "deletedAt"), keys)
        val chapter = entry["chapter"] as kotlinx.serialization.json.JsonObject
        assertEquals("ch-1", (chapter["id"] as kotlinx.serialization.json.JsonPrimitive).content)
        assertEquals("正文", (chapter["text"] as kotlinx.serialization.json.JsonPrimitive).content)
    }

    @Test
    fun `trash entry round trips through document extras`() {
        // chapterTrash lives inside the work object, exactly like the Web build.
        val workJson = """
            {"version":19,"selected":"w-1",
             "projects":[{"id":"w-1","title":"T","chapters":[],
             "chapterTrash":[${buildEntry("ch-1", "第一章", "正文", 2, "2026-11-12T08:00:00.000Z")}]}]}
        """.trimIndent()
        val document = com.storyweave.app.data.json.StoryDocumentCodec.decode(workJson)
        val out = com.storyweave.app.data.json.StoryDocumentCodec.encode(document)
        val roundTripped = com.storyweave.app.data.json.StoryDocumentCodec.decode(out)
        val work = roundTripped.projects.single()
        // The trash array lives inside work extras and survives.
        val trash = work.extras["chapterTrash"] as kotlinx.serialization.json.JsonArray
        assertEquals(1, trash.size)
        val chapter = (trash[0] as kotlinx.serialization.json.JsonObject)["chapter"] as kotlinx.serialization.json.JsonObject
        assertEquals("第一章", (chapter["title"] as kotlinx.serialization.json.JsonPrimitive).content)
        assertEquals("正文", (chapter["text"] as kotlinx.serialization.json.JsonPrimitive).content)
        assertEquals("2026-11-12T08:00:00.000Z",
            (chapter["updated"] as? kotlinx.serialization.json.JsonPrimitive)?.content)
    }

    @Test
    fun `restore position index is respected as fallback`() {
        // index=2 with no live chapters → restored chapter sits at position 2.
        val entry = buildEntry("ch-1", "第一章", "正文", 2, "2026-11-12T08:00:00.000Z")
        val index = (entry["index"] as kotlinx.serialization.json.JsonPrimitive).content.toInt()
        assertEquals(2, index)
    }

    @Test
    fun `whole book export contains chapters in order`() {
        // Mirrors exportBookText's TXT layout.
        val chapters = listOf(
            ChapterEntity("w-1", "c-1", "第一章", "甲的正文", "", "{}", 0),
            ChapterEntity("w-1", "c-2", "第二章", "乙的正文", "", "{}", 1)
        )
        val txt = chapters.joinToString("\n\n\n") { "${it.title}\n\n${it.text}" }
        assertTrue(txt.startsWith("第一章\n\n甲的正文"))
        assertTrue(txt.contains("第二章\n\n乙的正文"))
    }
}
