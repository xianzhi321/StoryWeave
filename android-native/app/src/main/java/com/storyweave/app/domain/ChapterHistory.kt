package com.storyweave.app.domain

/**
 * Chapter version snapshots, ported from the Web build's `snapshot()`:
 * newest first, capped at 30 entries, each carrying its own title+text.
 * History lives inside the chapter object (`chapter.history`), so the native
 * side keeps it in the chapter's extras JSON for two-way backup compatibility.
 */
object ChapterHistory {

    const val LIMIT = 30

    data class Entry(val id: String, val at: String, val title: String, val text: String)

    /** Newest-first insert with the Web build's cap. */
    fun push(history: List<Entry>, entry: Entry): List<Entry> =
        (listOf(entry) + history).take(LIMIT)

    fun decode(historyJson: String): List<Entry> =
        runCatching {
            val array = kotlinx.serialization.json.Json.parseToJsonElement(historyJson) as? kotlinx.serialization.json.JsonArray
            array?.mapNotNull { row ->
                val obj = row as? kotlinx.serialization.json.JsonObject ?: return@mapNotNull null
                fun str(key: String) = (obj[key] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: ""
                Entry(str("id"), str("at"), str("title"), str("text"))
            }
        }.getOrNull() ?: emptyList()

    fun encode(entries: List<Entry>): String =
        kotlinx.serialization.json.buildJsonObject {}.let {
            kotlinx.serialization.json.JsonArray(entries.map { e ->
                kotlinx.serialization.json.buildJsonObject {
                    put("id", kotlinx.serialization.json.JsonPrimitive(e.id))
                    put("at", kotlinx.serialization.json.JsonPrimitive(e.at))
                    put("title", kotlinx.serialization.json.JsonPrimitive(e.title))
                    put("text", kotlinx.serialization.json.JsonPrimitive(e.text))
                }
            }).toString()
        }
}

/**
 * 全文检索, ported from the Web build's openSearch(): one keyword matches
 * chapter titles, chapter text, character names and timeline events.
 */
object GlobalSearch {

    data class Hit(val kind: String, val id: String, val title: String, val detail: String)

    fun search(
        query: String,
        chapters: List<Pair<String, String>>,          // id to title
        chapterTexts: Map<String, String>,             // id to text
        characters: List<Pair<String, String>>,        // id to name
        events: List<Pair<String, String>>             // id to title
    ): List<Hit> {
        val q = query.trim()
        if (q.isEmpty()) return emptyList()
        val hits = mutableListOf<Hit>()
        for ((id, title) in chapters) {
            if (title.contains(q)) {
                hits += Hit("chapter", id, title, "章节标题")
            } else {
                val text = chapterTexts[id].orEmpty()
                val at = text.indexOf(q)
                if (at >= 0) {
                    val from = (at - 10).coerceAtLeast(0)
                    val to = (at + q.length + 10).coerceAtMost(text.length)
                    hits += Hit("chapter", id, title, "…" + text.substring(from, to) + "…")
                }
            }
        }
        for ((id, name) in characters) {
            if (name.contains(q)) hits += Hit("character", id, name, "人物")
        }
        for ((id, title) in events) {
            if (title.contains(q)) hits += Hit("event", id, title, "编年事件")
        }
        return hits
    }
}
