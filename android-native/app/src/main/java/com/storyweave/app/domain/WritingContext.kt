package com.storyweave.app.domain

import kotlinx.serialization.json.JsonObject

/**
 * Writing-context summary for the current chapter, ported from the Web build's
 * `writingContext()`: which character files are mentioned in the chapter text,
 * which plot threads are relevant (linked to the chapter or named in the text).
 * Pure local computation — no AI involved.
 */
object WritingContext {

    data class Mention(val id: String, val name: String, val detail: String)

    fun mentionedCharacters(
        chapterText: String,
        characters: List<JsonObject>
    ): List<Mention> =
        characters.mapNotNull { row ->
            fun str(key: String): String =
                (row[key] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: ""
            val name = str("name")
            if (name.isNotEmpty() && chapterText.contains(name)) {
                Mention(str("id"), name, str("goal").ifBlank { str("role") })
            } else null
        }

    fun relevantPlots(
        chapterId: String,
        chapterText: String,
        plots: List<JsonObject>
    ): List<Mention> =
        plots.mapNotNull { row ->
            fun str(key: String): String =
                (row[key] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: ""
            val id = str("id")
            val title = str("title")
            val linked = JsonLosslessLinked.chapterIds(row).contains(chapterId)
            val named = title.isNotEmpty() && chapterText.contains(title)
            if (linked || named) Mention(id, title, str("status")) else null
        }
}

private object JsonLosslessLinked {
    /** Reads plotChapterLinks rows for one plot id (same shape as the board). */
    fun chapterIds(plot: JsonObject): List<String> =
        (plot["chapterLinks"] as? kotlinx.serialization.json.JsonArray)
            ?.mapNotNull { (it as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { p -> p.isString }?.content }
            ?: emptyList()
}
