package com.storyweave.app.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.storyweave.app.data.db.StoryDatabase
import com.storyweave.app.data.db.StoryRepository
import com.storyweave.app.data.json.StoryDocumentCodec
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * On-device verification of the persistence path: import a Web-format backup
 * into Room, export it back, and require the JSON trees to match.
 *
 * The JVM test covers the codec; this one additionally exercises Room schema,
 * the DAO transaction and ordering, which only exist on a real device/emulator.
 */
@RunWith(AndroidJUnit4::class)
class RepositoryRoundTripInstrumentedTest {

    private lateinit var database: StoryDatabase
    private lateinit var repository: StoryRepository

    private val backup = """
    {
      "version": 19,
      "selected": "work-demo",
      "exportedAt": "2026-11-11T21:00:00.000Z",
      "projects": [
        {
          "id": "work-demo",
          "title": "雾城手记",
          "genre": "悬疑 · 群像",
          "summary": "雨雾包围的旧城。",
          "created": "2026-11-11T05:35:44.000Z",
          "updated": "2026-11-11T08:53:01.000Z",
          "shelfGroup": "系列一",
          "volumes": [{"id":"vol-1","title":"第一卷"}],
          "chapterTrash": [],
          "knowledgeCards": [{"id":"kc-1","title":"术语","body":"正文内容","chapterIds":["ch-1"]}],
          "chapters": [
            {
              "id": "ch-1",
              "title": "第一章 · 来信",
              "text": "雾从河面升起时，钟楼刚敲过六下。",
              "updated": "2026-11-11T08:53:01.000Z",
              "volumeId": "vol-1",
              "blueprint": {"goal":"推进主线","status":"draft"},
              "history": [{"id":"h-1","at":"2026-11-11T08:00:00.000Z","title":"旧标题","text":"旧正文"}]
            }
          ]
        }
      ],
      "characters": [{"id":"r-1","projectId":"work-demo","name":"林澈"}],
      "relations": [],
      "documents": [],
      "skills": [],
      "events": [],
      "plots": [],
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
      "unknownFutureCollection": [{"id":"u-1","note":"未来字段必须保留"}]
    }
    """.trimIndent()

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, StoryDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        repository = StoryRepository(database.storyDao())
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun jsonSurvivesRoomRoundTrip() = runBlocking {
        repository.importJson(backup)
        val exported = repository.exportJson()
        assertEquals(tree(backup), tree(exported))
    }

    @Test
    fun unknownCollectionSurvivesRoom() = runBlocking {
        repository.importJson(backup)
        val exported = tree(repository.exportJson())
        assertTrue(exported.containsKey("unknownFutureCollection"))
        assertTrue(exported.containsKey("settings"))
        assertTrue(exported.containsKey("exportedAt"))
    }

    @Test
    fun chapterExtrasSurviveRoom() = runBlocking {
        repository.importJson(backup)
        val document = repository.load()
        val chapter = document.projects.single().chapters.single()
        assertTrue(chapter.extras.containsKey("volumeId"))
        assertTrue(chapter.extras.containsKey("blueprint"))
        assertTrue(chapter.extras.containsKey("history"))
        assertTrue(document.projects.single().extras.containsKey("shelfGroup"))
        assertTrue(document.projects.single().extras.containsKey("knowledgeCards"))
    }

    @Test
    fun reimportReplacesRatherThanDuplicates() = runBlocking {
        repository.importJson(backup)
        repository.importJson(backup)
        val document = repository.load()
        assertEquals(1, document.projects.size)
        assertEquals(1, document.projects.single().chapters.size)
        assertEquals(1, document.collections.getValue("characters").size)
    }

    @Test
    fun exportedDocumentIsReadableBySameCodec() = runBlocking {
        repository.importJson(backup)
        val exported = repository.exportJson()
        val reparsed = StoryDocumentCodec.decode(exported)
        assertEquals(1, reparsed.projects.size)
        assertEquals("雾城手记", reparsed.projects.single().title)
        assertEquals("第一章 · 来信", reparsed.projects.single().chapters.single().title)
    }

    private fun tree(raw: String): JsonObject =
        Json.parseToJsonElement(raw) as JsonObject
}
