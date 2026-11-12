package com.storyweave.app.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Room schema for P0.
 *
 * Only the structures the native app writes are typed: works and chapters.
 * Everything else is stored as ordered JSON payloads so the file format stays
 * the single source of truth. Collections are promoted to typed tables in later
 * phases; doing it now would risk dropping fields the Web build still owns.
 */
@Entity(tableName = "works")
data class WorkEntity(
    @PrimaryKey val id: String,
    val title: String,
    val genre: String,
    val summary: String,
    val created: String,
    val updated: String,
    /** Unmodeled work fields, JSON object. */
    val extrasJson: String,
    /** Preserves project order within the shelf. */
    val position: Int
)

@Entity(tableName = "chapters", primaryKeys = ["workId", "id"])
data class ChapterEntity(
    val workId: String,
    val id: String,
    val title: String,
    val text: String,
    val updated: String,
    /** Unmodeled chapter fields (history, blueprint, volumeId, …). */
    val extrasJson: String,
    val position: Int
)

@Entity(tableName = "collection_rows")
data class CollectionRowEntity(
    @PrimaryKey(autoGenerate = true) val rowId: Long = 0,
    /** Top-level collection name, e.g. `characters`. */
    val collection: String,
    /** Index inside the original JSON array. */
    val position: Int,
    /** One array element, verbatim JSON. */
    val payloadJson: String
)

@Entity(tableName = "document_meta")
data class DocumentMetaEntity(
    @PrimaryKey val id: Int = SINGLETON_ID,
    val version: Int,
    val selected: String?,
    /** Non-array top-level keys (settings, exportedAt, …), JSON object. */
    val extrasJson: String
) {
    companion object {
        const val SINGLETON_ID = 1
    }
}
