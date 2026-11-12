package com.storyweave.app.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface StoryDao {

    // ---- document level -------------------------------------------------

    @Query("SELECT * FROM works ORDER BY position ASC")
    suspend fun works(): List<WorkEntity>

    @Query("SELECT * FROM chapters ORDER BY workId ASC, position ASC")
    suspend fun chapters(): List<ChapterEntity>

    @Query("SELECT * FROM collection_rows ORDER BY collection ASC, position ASC")
    suspend fun collectionRows(): List<CollectionRowEntity>

    @Query("SELECT * FROM document_meta WHERE id = 1")
    suspend fun meta(): DocumentMetaEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWorks(rows: List<WorkEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertChapters(rows: List<ChapterEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCollectionRows(rows: List<CollectionRowEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMeta(row: DocumentMetaEntity)

    @Query("DELETE FROM works")
    suspend fun clearWorks()

    @Query("DELETE FROM chapters")
    suspend fun clearChapters()

    @Query("DELETE FROM collection_rows")
    suspend fun clearCollectionRows()

    @Query("SELECT * FROM collection_rows WHERE collection = :name ORDER BY position ASC")
    suspend fun collectionRowsOf(name: String): List<CollectionRowEntity>

    @Query("DELETE FROM collection_rows WHERE collection = :name")
    suspend fun clearCollection(name: String)

    /** Wholesale replacement, matching the Web build's transaction semantics. */
    @Transaction
    suspend fun replaceAll(
        works: List<WorkEntity>,
        chapters: List<ChapterEntity>,
        collectionRows: List<CollectionRowEntity>,
        meta: DocumentMetaEntity
    ) {
        clearWorks()
        clearChapters()
        clearCollectionRows()
        insertWorks(works)
        insertChapters(chapters)
        insertCollectionRows(collectionRows)
        insertMeta(meta)
    }

    // ---- incremental editing (P1) --------------------------------------
    //
    // The shelf and the editor only touch their own rows. Rewriting the whole
    // document on every keystroke was the Web build's performance bottleneck.

    @Query("SELECT * FROM works ORDER BY position ASC")
    fun observeWorks(): Flow<List<WorkEntity>>

    @Query("SELECT * FROM chapters WHERE workId = :workId ORDER BY position ASC")
    fun observeChapters(workId: String): Flow<List<ChapterEntity>>

    @Query("SELECT * FROM chapters WHERE workId = :workId ORDER BY position ASC")
    suspend fun chaptersOf(workId: String): List<ChapterEntity>

    @Query("SELECT COUNT(*) FROM works")
    suspend fun workCount(): Int

    @Query("SELECT * FROM works WHERE id = :workId")
    suspend fun work(workId: String): WorkEntity?

    @Query("SELECT MAX(position) FROM works")
    suspend fun maxWorkPosition(): Int?

    @Query("SELECT MAX(position) FROM chapters WHERE workId = :workId")
    suspend fun maxChapterPosition(workId: String): Int?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertWork(row: WorkEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertChapter(row: ChapterEntity)

    @Query("UPDATE chapters SET text = :text, updated = :updated WHERE workId = :workId AND id = :chapterId")
    suspend fun updateChapterText(workId: String, chapterId: String, text: String, updated: String)

    @Query("DELETE FROM works WHERE id = :workId")
    suspend fun deleteWork(workId: String)

    @Query("DELETE FROM chapters WHERE workId = :workId AND id = :chapterId")
    suspend fun deleteChapter(workId: String, chapterId: String)

    @Query("DELETE FROM chapters WHERE workId = :workId")
    suspend fun deleteChaptersOf(workId: String)

    /**
     * Deleting a work removes its chapters and its rows in the generic JSON
     * collections (plots, timeline events, scene cards, …) in one transaction —
     * the same cleanup the Web build's book deletion performs.
     */
    @Transaction
    suspend fun deleteWorkCascade(workId: String, projectIdFilteredRows: List<CollectionRowEntity>) {
        deleteChaptersOf(workId)
        deleteWork(workId)
        for (row in projectIdFilteredRows) {
            deleteCollectionRow(row.rowId)
        }
    }

    @Query("DELETE FROM collection_rows WHERE rowId = :rowId")
    suspend fun deleteCollectionRow(rowId: Long)

    @Query("UPDATE works SET updated = :updated WHERE id = :workId")
    suspend fun touchWork(workId: String, updated: String)

    // ---- P2: people ----------------------------------------------------

    @Query("SELECT * FROM characters ORDER BY position ASC")
    suspend fun characters(): List<CharacterEntity>

    @Query("SELECT * FROM relations ORDER BY position ASC")
    suspend fun relations(): List<RelationEntity>

    @Query("SELECT * FROM characters WHERE projectId = :workId ORDER BY position ASC")
    fun observeCharacters(workId: String): Flow<List<CharacterEntity>>

    @Query("SELECT * FROM relations WHERE projectId = :workId ORDER BY position ASC")
    fun observeRelations(workId: String): Flow<List<RelationEntity>>

    @Query("SELECT MAX(position) FROM characters WHERE projectId = :workId")
    suspend fun maxCharacterPosition(workId: String): Int?

    @Query("SELECT MAX(position) FROM relations WHERE projectId = :workId")
    suspend fun maxRelationPosition(workId: String): Int?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertCharacter(row: CharacterEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertRelation(row: RelationEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCharacters(rows: List<CharacterEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertRelations(rows: List<RelationEntity>)

    @Query("DELETE FROM characters")
    suspend fun clearCharacters()

    @Query("DELETE FROM relations")
    suspend fun clearRelations()

    @Query("DELETE FROM characters WHERE projectId = :workId AND id = :characterId")
    suspend fun deleteCharacter(workId: String, characterId: String)

    @Query("DELETE FROM relations WHERE projectId = :workId AND id = :relationId")
    suspend fun deleteRelation(workId: String, relationId: String)

    @Query("DELETE FROM characters WHERE projectId = :workId")
    suspend fun deleteCharactersOf(workId: String)

    @Query("DELETE FROM relations WHERE projectId = :workId")
    suspend fun deleteRelationsOf(workId: String)
}
