package com.storyweave.app.domain

import com.storyweave.app.data.db.RelationEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * These tests encode the Web build's audit rules. If the native app starts
 * disagreeing with the Web one about whether a manuscript has a problem, that is
 * a real bug: the author would get different advice from the two clients.
 */
class ContinuityAuditTest {

    private val chapters = listOf("ch-1", "ch-2", "ch-3")
    private val titles = mapOf("ch-1" to "第一章", "ch-2" to "第二章", "ch-3" to "第三章")

    // ---------- 伏笔 ----------

    @Test
    fun `link to a missing chapter is a warning`() {
        val issues = ContinuityAudit.auditPlotLinks(
            chapters, titles,
            listOf(PlotRef("p1", "失踪列车")),
            listOf(PlotLink("l1", "p1", "ch-deleted", "planted", false))
        )
        assertTrue(issues.any { it.id == "plot-missing-l1" && it.severity == Severity.WARNING })
    }

    @Test
    fun `links without a plant stage are a notice`() {
        val issues = ContinuityAudit.auditPlotLinks(
            chapters, titles,
            listOf(PlotRef("p1", "失踪列车")),
            listOf(PlotLink("l1", "p1", "ch-1", "mention", false))
        )
        assertTrue(issues.any { it.id == "plot-no-plant-p1" && it.severity == Severity.NOTICE })
    }

    @Test
    fun `multiple payoffs are a notice`() {
        val issues = ContinuityAudit.auditPlotLinks(
            chapters, titles,
            listOf(PlotRef("p1", "失踪列车")),
            listOf(
                PlotLink("l0", "p1", "ch-1", "planted", false),
                PlotLink("l1", "p1", "ch-2", "payoff", false),
                PlotLink("l2", "p1", "ch-3", "payoff", false)
            )
        )
        assertTrue(issues.any { it.id == "plot-multi-payoff-p1" })
    }

    @Test
    fun `payoff before plant is a warning`() {
        val issues = ContinuityAudit.auditPlotLinks(
            chapters, titles,
            listOf(PlotRef("p1", "失踪列车")),
            listOf(
                PlotLink("l0", "p1", "ch-3", "planted", false),
                PlotLink("l1", "p1", "ch-1", "payoff", false)
            )
        )
        assertTrue(issues.any { it.id == "plot-order-p1-l1" && it.severity == Severity.WARNING })
    }

    @Test
    fun `nonlinear payoff does not warn`() {
        val issues = ContinuityAudit.auditPlotLinks(
            chapters, titles,
            listOf(PlotRef("p1", "失踪列车")),
            listOf(
                PlotLink("l0", "p1", "ch-3", "planted", false),
                PlotLink("l1", "p1", "ch-1", "payoff", true) // allowNonlinear
            )
        )
        assertTrue(issues.none { it.id.startsWith("plot-order") })
    }

    // ---------- 关系 ----------

    private fun event(id: String, chapter: String, before: String, beforeTrust: Int, after: String, afterTrust: Int, at: String) =
        RelationEvent(
            id = id, relationId = "rel-1", chapterId = chapter,
            beforeType = before, beforeTrust = beforeTrust,
            afterType = after, afterTrust = afterTrust,
            cause = "", created = at
        )

    @Test
    fun `dangling relation reference is a warning`() {
        val issues = ContinuityAudit.auditRelationshipHistory(
            chapters, titles,
            listOf(RelationRef("rel-1", "互相试探")),
            listOf(event("e9", "ch-99", "", 0, "盟友", 10, "2026-01-01"))
        )
        assertTrue(issues.any { it.id == "rel-invalid-e9" && it.severity == Severity.WARNING })
    }

    @Test
    fun `gap between consecutive changes is a notice`() {
        // e1 ends at 盟友/40, e2 claims it started from 敌对/0 → gap.
        val issues = ContinuityAudit.auditRelationshipHistory(
            chapters, titles,
            listOf(RelationRef("rel-1", "互相试探")),
            listOf(
                event("e1", "ch-1", "互相试探", 0, "盟友", 40, "2026-01-01"),
                event("e2", "ch-2", "敌对", 0, "决裂", -80, "2026-01-02")
            )
        )
        assertTrue(issues.any { it.id == "rel-gap-e2" && it.severity == Severity.NOTICE })
    }

    @Test
    fun `consistent chain has no gap`() {
        val issues = ContinuityAudit.auditRelationshipHistory(
            chapters, titles,
            listOf(RelationRef("rel-1", "互相试探")),
            listOf(
                event("e1", "ch-1", "互相试探", 0, "盟友", 40, "2026-01-01"),
                event("e2", "ch-2", "盟友", 40, "决裂", -80, "2026-01-02")
            )
        )
        assertTrue(issues.none { it.id.startsWith("rel-gap") })
    }

    @Test
    fun `events are ordered by chapter before created timestamp`() {
        // e-late sits in ch-1 but was created after e-early in ch-2.
        // Chapter order must win, so the chain reads e-late → e-early and is consistent.
        val issues = ContinuityAudit.auditRelationshipHistory(
            chapters, titles,
            listOf(RelationRef("rel-1", "互相试探")),
            listOf(
                event("e-late", "ch-1", "互相试探", 0, "盟友", 40, "2026-02-01"),
                event("e-early", "ch-2", "盟友", 40, "决裂", -80, "2026-01-01")
            )
        )
        assertTrue(issues.none { it.id.startsWith("rel-gap") })
    }

    // ---------- 编年 ----------

    @Test
    fun `story date going backwards is a warning`() {
        val issues = ContinuityAudit.auditTimeline(
            chapters, titles,
            listOf(
                TimelineRef("t1", "婚礼", "ch-1", "2026-05-01", false),
                TimelineRef("t2", "童年", "ch-2", "2020-01-01", false)
            )
        )
        assertTrue(issues.any { it.id == "time-reverse-t2" && it.severity == Severity.WARNING })
    }

    @Test
    fun `flashback events are exempt from the backwards rule`() {
        val issues = ContinuityAudit.auditTimeline(
            chapters, titles,
            listOf(
                TimelineRef("t1", "婚礼", "ch-1", "2026-05-01", false),
                TimelineRef("t2", "童年", "ch-2", "2020-01-01", true) // isFlashback
            )
        )
        assertTrue(issues.none { it.id.startsWith("time-reverse") })
    }

    @Test
    fun `event with a missing chapter is a warning`() {
        val issues = ContinuityAudit.auditTimeline(
            chapters, titles,
            listOf(TimelineRef("t1", "婚礼", "ch-404", "2026-05-01", false))
        )
        assertTrue(issues.any { it.id == "time-missing-t1" })
    }

    @Test
    fun `forward chronology has no issues`() {
        val issues = ContinuityAudit.auditTimeline(
            chapters, titles,
            listOf(
                TimelineRef("t1", "来信", "ch-1", "2026-01-01", false),
                TimelineRef("t2", "会面", "ch-2", "2026-03-01", false),
                TimelineRef("t3", "决裂", "ch-3", "2026-09-01", false)
            )
        )
        assertTrue(issues.isEmpty())
    }

    // ---------- 日期解析 ----------

    @Test
    fun `story date range expands partial dates`() {
        assertEquals(20260101..20261231, StoryDate.rangeOf("2026"))
        assertEquals(20260301..20260331, StoryDate.rangeOf("2026-03"))
        assertEquals(20260315..20260315, StoryDate.rangeOf("2026-03-15"))
    }

    @Test
    fun `invalid story dates are rejected`() {
        assertNull(StoryDate.rangeOf(""))
        assertNull(StoryDate.rangeOf("明年春天"))
        assertNull(StoryDate.rangeOf("26-1-1"))
    }

    @Test
    fun `cross validation with the web engine on one shared input`() {
        // The input and the expected output were produced by running the same
        // object through the Web build's auditContinuity(). Both engines must
        // agree on id AND severity, or the two clients give different advice.
        val plots = listOf(
            PlotRef("p1", "失踪列车", "发展中"),
            PlotRef("p2", "无关联线索", "发展中")
        )
        val links = listOf(
            PlotLink("l1", "p1", "ch-3", "planted", false),
            PlotLink("l2", "p1", "ch-1", "payoff", false),
            PlotLink("l3", "p1", "ch-404", "mention", false)
        )
        val relations = listOf(RelationRef("rel-1", "互相试探"))
        val history = listOf(
            RelationEvent("e1", "rel-1", "ch-1", "陌生", 0, "盟友", 40, "", "2026-01-01"),
            RelationEvent("e2", "rel-1", "ch-2", "敌对", 0, "决裂", -80, "", "2026-01-02"),
            RelationEvent("e9", "rel-x", "ch-2", "", 0, "盟友", 10, "", "2026-01-03")
        )
        val timeline = listOf(
            TimelineRef("t1", "婚礼", "ch-1", "2026-05-01", false),
            TimelineRef("t2", "童年", "ch-2", "2020-01-01", false)
        )
        val report = ContinuityAudit.audit(
            chapters, titles, plots, links, relations, history, timeline
        )
        val ids = report.issues.map { it.id }.sorted()
        // Web 基准（node 跑 narrative-core.js auditContinuity 的实测输出）
        val expected = listOf(
            "plot-missing-l3", "plot-order-p1-l2", "plot-unlinked-p2",
            "rel-gap-e2", "rel-invalid-e9", "time-reverse-t2"
        )
        assertEquals(expected, ids)
        assertEquals(4, report.counts[Severity.WARNING])
        assertEquals(1, report.counts[Severity.NOTICE])
        assertEquals(1, report.counts[Severity.INFO])
        // severity 也要一致：抽查三条
        assertEquals(Severity.WARNING, report.issues.first { it.id == "plot-missing-l3" }.severity)
        assertEquals(Severity.INFO, report.issues.first { it.id == "plot-unlinked-p2" }.severity)
        assertEquals(Severity.NOTICE, report.issues.first { it.id == "rel-gap-e2" }.severity)
    }

    @Test
    fun `report counts severities`() {
        val report = ContinuityAudit.audit(
            chapterOrder = chapters,
            chapterTitles = titles,
            plots = listOf(PlotRef("p1", "失踪列车")),
            links = listOf(PlotLink("l1", "p1", "ch-404", "mention", false)),
            relations = listOf(RelationRef("rel-1", "互相试探")),
            history = emptyList(),
            timeline = listOf(TimelineRef("t1", "婚礼", "ch-404", "2026-05-01", false))
        )
        assertEquals(2, report.counts[Severity.WARNING])
        assertEquals(1, report.counts[Severity.NOTICE])
        assertEquals(0, report.counts[Severity.CRITICAL])
    }
}
