package com.storyweave.app.domain

/**
 * Book→skill distillation sampling, ported from the Web build's
 * `balancedSamples()`: when a reference book exceeds the upload budget, take
 * equal slices from the beginning, middle and late-middle of the text instead
 * of only the opening, so the model sees the whole shape of the book.
 */
object Distill {

    data class Slice(val label: String, val text: String)

    fun balancedSamples(text: String, total: Int = 14000): String {
        val src = text
        if (src.length <= total) return src
        val fractions = doubleArrayOf(0.0, 0.33, 0.66, 0.93)
        val sliceLength = total / fractions.size
        return fractions.mapIndexed { index, fraction ->
            val start = (src.length * fraction).toInt()
                .coerceIn(0, (src.length - sliceLength).coerceAtLeast(0))
            "[片段 ${index + 1}，约位于全文 ${Math.round(fraction * 100)}% 位置]\n" +
                src.substring(start, (start + sliceLength).coerceAtMost(src.length))
        }.joinToString("\n\n……\n\n")
    }

    /** Skills the model may return: title/category/description/rules/evidence. */
    data class CandidateSkill(
        val title: String,
        val category: String,
        val description: String,
        val rules: List<String>,
        val evidence: String
    )

    private val FENCE_HEAD = Regex("^```(?:json)?\\s*", RegexOption.IGNORE_CASE)
    private val FENCE_TAIL = Regex("\\s*```$")

    /**
     * Mirrors the Web build's distill response parsing: strip fences, require a
     * skills array, cap at 7, require title+rules; candidates come back with
     * status pending for review.
     */
    fun parseSkills(reply: String): List<CandidateSkill> {
        val cleaned = reply.trim().replace(FENCE_HEAD, "").replace(FENCE_TAIL, "")
        val data: kotlinx.serialization.json.JsonObject = try {
            kotlinx.serialization.json.Json.parseToJsonElement(cleaned) as? kotlinx.serialization.json.JsonObject
                ?: throw IllegalStateException("AI 返回的格式不正确")
        } catch (error: IllegalStateException) {
            throw error
        } catch (_: Exception) {
            throw IllegalStateException("AI 返回的格式不正确")
        }
        val arr = data["skills"] as? kotlinx.serialization.json.JsonArray
            ?: throw IllegalStateException("AI 返回的格式不正确")
        return arr.take(7).mapNotNull { element ->
            val row = element as? kotlinx.serialization.json.JsonObject ?: return@mapNotNull null
            fun str(key: String): String =
                (row[key] as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it.isString }?.content ?: ""
            val title = str("title").take(90)
            val rules = (row["rules"] as? kotlinx.serialization.json.JsonArray)
                ?.mapNotNull { (it as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { p -> p.isString }?.content }
                ?: emptyList()
            if (title.isEmpty() || rules.isEmpty()) return@mapNotNull null
            CandidateSkill(
                title = title,
                category = str("category").ifBlank { "通用" },
                description = str("description"),
                rules = rules,
                evidence = str("evidence")
            )
        }
    }
}
