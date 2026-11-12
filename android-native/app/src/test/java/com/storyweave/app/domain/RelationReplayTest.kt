package com.storyweave.app.domain

import com.storyweave.app.data.db.RelationEntity
import com.storyweave.app.data.db.RelationEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Replay rules must match the Web build, otherwise the two clients tell different
 * stories about what a relationship was like in chapter N.
 */
class RelationReplayTest {

    private val relation = RelationEntity(
        id = "rel-1", projectId = "w1", a = "r1", b = "r2",
        type = "初识", detail = "", privateRelation = false,
        extrasJson = "{}", position = 0
    )

    private val chapters = listOf("ch-1", "ch-2", "ch-3")

    private fun event(id: String, chapter: String, type: String, trust: Int, at: String) =
        RelationEvent(
            id = id, relationId = "rel-1", chapterId = chapter,
            beforeType = "", beforeTrust = 0, afterType = type, afterTrust = trust,
            cause = "", created = at
        )

    @Test
    fun `before any change the original type is used`() {
        val snapshot = RelationReplay.stateAt(relation, emptyList(), chapters, 0)
        assertEquals("初识", snapshot.type)
        assertTrue(snapshot.isOriginal)
    }

    @Test
    fun `change applies from its own chapter onward`() {
        val events = listOf(event("e1", "ch-2", "盟友", 40, "2026-01-02"))
        assertEquals("初识", RelationReplay.stateAt(relation, events, chapters, 0).type)
        assertEquals("盟友", RelationReplay.stateAt(relation, events, chapters, 1).type)
        assertEquals("盟友", RelationReplay.stateAt(relation, events, chapters, 2).type)
    }

    @Test
    fun `later change wins`() {
        val events = listOf(
            event("e1", "ch-2", "盟友", 40, "2026-01-02"),
            event("e2", "ch-3", "决裂", -80, "2026-01-03")
        )
        assertEquals("盟友", RelationReplay.stateAt(relation, events, chapters, 1).type)
        assertEquals("决裂", RelationReplay.stateAt(relation, events, chapters, 2).type)
        assertEquals(-80, RelationReplay.stateAt(relation, events, chapters, 2).trust)
        assertFalse(RelationReplay.stateAt(relation, events, chapters, 2).isOriginal)
    }

    @Test
    fun `events for other relations are ignored`() {
        val other = event("e2", "ch-3", "决裂", -80, "2026-01-03").copy(relationId = "rel-9")
        val snapshot = RelationReplay.stateAt(relation, listOf(other), chapters, 2)
        assertEquals("初识", snapshot.type)
        assertTrue(snapshot.isOriginal)
    }

    @Test
    fun `out of range chapter falls back to the original state`() {
        val events = listOf(event("e1", "ch-2", "盟友", 40, "2026-01-02"))
        assertEquals("初识", RelationReplay.stateAt(relation, events, chapters, -1).type)
        assertEquals("初识", RelationReplay.stateAt(relation, events, chapters, 99).type)
    }

    @Test
    fun `timeline is ordered oldest first`() {
        val events = listOf(
            event("e2", "ch-3", "决裂", -80, "2026-01-03"),
            event("e1", "ch-2", "盟友", 40, "2026-01-02")
        )
        val timeline = RelationReplay.timelineFor(relation, events)
        assertEquals(listOf("e1", "e2"), timeline.map { it.id })
    }
}
