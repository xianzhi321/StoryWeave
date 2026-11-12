package com.storyweave.app.domain

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/**
 * AI continuity-review payload and findings parsing, ported from the Web
 * build's `buildAuditPayload()` and `parseAuditFindings()`.
 *
 * The charter's evidence rule is enforced by parseFindings: a finding is only
 * valid when its quote appears verbatim in the chapter text — the model cannot
 * invent locations.
 */
object AiAudit {

    data class Limits(val maxChapters: Int = 5, val maxTotalChars: Int = 14000, val maxEachChars: Int = 4200)

    val SEVERITIES = listOf("critical", "warning", "notice", "info")

    data class ChapterRef(
        val id: String,
        val title: String,
        val text: String
    )

    /** Builds the JSON the Web build posts to the model. */
    fun buildPayload(
        workTitle: String,
        genre: String,
        summary: String,
        chapters: List<ChapterRef>,
        characters: List<Triple<String, String, String>>,
        plotThreads: List<Triple<String, String, String>>,
        timeline: List<Quadruple<String, String, String, Boolean>>,
        relationshipChanges: List<Quadruple<String, String, String, String>>,
        limits: Limits = Limits()
    ): JsonObject {
        val selected = chapters.take(limits.maxChapters)
        val perChapter = limits.maxTotalChars / selected.size.coerceAtLeast(1)
            .coerceIn(1, limits.maxEachChars)
        return buildJsonObject {
            put("workTitle", workTitle.take(100))
            put("genre", genre.take(100))
            put("summary", summary.take(700))
            putJsonArray("chapters") {
                for (chapter in selected) {
                    add(buildJsonObject {
                        put("id", chapter.id)
                        put("title", chapter.title.take(100))
                        put("text", chapter.text.take(perChapter.coerceIn(1, limits.maxEachChars)))
                        put("truncated", chapter.text.length > perChapter)
                    })
                }
            }
            put("limits", buildJsonObject {
                put("maxTotalChars", limits.maxTotalChars)
                put("maxEachChars", limits.maxEachChars)
                put("maxChapters", limits.maxChapters)
            })
            putJsonArray("characters") {
                for (c in characters.take(18)) {
                    add(buildJsonObject {
                        put("id", c.first)
                        put("name", c.second.take(60))
                        put("role", c.third.take(100))
                    })
                }
            }
            putJsonArray("plotThreads") {
                for (p in plotThreads.take(30)) {
                    add(buildJsonObject {
                        put("id", p.first)
                        put("title", p.second.take(100))
                        put("type", p.third.take(40))
                    })
                }
            }
            putJsonArray("timeline") {
                for (t in timeline.take(40)) {
                    add(buildJsonObject {
                        put("title", t.first.take(100))
                        put("storyDate", t.second.take(20))
                        put("chapterId", t.third)
                        put("isFlashback", t.fourth)
                    })
                }
            }
            putJsonArray("relationshipChanges") {
                for (r in relationshipChanges.takeLast(50)) {
                    add(buildJsonObject {
                        put("chapterId", r.first)
                        put("afterType", r.second)
                        put("afterTrust", r.third)
                        put("cause", r.fourth)
                    })
                }
            }
        }
    }

    data class Finding(
        val id: String,
        val chapterId: String,
        val severity: String,
        val title: String,
        val detail: String,
        val suggestion: String,
        val quote: String,
        val offset: Int,
        val created: String
    )

    data class ParseResult(val valid: List<Finding>, val rejectedCount: Int)

    /**
     * Mirrors parseAuditFindings(): strip code fences, require a findings array,
     * cap at 15, validate every field, quote must appear verbatim (8–120 chars),
     * title ≥3, detail ≥12.
     */
    fun parseFindings(
        reply: String,
        chapters: List<ChapterRef>,
        selectedChapterIds: List<String>
    ): ParseResult {
        val cleaned = reply.trim()
            .replace(Regex("^```(?:json)?\\s*", RegexOption.IGNORE_CASE), "")
            .replace(Regex("\\s*```$"), "")
        val data = try {
            Json.parseToJsonElement(cleaned).jsonObject
        } catch (_: Exception) {
            throw IllegalStateException("AI 未返回合法 JSON")
        }
        val findings = data["findings"] as? JsonArray
            ?: throw IllegalStateException("AI 结果缺少 findings 数组")

        val allowed = selectedChapterIds.toSet()
        val chapterById = chapters.associateBy { it.id }
        val valid = mutableListOf<Finding>()
        var rejected = 0
        val now = java.time.Instant.now().toString()

        var capped = false
        for (element in findings) {
            if (valid.size >= 15) { capped = true; break }
            val raw = element as? JsonObject
            if (raw == null) { rejected++; continue }
            val chapterId = (raw["chapterId"] as? kotlinx.serialization.json.JsonPrimitive)
                ?.takeIf { it.isString }?.content
            val chapter = chapterId?.let { chapterById[it] }
            val quote = (raw["quote"] as? kotlinx.serialization.json.JsonPrimitive)
                ?.takeIf { it.isString }?.content ?: ""
            val title = (raw["title"] as? kotlinx.serialization.json.JsonPrimitive)
                ?.takeIf { it.isString }?.content?.take(100) ?: ""
            val detail = (raw["detail"] as? kotlinx.serialization.json.JsonPrimitive)
                ?.takeIf { it.isString }?.content?.take(600) ?: ""
            val suggestion = (raw["suggestion"] as? kotlinx.serialization.json.JsonPrimitive)
                ?.takeIf { it.isString }?.content?.take(500) ?: ""
            val severity = (raw["severity"] as? kotlinx.serialization.json.JsonPrimitive)
                ?.takeIf { it.isString }?.content ?: ""

            val chapterRef = chapterId?.let { chapterById[it] }
            if (chapterRef == null || chapterId !in allowed || severity !in SEVERITIES ||
                quote.length !in 8..120 || title.length < 3 || detail.length < 12) {
                rejected++
                continue
            }
            if (!chapterRef.text.contains(quote)) {
                rejected++
                continue
            }
            valid += Finding(
                id = "audit-" + valid.size.toString(36) + "-" + now.take(10),
                chapterId = chapterRef.id,
                severity = severity,
                title = title,
                detail = detail,
                suggestion = suggestion,
                quote = quote,
                offset = chapterRef.text.indexOf(quote),
                created = now
            )
        }
        return ParseResult(valid, rejected)
    }

    data class Quadruple<A, B, C, D>(val first: A, val second: B, val third: C, val fourth: D)
}
