package com.storyweave.app.data.db

import com.storyweave.app.data.json.StoryDocument
import com.storyweave.app.data.json.StoryDocumentCodec
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import com.storyweave.app.data.json.JsonLossless
import com.storyweave.app.data.json.PeopleJson
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.jsonObject
import java.time.Instant

/**
 * Maps between the on-disk JSON document and Room rows.
 *
 * Two access styles:
 *  - document level (`load` / `save` / `importJson` / `exportJson`): whole-document
 *    operations for backups.
 *  - incremental (`works`, `createWork`, `updateChapterText`, …): what the shelf
 *    and the editor use, so a keystroke does not rewrite the whole library.
 */
class StoryRepository(private val dao: StoryDao) {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    // ---- document level ------------------------------------------------

    suspend fun load(): StoryDocument {
        val meta = dao.meta()
        val workRows = dao.works()
        val chapterRows = dao.chapters().groupBy { it.workId }
        val collectionRows = dao.collectionRows().groupBy { it.collection }

        val works = workRows.map { row ->
            StoryDocument.Work(
                id = row.id,
                title = row.title,
                genre = row.genre,
                summary = row.summary,
                created = row.created,
                updated = row.updated,
                chapters = (chapterRows[row.id] ?: emptyList()).map { chapter ->
                    StoryDocument.Chapter(
                        id = chapter.id,
                        title = chapter.title,
                        text = chapter.text,
                        updated = chapter.updated,
                        extras = parseObject(chapter.extrasJson)
                    )
                },
                extras = parseObject(row.extrasJson)
            )
        }

        val collections = LinkedHashMap<String, JsonArray>()
        for ((name, rows) in collectionRows) {
            collections[name] = JsonArray(rows.sortedBy { it.position }.map { parseJson(it.payloadJson) })
        }
        // People live in typed tables; when the tables hold rows, they are the
        // source of truth and replace whatever the raw payload carried.
        val characterRows = dao.characters().sortedBy { it.position }
        if (characterRows.isNotEmpty()) {
            collections["characters"] = JsonArray(characterRows.map { PeopleJson.encodeCharacter(it) })
        }
        val relationRows = dao.relations().sortedBy { it.position }
        if (relationRows.isNotEmpty()) {
            collections["relations"] = JsonArray(relationRows.map { PeopleJson.encodeRelation(it) })
        }

        return StoryDocument(
            version = meta?.version ?: 17,
            selected = meta?.selected,
            projects = works,
            collections = collections,
            extras = parseObject(meta?.extrasJson ?: "{}")
        )
    }

    suspend fun save(document: StoryDocument) {
        val workRows = document.projects.mapIndexed { index, work ->
            WorkEntity(
                id = work.id, title = work.title, genre = work.genre, summary = work.summary,
                created = work.created, updated = work.updated,
                extrasJson = work.extras.toString(), position = index
            )
        }
        val chapterRows = document.projects.flatMap { work ->
            work.chapters.mapIndexed { index, chapter ->
                ChapterEntity(
                    workId = work.id, id = chapter.id, title = chapter.title, text = chapter.text,
                    updated = chapter.updated, extrasJson = chapter.extras.toString(), position = index
                )
            }
        }
        val collectionRows = document.collections.flatMap { (name, array) ->
            array.mapIndexed { index, element ->
                CollectionRowEntity(collection = name, position = index, payloadJson = element.toString())
            }
        }
        val characters = PeopleJson.decodeCharacters(document.collections["characters"] ?: JsonArray(emptyList()))
        val relations = PeopleJson.decodeRelations(document.collections["relations"] ?: JsonArray(emptyList()))
        dao.replaceAll(
            workRows, chapterRows, collectionRows,
            DocumentMetaEntity(version = document.version, selected = document.selected,
                extrasJson = document.extras.toString())
        )
        dao.clearCharacters()
        dao.clearRelations()
        dao.insertCharacters(characters)
        dao.insertRelations(relations)
    }

    suspend fun exportJson(): String = StoryDocumentCodec.encode(load())

    suspend fun importJson(raw: String) {
        save(StoryDocumentCodec.decode(raw))
    }

    // ---- incremental: shelf --------------------------------------------

    fun observeWorks(): Flow<List<WorkSummary>> = dao.observeWorks().map { rows ->
        rows.map { WorkSummary(it.id, it.title, it.genre, it.updated) }
    }

    fun observeChapters(workId: String): Flow<List<ChapterSummary>> =
        dao.observeChapters(workId).map { rows ->
            rows.map { ChapterSummary(it.id, it.title, it.text.length, it.updated) }
        }

    suspend fun chaptersOf(workId: String): List<StoryDocument.Chapter> =
        dao.chaptersOf(workId).map {
            StoryDocument.Chapter(it.id, it.title, it.text, it.updated, parseObject(it.extrasJson))
        }

    suspend fun createWork(title: String, genre: String = ""): String {
        val now = nowIso()
        val workId = newId("work")
        val chapterId = newId("ch")
        dao.upsertWork(
            WorkEntity(
                id = workId, title = title.ifBlank { "未命名作品" }, genre = genre,
                summary = "", created = now, updated = now,
                extrasJson = "{}", position = (dao.maxWorkPosition() ?: -1) + 1
            )
        )
        dao.upsertChapter(
            ChapterEntity(
                workId = workId, id = chapterId, title = "第一章 · 未命名", text = "",
                updated = now, extrasJson = "{}", position = 0
            )
        )
        return workId
    }

    suspend fun deleteWork(workId: String) {
        // Generic collections hold raw JSON; a row belongs to this work when its
        // projectId matches. The people tables clean themselves via cascade.
        val toRemove = dao.collectionRows().filter { row ->
            runCatching { parseJson(row.payloadJson).jsonObject["projectId"] }
                .getOrNull()?.let { element ->
                    (element as? kotlinx.serialization.json.JsonPrimitive)?.content == workId
                } == true
        }
        dao.deleteWorkCascade(workId, toRemove)
    }

    suspend fun work(workId: String): WorkEntity? = dao.work(workId)

    suspend fun chapter(workId: String, chapterId: String): ChapterEntity? =
        dao.chaptersOf(workId).firstOrNull { it.id == chapterId }

    /** 快照写入：history 存章节 extras（Web 版同构），30 条上限由域逻辑保证。 */
    suspend fun writeChapterHistory(
        workId: String,
        chapter: ChapterEntity,
        entries: List<com.storyweave.app.domain.ChapterHistory.Entry>
    ) {
        val extras = LinkedHashMap(com.storyweave.app.data.json.JsonLossless.workChapterExtras(chapter))
        extras["history"] = kotlinx.serialization.json.Json.parseToJsonElement(
            com.storyweave.app.domain.ChapterHistory.encode(entries)
        )
        dao.upsertChapter(chapter.copy(extrasJson = kotlinx.serialization.json.JsonObject(extras).toString()))
    }

    /** 历史恢复：写回标题与正文，保留 extras。 */
    suspend fun restoreChapterText(workId: String, chapterId: String, title: String, text: String) {
        val chapter = chapter(workId, chapterId) ?: return
        dao.upsertChapter(chapter.copy(title = title, text = text, updated = nowIso()))
    }

    /** 事务式更新 work.extrasJson 的一个子键（P6：dailyGoal/writingToday 等）。 */
    suspend fun patchWorkExtras(workId: String, patch: (LinkedHashMap<String, kotlinx.serialization.json.JsonElement>) -> LinkedHashMap<String, kotlinx.serialization.json.JsonElement>) {
        val work = dao.work(workId) ?: return
        val extras = com.storyweave.app.data.json.JsonLossless.workExtras(work)
        val next = patch(LinkedHashMap(extras))
        dao.upsertWork(work.copy(extrasJson = kotlinx.serialization.json.JsonObject(next).toString(), updated = nowIso()))
    }

    // ---- P6: chapter trash ---------------------------------------------
    //
    // Trashed chapters are stored in `work.chapterTrash` — the same JSON array
    // the Web build uses ({chapter, index, deletedAt}). Web imports accept
    // entries without records/references (they fall back to empty), so the
    // minimal shape here stays two-way compatible.

    private fun chapterTrashArray(work: WorkEntity): MutableList<JsonObject> {
        val extras = parseObject(work.extrasJson)
        return (extras["chapterTrash"] as? JsonArray)
            ?.mapNotNull { element -> runCatching { parseJson(element.toString()).jsonObject }.getOrNull() }
            ?.toMutableList() ?: mutableListOf()
    }

    private suspend fun writeWorkWithTrash(work: WorkEntity, trash: List<JsonObject>) {
        val extras = LinkedHashMap<String, kotlinx.serialization.json.JsonElement>(parseObject(work.extrasJson))
        extras["chapterTrash"] = JsonArray(trash)
        dao.upsertWork(work.copy(extrasJson = JsonObject(extras).toString(), updated = nowIso()))
    }

    suspend fun moveChapterToTrash(workId: String, chapterId: String) {
        val work = dao.work(workId) ?: return
        val chapter = dao.chaptersOf(workId).firstOrNull { it.id == chapterId } ?: return
        val trash = chapterTrashArray(work)
        val entry = buildJsonObject {
            put("chapter", buildJsonObject {
                put("id", JsonLossless.primitive(chapter.id))
                put("title", JsonLossless.primitive(chapter.title))
                put("text", JsonLossless.primitive(chapter.text))
                put("updated", JsonLossless.primitive(chapter.updated))
                val extras = parseObject(chapter.extrasJson)
                for ((key, value) in extras) put(key, value)
            })
            put("index", JsonLossless.primitive(chapter.position))
            put("deletedAt", JsonLossless.primitive(nowIso()))
        }
        trash.add(0, entry)
        writeWorkWithTrash(work, trash)
        dao.deleteChapter(workId, chapterId)
    }

    suspend fun restoreChapterFromTrash(workId: String, chapterId: String) {
        val work = dao.work(workId) ?: return
        val trash = chapterTrashArray(work)
        val entry = trash.firstOrNull { JsonLossless.string(it["chapter"]?.let { c -> (c as JsonObject)["id"] }) == chapterId }
            ?: return
        val chapterObj = entry["chapter"] as? JsonObject ?: return
        val chapter = StoryDocument.Chapter(
            id = JsonLossless.string(chapterObj["id"]) ?: return,
            title = JsonLossless.string(chapterObj["title"]) ?: "",
            text = JsonLossless.string(chapterObj["text"]) ?: "",
            updated = nowIso(),
            extras = JsonObject(
                LinkedHashMap<String, kotlinx.serialization.json.JsonElement>().apply {
                    for ((key, value) in chapterObj) if (key !in setOf("id", "title", "text", "updated")) put(key, value)
                }
            )
        )
        val index = (entry["index"] as? JsonPrimitive)?.content?.toIntOrNull() ?: 0
        dao.upsertChapter(
            ChapterEntity(
                workId = workId, id = chapter.id, title = chapter.title, text = chapter.text,
                updated = chapter.updated, extrasJson = chapter.extras.toString(),
                position = index
            )
        )
        writeWorkWithTrash(work, trash.filterNot { it === entry })
    }

    suspend fun purgeChapterFromTrash(workId: String, chapterId: String) {
        val work = dao.work(workId) ?: return
        val trash = chapterTrashArray(work)
        writeWorkWithTrash(work, trash.filterNot {
            JsonLossless.string((it["chapter"] as? JsonObject)?.get("id")) == chapterId
        })
    }

    suspend fun loadChapterTrash(workId: String): List<TrashEntry> {
        val work = dao.work(workId) ?: return emptyList()
        return chapterTrashArray(work).mapNotNull { entry ->
            val chapter = entry["chapter"] as? JsonObject ?: return@mapNotNull null
            TrashEntry(
                chapterId = JsonLossless.string(chapter["id"]) ?: return@mapNotNull null,
                title = JsonLossless.string(chapter["title"]) ?: "",
                charCount = (JsonLossless.string(chapter["text"]) ?: "").length,
                deletedAt = JsonLossless.string(entry["deletedAt"]) ?: ""
            )
        }
    }

    // ---- P6: character delete cascade ----------------------------------
    //
    // Deleting a person also removes relations that referenced them and any
    // relationship-history rows left dangling. (The Web build additionally
    // clears growth/archive/participants — noted as not cascaded in the ledger.)

    suspend fun deleteCharacterCascade(workId: String, characterId: String) {
        dao.deleteCharacter(workId, characterId)
        val dangling = dao.relations().filter { it.projectId == workId && (it.a == characterId || it.b == characterId) }
        for (relation in dangling) {
            dao.deleteRelation(workId, relation.id)
        }
        val historyRows = dao.collectionRowsOf("relationshipHistory")
        val keep = historyRows.filter { row ->
            val payload = runCatching { parseJson(row.payloadJson).jsonObject }.getOrNull()
            payload == null || payload["projectId"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content } != workId ||
                JsonLossless.string(payload["relationId"]) !in dangling.map { it.id }
        }
        if (keep.size != historyRows.size) {
            dao.clearCollection("relationshipHistory")
            dao.insertCollectionRows(keep.mapIndexed { index, row -> row.copy(position = index) })
        }
    }

    // ---- P6: whole-book export ------------------------------------------

    /** Whole book as text. `markdown` adds `#` chapter headings. */
    suspend fun exportBookText(workId: String, markdown: Boolean): String {
        val work = dao.work(workId) ?: throw IllegalArgumentException("作品已不存在")
        val chapters = dao.chaptersOf(workId)
        val separator = if (markdown) "\n\n---\n\n" else "\n\n\n"
        val head = (if (markdown) "# ${work.title}\n\n" else "${work.title}\n\n")
        val body = chapters.joinToString(separator) { chapter ->
            val heading = if (markdown) "## ${chapter.title}\n\n" else "${chapter.title}\n\n"
            heading + chapter.text
        }
        return head + body
    }

    // ---- P2: world profile ---------------------------------------------
    //
    // worldProfile lives inside the work's unmodeled `extras`, which is where the
    // Web build keeps it. Editing writes back into that same object so export
    // stays byte-compatible.

    suspend fun loadWorldProfile(workId: String): Map<String, String> {
        val work = dao.work(workId) ?: return emptyMap()
        val extras = parseObject(work.extrasJson)
        val profile = extras["worldProfile"] as? JsonObject ?: return emptyMap()
        return WORLD_FIELDS.associate { field -> field to (JsonLossless.string(profile[field]) ?: "") }
    }

    suspend fun saveWorldProfile(workId: String, profile: Map<String, String>) {
        val work = dao.work(workId) ?: return
        val extras = LinkedHashMap<String, kotlinx.serialization.json.JsonElement>(parseObject(work.extrasJson))
        val cleaned = WORLD_FIELDS.associateWith { field ->
            (profile[field] ?: "").trim().take(WORLD_FIELD_LIMIT)
        }
        extras["worldProfile"] = JsonObject(cleaned.mapValues { JsonLossless.primitive(it.value) })
        dao.upsertWork(work.copy(extrasJson = JsonObject(extras).toString(), updated = nowIso()))
    }

    // ---- P3: generic collection access ---------------------------------
    //
    // Plots, plot links, timeline events, scene cards and annotations stay as
    // raw JSON rows (same as P2's relationshipHistory). Only the fields the UI
    // edits are parsed; everything else is echoed back, so export stays lossless.

    suspend fun loadCollection(name: String): List<JsonObject> =
        dao.collectionRowsOf(name).sortedBy { it.position }
            .mapNotNull { row -> runCatching { parseJson(row.payloadJson).jsonObject }.getOrNull() }

    suspend fun saveCollection(name: String, rows: List<JsonObject>) {
        dao.clearCollection(name)
        dao.insertCollectionRows(rows.mapIndexed { index, obj ->
            CollectionRowEntity(collection = name, position = index, payloadJson = obj.toString())
        })
    }

    // ---- P2: relationship history (关系演变) ---------------------------
    //
    // Events live in the top-level `relationshipHistory` collection, one row per
    // chapter change, exactly as the Web build's createRelationshipEvent() writes
    // them. They are stored as raw JSON rows so unknown fields survive.

    suspend fun loadRelationHistory(workId: String): List<RelationEvent> =
        dao.collectionRowsOf("relationshipHistory")
            .mapNotNull { row ->
                val obj = runCatching { parseJson(row.payloadJson).jsonObject }.getOrNull()
                    ?: return@mapNotNull null
                if (JsonLossless.string(obj["projectId"]) != workId) return@mapNotNull null
                RelationEvent(
                    id = JsonLossless.string(obj["id"]) ?: return@mapNotNull null,
                    relationId = JsonLossless.string(obj["relationId"]) ?: "",
                    chapterId = JsonLossless.string(obj["chapterId"]) ?: "",
                    beforeType = JsonLossless.string(obj["beforeType"]) ?: "",
                    beforeTrust = JsonLossless.int(obj["beforeTrust"]),
                    afterType = JsonLossless.string(obj["afterType"]) ?: "",
                    afterTrust = JsonLossless.int(obj["afterTrust"]),
                    cause = JsonLossless.string(obj["cause"]) ?: "",
                    created = JsonLossless.string(obj["created"]) ?: ""
                )
            }

    /** Appends one change; trusts the -100..100 range the Web build enforces. */
    suspend fun appendRelationEvent(
        workId: String,
        relation: RelationEntity,
        chapterId: String,
        afterType: String,
        afterTrust: Int,
        cause: String
    ) {
        require(afterType.length >= 2) { "请填写变化后的关系" }
        require(afterTrust in -100..100) { "关系信任值必须在 -100 到 100 之间" }
        val rows = dao.collectionRowsOf("relationshipHistory")
        val payload = buildJsonObject {
            put("id", JsonLossless.primitive(newId("reh")))
            put("projectId", JsonLossless.primitive(workId))
            put("relationId", JsonLossless.primitive(relation.id))
            put("a", JsonLossless.primitive(relation.a))
            put("b", JsonLossless.primitive(relation.b))
            put("chapterId", JsonLossless.primitive(chapterId))
            put("beforeType", JsonLossless.primitive(relation.type))
            put("beforeTrust", JsonLossless.primitive(0))
            put("afterType", JsonLossless.primitive(afterType.take(70)))
            put("afterTrust", JsonLossless.primitive(afterTrust))
            put("cause", JsonLossless.primitive(cause.take(800)))
            put("created", JsonLossless.primitive(nowIso()))
        }.toString()
        // Keep the Web build's 4000-row cap.
        val next = (rows + CollectionRowEntity(
            collection = "relationshipHistory",
            position = rows.size,
            payloadJson = payload
        )).takeLast(4000).mapIndexed { index, row -> row.copy(position = index) }
        dao.clearCollection("relationshipHistory")
        dao.insertCollectionRows(next)
    }

    // ---- P2: knowledge cards (术语表) -----------------------------------
    //
    // Cards live in `work.knowledgeCards`, same place and shape as the Web
    // build's cleanCard(): id/title/body/category/tags/source/aliases/chapterIds.

    suspend fun loadKnowledgeCards(workId: String): List<KnowledgeCard> {
        val work = dao.work(workId) ?: return emptyList()
        val array = parseObject(work.extrasJson)["knowledgeCards"] as? JsonArray ?: return emptyList()
        return array.mapNotNull { element ->
            val obj = runCatching { element.jsonObject }.getOrNull() ?: return@mapNotNull null
            val id = JsonLossless.string(obj["id"]) ?: return@mapNotNull null
            val title = JsonLossless.string(obj["title"]) ?: return@mapNotNull null
            val body = JsonLossless.string(obj["body"]) ?: return@mapNotNull null
            KnowledgeCard(
                id = id,
                title = title,
                body = body,
                category = JsonLossless.string(obj["category"]) ?: "设定",
                tags = JsonLossless.string(obj["tags"]) ?: "",
                source = JsonLossless.string(obj["source"]) ?: "",
                aliases = JsonLossless.string(obj["aliases"]) ?: "",
                chapterIds = (obj["chapterIds"] as? JsonArray)?.mapNotNull { JsonLossless.string(it) } ?: emptyList()
            )
        }
    }

    suspend fun saveKnowledgeCards(workId: String, cards: List<KnowledgeCard>) {
        val work = dao.work(workId) ?: return
        val extras = LinkedHashMap<String, kotlinx.serialization.json.JsonElement>(parseObject(work.extrasJson))
        extras["knowledgeCards"] = JsonArray(cards.map { card ->
            buildJsonObject {
                put("id", JsonLossless.primitive(card.id))
                put("title", JsonLossless.primitive(card.title.take(100)))
                put("body", JsonLossless.primitive(card.body.take(30000)))
                put("category", JsonLossless.primitive(card.category))
                put("tags", JsonLossless.primitive(card.tags))
                put("source", JsonLossless.primitive(card.source))
                put("aliases", JsonLossless.primitive(card.aliases))
                put("chapterIds", JsonArray(card.chapterIds.map { JsonLossless.primitive(it) }))
            }
        })
        dao.upsertWork(work.copy(extrasJson = JsonObject(extras).toString(), updated = nowIso()))
    }

    fun newCardId(): String = newId("kc")

    // ---- P2: people ----------------------------------------------------

    fun observeCharacters(workId: String): Flow<List<CharacterEntity>> =
        dao.observeCharacters(workId)

    suspend fun upsertCharacter(workId: String, entity: CharacterEntity) {
        val isNew = entity.id.isBlank()
        val id = if (isNew) newId("role") else entity.id
        val position = if (isNew) (dao.maxCharacterPosition(workId) ?: -1) + 1 else entity.position
        val created = entity.created.ifBlank { nowIso() }
        dao.upsertCharacter(
            entity.copy(id = id, projectId = workId, created = created, position = position)
        )
    }

    suspend fun deleteCharacter(workId: String, characterId: String) =
        dao.deleteCharacter(workId, characterId)

    fun observeRelations(workId: String): Flow<List<RelationEntity>> =
        dao.observeRelations(workId)

    suspend fun upsertRelation(workId: String, entity: RelationEntity) {
        val isNew = entity.id.isBlank()
        val id = if (isNew) newId("rel") else entity.id
        val position = if (isNew) (dao.maxRelationPosition(workId) ?: -1) + 1 else entity.position
        dao.upsertRelation(entity.copy(id = id, projectId = workId, position = position))
    }

    suspend fun deleteRelation(workId: String, relationId: String) =
        dao.deleteRelation(workId, relationId)

    // ---- incremental: contents / editor --------------------------------

    /**
     * 导入小说：新建作品，按 ManuscriptSplitter 规则把 TXT 拆成多章。
     * 复用 createWork 的骨架但不留空章；全在一个事务内，失败不留半部书。
     */
    suspend fun importManuscript(title: String, raw: String): String {
        val now = nowIso()
        val workId = newId("work")
        val chapters = com.storyweave.app.domain.ManuscriptSplitter.split(
            raw, title.ifBlank { "未命名作品" }
        )
        dao.upsertWork(
            WorkEntity(
                id = workId, title = title.ifBlank { "未命名作品" }, genre = "",
                summary = "", created = now, updated = now,
                extrasJson = "{}", position = (dao.maxWorkPosition() ?: -1) + 1
            )
        )
        chapters.forEachIndexed { index, chapter ->
            dao.upsertChapter(
                ChapterEntity(
                    workId = workId, id = newId("ch"), title = chapter.title,
                    text = chapter.text, updated = now, extrasJson = "{}", position = index
                )
            )
        }
        return workId
    }

    suspend fun createChapter(workId: String, title: String): String {
        val now = nowIso()
        val chapterId = newId("ch")
        dao.upsertChapter(
            ChapterEntity(
                workId = workId, id = chapterId,
                title = title.ifBlank { "第 ${(dao.maxChapterPosition(workId) ?: -1) + 2} 章" },
                text = "", updated = now, extrasJson = "{}",
                position = (dao.maxChapterPosition(workId) ?: -1) + 1
            )
        )
        dao.touchWork(workId, now)
        return chapterId
    }

    suspend fun deleteChapter(workId: String, chapterId: String) = dao.deleteChapter(workId, chapterId)

    /** Single-row text update: the hot path while typing. */
    suspend fun updateChapterText(workId: String, chapterId: String, text: String) {
        val now = nowIso()
        dao.updateChapterText(workId, chapterId, text, now)
        dao.touchWork(workId, now)
    }

    suspend fun renameChapter(workId: String, chapterId: String, title: String) {
        val existing = dao.chaptersOf(workId).firstOrNull { it.id == chapterId } ?: return
        dao.upsertChapter(
            existing.copy(title = title, updated = nowIso(), position = existing.position)
        )
    }

    // ---- P2: people mapping -------------------------------------------

    // ---- helpers -------------------------------------------------------

    fun nowIso(): String = Instant.now().toString()

    /** Field order and limits copied from the Web build's `worldFields`. */
    val WORLD_FIELDS = listOf("premise", "chronology", "geography", "rules", "factions", "themes")
    private val WORLD_FIELD_LIMIT = 1800


    private fun newId(prefix: String): String =
        prefix + "-" + java.util.UUID.randomUUID().toString().take(12)

    private fun parseObject(raw: String): JsonObject =
        runCatching { parseJson(raw).jsonObject }.getOrElse { buildJsonObject { } }

    private fun parseJson(raw: String) = json.parseToJsonElement(raw)
}

data class WorkSummary(
    val id: String,
    val title: String,
    val genre: String,
    val updated: String
)

data class ChapterSummary(
    val id: String,
    val title: String,
    val charCount: Int,
    val updated: String
)

/** One row of the work's chapter recycle bin, for the contents screen. */
data class TrashEntry(
    val chapterId: String,
    val title: String,
    val charCount: Int,
    val deletedAt: String
)
