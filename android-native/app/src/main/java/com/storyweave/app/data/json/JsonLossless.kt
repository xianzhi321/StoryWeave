package com.storyweave.app.data.json

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Lossless JSON helpers for the StoryWeave v17 backup format.
 *
 * The Web build's normalize chain tolerates unknown collections, and the charter
 * requires data compatibility. Therefore every field we do not model explicitly
 * must survive a load/save cycle untouched. These helpers keep the raw
 * [JsonElement] tree around instead of round-tripping through data classes that
 * would silently drop unknown keys.
 */
object JsonLossless {

    fun obj(element: JsonElement?): JsonObject =
        element as? JsonObject ?: JsonObject(emptyMap())

    fun arr(element: JsonElement?): JsonArray =
        element as? JsonArray ?: JsonArray(emptyList())

    fun string(element: JsonElement?): String? {
        val primitive = element as? JsonPrimitive ?: return null
        if (primitive is JsonNull) return null
        if (primitive.isString) return primitive.content
        return null
    }

    fun int(element: JsonElement?, fallback: Int = 0): Int =
        (element as? JsonPrimitive)?.intOrNull ?: fallback

    fun bool(element: JsonElement?, fallback: Boolean = false): Boolean =
        (element as? JsonPrimitive)?.booleanOrNull ?: fallback

    fun primitive(value: String): JsonPrimitive = JsonPrimitive(value)

    fun primitive(value: Int): JsonPrimitive = JsonPrimitive(value)

    fun primitive(value: Boolean): JsonPrimitive = JsonPrimitive(value)

    fun primitive(value: Double): JsonPrimitive = JsonPrimitive(value)

    /** Whole numbers stay integer-shaped (512, not 512.0) so a round trip keeps
     *  the source number form. */
    fun number(value: Double): JsonPrimitive =
        if (value == value.toLong().toDouble()) JsonPrimitive(value.toLong()) else JsonPrimitive(value)

    /** Deep merge: values from [patch] win, keys only present in [base] survive. */
    fun merge(base: JsonObject, patch: JsonObject): JsonObject {
        val out = LinkedHashMap<String, JsonElement>(base)
        for ((key, value) in patch) {
            val existing = out[key]
            out[key] = if (existing is JsonObject && value is JsonObject) merge(existing, value) else value
        }
        return JsonObject(out)
    }
    fun workExtras(work: com.storyweave.app.data.db.WorkEntity): JsonObject =
        runCatching {
            kotlinx.serialization.json.Json.parseToJsonElement(work.extrasJson) as? JsonObject
        }.getOrNull() ?: JsonObject(emptyMap())

    fun workChapterExtras(chapter: com.storyweave.app.data.db.ChapterEntity): JsonObject =
        runCatching {
            kotlinx.serialization.json.Json.parseToJsonElement(chapter.extrasJson) as? JsonObject
        }.getOrNull() ?: JsonObject(emptyMap())

}
