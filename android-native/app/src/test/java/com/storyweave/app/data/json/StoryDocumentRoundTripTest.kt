package com.storyweave.app.data.json

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Round-trip gate for data compatibility.
 *
 * The charter requires that existing v17 backups keep working. This test loads a
 * document shaped like the Web build's export, saves it back, and requires the
 * two JSON trees to be deeply equal — including collections and fields the
 * native app does not model. A regression that drops unknown data fails here.
 */
class StoryDocumentRoundTripTest {

    private val json = Json { prettyPrint = false }

    /** Mirrors a real Web export: projects + unrelated collections + unknown keys. */
    private val fixture = """
    {
      "version": 19,
      "selected": "work-a",
      "exportedAt": "2026-11-11T20:00:00.000Z",
      "projects": [
        {
          "id": "work-a",
          "title": "雾城手记",
          "genre": "悬疑 · 群像",
          "summary": "雨雾包围的旧城",
          "created": "2026-11-11T05:35:44.000Z",
          "updated": "2026-11-11T08:53:01.000Z",
          "demo": true,
          "pinned": false,
          "shelfGroup": "系列一",
          "volumes": [{"id":"vol-1","title":"第一卷"}],
          "chapterTrash": [],
          "knowledgeCards": [{"id":"kc-1","title":"术语","body":"正文","chapterIds":["ch-1"]}],
          "writingPrompts": {"overrides": {}},
          "chapters": [
            {
              "id": "ch-1",
              "title": "第一章 · 来信",
              "text": "雾从河面升起时，钟楼刚敲过六下。",
              "updated": "2026-11-11T08:53:01.000Z",
              "volumeId": "vol-1",
              "blueprint": {"goal":"推进","status":"draft"},
              "history": [{"id":"h-1","at":"2026-11-11T08:00:00.000Z","title":"旧标题","text":"旧正文"}],
              "futureField": {"nested": true}
            }
          ]
        }
      ],
      "characters": [{"id":"r-1","projectId":"work-a","name":"林澈"}],
      "relations": [{"id":"rel-1","projectId":"work-a","a":"r-1","b":"r-1"}],
      "documents": [],
      "skills": [{"id":"s-1","title":"技能","status":"ready"}],
      "events": [],
      "plots": [{"id":"pl-1","projectId":"work-a"}],
      "sceneCards": [],
      "annotations": [],
      "canonFacts": [],
      "storyBranches": [],
      "knowledgeProposals": [],
      "writingFeedback": [],
      "skillPresets": [],
      "distillationJobs": [],
      "plotChapterLinks": [],
      "relationshipHistory": [],
      "timelineEvents": [],
      "auditFindings": [],
      "characterGrowth": [],
      "archiveRecords": [],
      "worldMaps": [],
      "worldPlaces": [],
      "projectTrash": [],
      "settings": {"endpoint":"https://api.openai.com/v1","model":""},
      "unknownFutureCollection": [{"id":"u-1"}]
    }
    """.trimIndent()

    @Test
    fun `round trip preserves every key`() {
        val document = StoryDocumentCodec.decode(fixture)
        val output = StoryDocumentCodec.encode(document)
        assertEquals(tree(fixture), tree(output))
    }

    @Test
    fun `unknown collections and extras survive`() {
        val document = StoryDocumentCodec.decode(fixture)
        assertTrue(document.collections.containsKey("unknownFutureCollection"))
        assertTrue(document.collections.containsKey("characters"))
        assertEquals("2026-11-11T20:00:00.000Z", JsonLossless.string(document.extras["exportedAt"]))

        val output = tree(StoryDocumentCodec.encode(document))
        assertTrue(output.containsKey("unknownFutureCollection"))
        assertTrue(output.containsKey("settings"))
        assertTrue(output.containsKey("exportedAt"))
    }

    @Test
    fun `unmodeled work and chapter fields survive`() {
        val document = StoryDocumentCodec.decode(fixture)
        val work = document.projects.single()
        assertTrue(work.extras.containsKey("shelfGroup"))
        assertTrue(work.extras.containsKey("knowledgeCards"))
        assertTrue(work.extras.containsKey("volumes"))
        val chapter = work.chapters.single()
        assertTrue(chapter.extras.containsKey("volumeId"))
        assertTrue(chapter.extras.containsKey("blueprint"))
        assertTrue(chapter.extras.containsKey("history"))
        assertTrue(chapter.extras.containsKey("futureField"))
    }

    @Test
    fun `all twenty four top level collections are accounted for`() {
        val document = StoryDocumentCodec.decode(fixture)
        val expected = setOf(
            "characters", "relations", "documents", "skills", "events", "plots",
            "sceneCards", "annotations", "canonFacts", "storyBranches",
            "knowledgeProposals", "writingFeedback", "skillPresets",
            "distillationJobs", "plotChapterLinks", "relationshipHistory",
            "timelineEvents", "auditFindings", "characterGrowth",
            "archiveRecords", "worldMaps", "worldPlaces", "projectTrash"
        )
        val present = document.collections.keys
        val missing = expected - present
        assertTrue("缺少集合: $missing", missing.isEmpty())
    }

    @Test
    fun `selected null is preserved as null`() {
        val withoutSelection = fixture.replace("\"selected\": \"work-a\"", "\"selected\": null")
        val document = StoryDocumentCodec.decode(withoutSelection)
        assertEquals(null, document.selected)
        val output = tree(StoryDocumentCodec.encode(document))
        assertEquals(JsonPrimitive(null as String?), output["selected"])
    }

    private fun tree(raw: String): JsonObject =
        Json.parseToJsonElement(raw) as JsonObject
}
