package com.storyweave.app.domain

/**
 * Daily writing goal progress, ported from the Web build's `progress()` /
 * `updateToday()`: only additions count (deleting text never reduces the
 * counter), and the counter resets when the calendar date changes.
 */
object DailyProgress {

    const val DEFAULT_GOAL = 800
    const val MIN_GOAL = 100
    const val MAX_GOAL = 50000

    fun today(): String = java.time.LocalDate.now().toString()

    /** Goal clamped like the Web build (100–50000, default 800). */
    fun clampedGoal(raw: Int): Int = raw.coerceIn(MIN_GOAL, MAX_GOAL)

    /**
     * @param storedDate the date currently stored on the work ("" = none)
     * @param storedCount the count stored for that date
     */
    fun todayCount(storedDate: String, storedCount: Int): Int =
        if (storedDate == today()) storedCount else 0

    /** Adds a non-negative delta, resetting when the day rolled over. */
    fun add(storedDate: String, storedCount: Int, delta: Int, date: String = today()): Pair<String, Int> {
        val base = if (storedDate == date) storedCount else 0
        return date to (base + delta.coerceAtLeast(0))
    }

    fun percent(today: Int, goal: Int): Int =
        if (goal <= 0) 0 else (today * 100 / goal).coerceIn(0, 100)
}
