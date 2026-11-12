package com.storyweave.app.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * P2: characters and relations get typed tables.
 *
 * The Web build stores them as top-level JSON collections. Promoting them to
 * tables lets the app query and update one person at a time, while `extrasJson`
 * keeps every field we do not model so export stays lossless.
 */
@Entity(tableName = "characters")
data class CharacterEntity(
    @PrimaryKey val id: String,
    val projectId: String,
    val name: String,
    val role: String,
    val personality: String,
    val goal: String,
    val knowledge: String,
    val secret: String,
    val created: String,
    /** Unmodeled character fields, JSON object. */
    val extrasJson: String,
    /** Original modelled keys that existed in the source JSON; only these are
     *  written back, so absent keys stay absent and empty strings survive. */
    val modeledKeysJson: String = "[]",
    val position: Int
)

/**
 * A knowledge card (设定 / 术语), stored inside `work.knowledgeCards` rather than
 * its own table: the Web build keeps them on the work object and they are edited
 * as one array.
 */
data class KnowledgeCard(
    val id: String,
    val title: String,
    val body: String,
    val category: String,
    val tags: String,
    val source: String,
    val aliases: String,
    val chapterIds: List<String>
)

/** One recorded change of a relationship, mirroring createRelationshipEvent(). */
data class RelationEvent(
    val id: String,
    val relationId: String,
    val chapterId: String,
    val beforeType: String,
    val beforeTrust: Int,
    val afterType: String,
    val afterTrust: Int,
    val cause: String,
    val created: String
)

@Entity(tableName = "relations")
data class RelationEntity(
    @PrimaryKey val id: String,
    val projectId: String,
    val a: String,
    val b: String,
    val type: String,
    val detail: String,
    val privateRelation: Boolean,
    val extrasJson: String,
    val modeledKeysJson: String = "[]",
    val position: Int
)
