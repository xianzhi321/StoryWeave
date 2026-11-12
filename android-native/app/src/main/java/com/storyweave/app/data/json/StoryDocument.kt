package com.storyweave.app.data.json

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * StoryWeave v17 state document.
 *
 * Only the parts the native app edits in P0 are modeled structurally
 * ([projects]); every other top-level collection is carried as raw JSON so a
 * load → save cycle is byte-equivalent in meaning. Collections are promoted to
 * typed models later, one migration phase at a time, without touching the file
 * format.
 */
data class StoryDocument(
    val version: Int,
    val selected: String?,
    val projects: List<Work>,
    /** Top-level collections other than `projects`, preserved verbatim. */
    val collections: Map<String, JsonArray>,
    /** Unknown top-level keys, preserved verbatim. */
    val extras: JsonObject
) {
    data class Work(
        val id: String,
        val title: String,
        val genre: String,
        val summary: String,
        val created: String,
        val updated: String,
        val chapters: List<Chapter>,
        /** Everything else on the work object (volumes, chapterTrash, blueprint, …). */
        val extras: JsonObject
    )

    data class Chapter(
        val id: String,
        val title: String,
        val text: String,
        val updated: String,
        val extras: JsonObject
    )
}

object StoryDocumentCodec {

    private val json = Json {
        prettyPrint = true
        prettyPrintIndent = "  "
        ignoreUnknownKeys = true
        isLenient = true
    }

    /** Top-level keys consumed structurally; everything else is echoed back. */
    private val STRUCTURED_KEYS = setOf("version", "selected", "projects")

    fun decode(raw: String): StoryDocument {
        val root = Json.parseToJsonElement(raw).jsonObjectOrEmpty()
        val version = JsonLossless.int(root["version"], 17)
        val selected = JsonLossless.string(root["selected"])
        val projects = JsonLossless.arr(root["projects"]).mapNotNull { decodeWork(it) }

        val collections = LinkedHashMap<String, JsonArray>()
        val extras = LinkedHashMap<String, JsonElement>()
        for ((key, value) in root) {
            if (key in STRUCTURED_KEYS) continue
            if (value is JsonArray) collections[key] = value else extras[key] = value
        }
        return StoryDocument(
            version = version,
            selected = selected,
            projects = projects,
            collections = collections,
            extras = JsonObject(extras)
        )
    }

    fun encode(document: StoryDocument): String {
        val root = buildJsonObject {
            put("version", document.version)
            if (document.selected == null) {
                put("selected", kotlinx.serialization.json.JsonNull)
            } else {
                put("selected", document.selected)
            }
            put("projects", buildJsonArray { document.projects.forEach { add(encodeWork(it)) } })
            // Echo the untouched collections and extras so nothing is lost.
            for ((key, value) in document.extras) put(key, value)
            for ((key, value) in document.collections) put(key, value)
            }
        return json.encodeToString(JsonElement.serializer(), root)
    }

    private fun JsonElement.jsonObjectOrEmpty(): JsonObject = this as? JsonObject ?: JsonObject(emptyMap())

    private fun decodeWork(element: JsonElement): StoryDocument.Work? {
        val obj = element as? JsonObject ?: return null
        val id = JsonLossless.string(obj["id"]) ?: return null
        val chapters = JsonLossless.arr(obj["chapters"]).mapNotNull { decodeChapter(it) }
        val extras = LinkedHashMap<String, JsonElement>()
        for ((key, value) in obj) {
            if (key in WORK_KEYS) continue
            extras[key] = value
        }
        return StoryDocument.Work(
            id = id,
            title = JsonLossless.string(obj["title"]) ?: "",
            genre = JsonLossless.string(obj["genre"]) ?: "",
            summary = JsonLossless.string(obj["summary"]) ?: "",
            created = JsonLossless.string(obj["created"]) ?: "",
            updated = JsonLossless.string(obj["updated"]) ?: "",
            chapters = chapters,
            extras = JsonObject(extras)
        )
    }

    private fun decodeChapter(element: JsonElement): StoryDocument.Chapter? {
        val obj = element as? JsonObject ?: return null
        val id = JsonLossless.string(obj["id"]) ?: return null
        val extras = LinkedHashMap<String, JsonElement>()
        for ((key, value) in obj) {
            if (key in CHAPTER_KEYS) continue
            extras[key] = value
        }
        return StoryDocument.Chapter(
            id = id,
            title = JsonLossless.string(obj["title"]) ?: "",
            text = JsonLossless.string(obj["text"]) ?: "",
            updated = JsonLossless.string(obj["updated"]) ?: "",
            extras = JsonObject(extras)
        )
    }

    private fun encodeWork(work: StoryDocument.Work): JsonObject {
        val fields = LinkedHashMap<String, JsonElement>(work.extras)
        fields["id"] = JsonLossless.primitive(work.id)
        fields["title"] = JsonLossless.primitive(work.title)
        fields["genre"] = JsonLossless.primitive(work.genre)
        fields["summary"] = JsonLossless.primitive(work.summary)
        fields["created"] = JsonLossless.primitive(work.created)
        fields["updated"] = JsonLossless.primitive(work.updated)
        fields["chapters"] = buildJsonArray { work.chapters.forEach { add(encodeChapter(it)) } }
        return JsonObject(fields)
    }

    private fun encodeChapter(chapter: StoryDocument.Chapter): JsonObject {
        val fields = LinkedHashMap<String, JsonElement>(chapter.extras)
        fields["id"] = JsonLossless.primitive(chapter.id)
        fields["title"] = JsonLossless.primitive(chapter.title)
        fields["text"] = JsonLossless.primitive(chapter.text)
        fields["updated"] = JsonLossless.primitive(chapter.updated)
        return JsonObject(fields)
    }

    private val WORK_KEYS = setOf("id", "title", "genre", "summary", "created", "updated", "chapters")
    private val CHAPTER_KEYS = setOf("id", "title", "text", "updated")
}
