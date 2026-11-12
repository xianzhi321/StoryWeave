package com.storyweave.app.domain

import com.storyweave.app.data.db.RelationEntity
import com.storyweave.app.data.db.RelationEvent

/**
 * Relationship state replay.
 *
 * Ported from the Web build's `relationStateAt()`: to know what a relationship
 * looked like at a given chapter, take every recorded change up to and including
 * that chapter and keep the last one. Before any change, the relation keeps its
 * own current type (the Web build behaves the same way because it has no earlier
 * snapshot to fall back to).
 */
data class RelationSnapshot(
    val type: String,
    val trust: Int,
    val isOriginal: Boolean
)

object RelationReplay {

    /**
     * @param chapterOrder chapter ids in reading order; the snapshot covers all
     *   changes at positions <= [chapterIndex].
     */
    fun stateAt(
        relation: RelationEntity,
        events: List<RelationEvent>,
        chapterOrder: List<String>,
        chapterIndex: Int
    ): RelationSnapshot {
        if (chapterIndex < 0 || chapterIndex >= chapterOrder.size) {
            return RelationSnapshot(relation.type, 0, isOriginal = true)
        }
        val covered = chapterOrder.take(chapterIndex + 1).toSet()
        val applicable = events
            .filter { it.relationId == relation.id && it.chapterId in covered }
            .sortedBy { it.created }
        val last = applicable.lastOrNull()
            ?: return RelationSnapshot(relation.type, 0, isOriginal = true)
        return RelationSnapshot(last.afterType, last.afterTrust, isOriginal = false)
    }

    /** Changes for one relation, oldest first — the timeline shown in the UI. */
    fun timelineFor(relation: RelationEntity, events: List<RelationEvent>): List<RelationEvent> =
        events.filter { it.relationId == relation.id }.sortedBy { it.created }
}
