package com.storyweave.app.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class DailyProgressTest {

    @Test
    fun `goal clamped to the web range`() {
        assertEquals(100, DailyProgress.clampedGoal(0))
        assertEquals(50000, DailyProgress.clampedGoal(999999))
        assertEquals(2000, DailyProgress.clampedGoal(2000))
    }

    @Test
    fun `count resets when the day rolls over`() {
        assertEquals(0, DailyProgress.todayCount("2026-11-11", 1500))
        val today = DailyProgress.today()
        assertEquals(1500, DailyProgress.todayCount(today, 1500))
    }

    @Test
    fun `only additions count and rollover keeps the base zero`() {
        val (d1, c1) = DailyProgress.add("2026-11-11", 1500, 300)
        assertEquals(DailyProgress.today(), d1)
        assertEquals(300, c1)
        val (d2, c2) = DailyProgress.add(d1, c1, 200)
        assertEquals(500, c2)
        assertEquals(500, DailyProgress.add(d2, c2, -100).second) // negative delta clamped to 0
    }

    @Test
    fun `percent capped at hundred`() {
        assertEquals(50, DailyProgress.percent(400, 800))
        assertEquals(100, DailyProgress.percent(1200, 800))
        assertEquals(0, DailyProgress.percent(0, 800))
    }
}
