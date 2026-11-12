package com.storyweave.app.domain

import com.storyweave.app.data.db.RelationEvent

/**
 * Continuity audit — ported from the Web build's `auditContinuity()`.
 *
 * This is a **rule check**, not a proof of consistency. The Web build says the
 * same thing in its README, and the wording is kept here on purpose: results are
 * hints for the author to verify, never automatic corrections.
 *
 * Rules ported 1:1 from narrative-core.js:
 *  - plotChapterLinks → missing chapter, missing plant, multiple payoffs, payoff before plant
 *  - relationshipHistory → dangling references, gaps between consecutive changes
 *  - timelineEvents → story date going backwards along chapter order, missing chapter
 */

enum class Severity { CRITICAL, WARNING, NOTICE, INFO }

data class AuditIssue(
    val id: String,
    val kind: String,
    val severity: Severity,
    val title: String,
    val detail: String,
    val plotId: String = "",
    val chapterId: String = "",
    val eventId: String = ""
)

data class AuditReport(
    val issues: List<AuditIssue>,
    val counts: Map<Severity, Int>
) {
    companion object {
        val EMPTY = AuditReport(emptyList(), Severity.entries.associateWith { 0 })
    }
}

/** One 伏笔 ↔ 章节 link. `stage` is `planted` / `payoff` / `mention` in the Web build. */
data class PlotLink(
    val id: String,
    val plotId: String,
    val chapterId: String,
    val stage: String,
    val allowNonlinear: Boolean
)

data class PlotRef(val id: String, val title: String, val status: String = "")

data class TimelineRef(
    val id: String,
    val title: String,
    val chapterId: String,
    val storyDate: String,
    val isFlashback: Boolean
)

/** `chapterId` order + fields the relation audit needs. */
data class RelationRef(val id: String, val type: String)

object StoryDate {

    /**
     * Parses `YYYY` / `YYYY-MM` / `YYYY-MM-DD` into an inclusive numeric range,
     * exactly like the Web build's `storyDateRange()`. A bare year covers the
     * whole year, which is why the audit compares ranges instead of instants.
     */
    fun rangeOf(value: String): IntRange? {
        val text = value.trim()
        if (text.isEmpty()) return null
        val match = Regex("^(\\d{1,6})(?:-(\\d{2})(?:-(\\d{2}))?)?$").find(text) ?: return null
        val year = match.groupValues[1].toIntOrNull() ?: return null
        val month = match.groupValues[2].toIntOrNull() ?: 0
        val day = match.groupValues[3].toIntOrNull() ?: 0
        val start = year * 10000 + (if (month == 0) 1 else month) * 100 + (if (day == 0) 1 else day)
        val end = year * 10000 + (if (month == 0) 12 else month) * 100 + (if (day == 0) 31 else day)
        return start..end
    }
}

object ContinuityAudit {

    fun audit(
        chapterOrder: List<String>,
        chapterTitles: Map<String, String>,
        plots: List<PlotRef>,
        links: List<PlotLink>,
        relations: List<RelationRef>,
        history: List<RelationEvent>?,
        timeline: List<TimelineRef>
    ): AuditReport {
        val issues = buildList {
            addAll(auditPlotLinks(chapterOrder, chapterTitles, plots, links))
            addAll(auditRelationshipHistory(chapterOrder, chapterTitles, relations, history ?: emptyList()))
            addAll(auditTimeline(chapterOrder, chapterTitles, timeline))
        }
        val counts = Severity.entries.associateWith { severity -> issues.count { it.severity == severity } }
        return AuditReport(issues, counts)
    }

    fun auditPlotLinks(
        chapterOrder: List<String>,
        chapterTitles: Map<String, String>,
        plots: List<PlotRef>,
        links: List<PlotLink>
    ): List<AuditIssue> {
        val issues = mutableListOf<AuditIssue>()
        val order = chapterOrder.withIndex().associate { (index, id) -> id to index }
        for (plot in plots) {
            val refs = links.filter { it.plotId == plot.id }
            val planted = refs.filter { it.stage == "planted" }
            val payoffs = refs.filter { it.stage == "payoff" }

            for (ref in refs) {
                if (ref.chapterId !in order) {
                    issues += AuditIssue(
                        id = "plot-missing-${ref.id}",
                        kind = "plot",
                        severity = Severity.WARNING,
                        title = "线索关联章节不存在：${plot.title}",
                        detail = "该关联指向已删除或不存在的章节。",
                        plotId = plot.id,
                        chapterId = ref.chapterId
                    )
                }
            }
            if (refs.isNotEmpty() && planted.isEmpty()) {
                issues += AuditIssue(
                    id = "plot-no-plant-${plot.id}",
                    kind = "plot",
                    severity = Severity.NOTICE,
                    title = "「${plot.title}」没有明确的埋设章节",
                    detail = "建议标记首次出现线索的章节，便于核对后续回收。",
                    plotId = plot.id
                )
            }
            if (payoffs.size > 1) {
                issues += AuditIssue(
                    id = "plot-multi-payoff-${plot.id}",
                    kind = "plot",
                    severity = Severity.NOTICE,
                    title = "「${plot.title}」有多个回收节点",
                    detail = "请确认这是分阶段揭示，还是误重复标记。",
                    plotId = plot.id
                )
            }
            if (refs.isEmpty() && plot.status != "已回收") {
                issues += AuditIssue(
                    id = "plot-unlinked-${plot.id}",
                    kind = "plot",
                    severity = Severity.INFO,
                    title = "「${plot.title}」尚未关联章节",
                    detail = "这条伏笔目前没有章节级位置，无法检查埋设与回收顺序。",
                    plotId = plot.id
                )
            }
            for (plant in planted) {
                for (payoff in payoffs) {
                    if (payoff.allowNonlinear) continue
                    val plantIndex = order[plant.chapterId] ?: continue
                    val payoffIndex = order[payoff.chapterId] ?: continue
                    if (payoffIndex < plantIndex) {
                        issues += AuditIssue(
                            id = "plot-order-${plot.id}-${payoff.id}",
                            kind = "plot",
                            severity = Severity.WARNING,
                            title = "「${plot.title}」的回收章节早于埋设章节",
                            detail = "埋设：${chapterTitles[plant.chapterId] ?: "未知章节"}；" +
                                "回收：${chapterTitles[payoff.chapterId] ?: "未知章节"}。" +
                                "如果是非线性叙事，可在关联上标记允许倒叙。",
                            plotId = plot.id,
                            chapterId = payoff.chapterId
                        )
                    }
                }
            }
        }
        return issues
    }

    fun auditRelationshipHistory(
        chapterOrder: List<String>,
        chapterTitles: Map<String, String>,
        relations: List<RelationRef>,
        history: List<RelationEvent>
    ): List<AuditIssue> {
        val issues = mutableListOf<AuditIssue>()
        val relationById = relations.associateBy { it.id }
        val order = chapterOrder.withIndex().associate { (index, id) -> id to index }

        for (event in history) {
            val relation = relationById[event.relationId]
            if (relation == null || event.chapterId !in order) {
                issues += AuditIssue(
                    id = "rel-invalid-${event.id}",
                    kind = "relationship",
                    severity = Severity.WARNING,
                    title = "人物关系历史存在失效引用",
                    detail = "请检查关联人物、关系档案或章节是否已删除。",
                    chapterId = event.chapterId
                )
            }
        }

        for (relation in relations) {
            val events = history
                .filter { it.relationId == relation.id }
                .sortedWith(
                    compareBy<RelationEvent> { order[it.chapterId] ?: Int.MAX_VALUE }
                        .thenBy { it.created }
                        .thenBy { it.id }
                )
            for (index in 1 until events.size) {
                val previous = events[index - 1]
                val current = events[index]
                val typeGap = current.beforeType.isNotEmpty() &&
                    previous.afterType.isNotEmpty() &&
                    current.beforeType != previous.afterType
                val trustGap = current.beforeTrust != previous.afterTrust
                if (typeGap || trustGap) {
                    issues += AuditIssue(
                        id = "rel-gap-${current.id}",
                        kind = "relationship",
                        severity = Severity.NOTICE,
                        title = "「${relation.type}」的关系变化记录可能断档",
                        detail = "${chapterTitles[current.chapterId] ?: "某章"}记录的变化前状态为" +
                            "「${current.beforeType} / 信任 ${current.beforeTrust}」，" +
                            "而上一条记录结束于「${previous.afterType} / 信任 ${previous.afterTrust}」。" +
                            "如果是有意的回溯修订，可忽略。",
                        chapterId = current.chapterId
                    )
                }
            }
        }
        return issues
    }

    fun auditTimeline(
        chapterOrder: List<String>,
        chapterTitles: Map<String, String>,
        timeline: List<TimelineRef>
    ): List<AuditIssue> {
        val issues = mutableListOf<AuditIssue>()
        val order = chapterOrder.withIndex().associate { (index, id) -> id to index }

        // Missing chapter references.
        for (event in timeline) {
            if (event.chapterId.isNotEmpty() && event.chapterId !in order) {
                issues += AuditIssue(
                    id = "time-missing-${event.id}",
                    kind = "timeline",
                    severity = Severity.WARNING,
                    title = "事件「${event.title}」关联章节不存在",
                    detail = "请重新关联章节或删除这条事件。",
                    eventId = event.id
                )
            }
        }

        // Story date going backwards along chapter order.
        val grouped = LinkedHashMap<String, MutableList<Pair<TimelineRef, IntRange>>>()
        for (event in timeline) {
            val range = StoryDate.rangeOf(event.storyDate) ?: continue
            if (event.chapterId.isEmpty() || event.isFlashback) continue
            grouped.getOrPut(event.chapterId) { mutableListOf() } += event to range
        }
        var latest: Pair<TimelineRef, IntRange>? = null
        for (chapterId in chapterOrder) {
            val group = grouped[chapterId] ?: continue
            for (item in group) {
                val current = latest ?: continue
                if (item.second.last < current.second.first) {
                    issues += AuditIssue(
                        id = "time-reverse-${item.first.id}",
                        kind = "timeline",
                        severity = Severity.WARNING,
                        title = "故事时间可能倒退：${item.first.title}",
                        detail = "章节顺序上「${item.first.title}」晚于「${current.first.title}」，" +
                            "但故事日期 ${item.first.storyDate} 早于 ${current.first.storyDate}。" +
                            "如果是倒叙，请标记为非线性事件。",
                        chapterId = item.first.chapterId,
                        eventId = item.first.id
                    )
                }
            }
            for (item in group) {
                val current = latest
                if (current == null || item.second.first > current.second.first) latest = item
            }
        }
        return issues
    }
}
