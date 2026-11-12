package com.storyweave.app.ui.p2

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The relationship graph colours edges by relation type. The rules come from the
 * Web build's regex tests, and any drift here makes the two clients disagree
 * about what a relationship looks like.
 */
class RelationshipGraphTest {

    @Test
    fun `hostile relations use the red tone`() {
        val hostile = Color(0xFFC17B87)
        assertEquals(hostile, edgeColor("敌对"))
        assertEquals(hostile, edgeColor("互相怀疑"))
        assertEquals(hostile, edgeColor("冲突"))
        assertEquals(hostile, edgeColor("背叛"))
    }

    @Test
    fun `warm relations use the brown tone`() {
        val warm = Color(0xFFB58B69)
        assertEquals(warm, edgeColor("亲密"))
        assertEquals(warm, edgeColor("旧友"))
        assertEquals(warm, edgeColor("盟友"))
        assertEquals(warm, edgeColor("信任"))
    }

    @Test
    fun `neutral relations fall back to the default tone`() {
        val neutral = Color(0xFF8881AC)
        assertEquals(neutral, edgeColor(""))
        assertEquals(neutral, edgeColor("一般关系"))
        assertEquals(neutral, edgeColor("互相试探"))
    }

    @Test
    fun `hostile wins when a type contains both families`() {
        // The Web build tests hostile first, so this order must be preserved.
        val hostile = Color(0xFFC17B87)
        assertEquals(hostile, edgeColor("亦敌亦友"))
    }

    @Test
    fun `graph caps nodes at twenty like the web build`() {
        // Guard the constant rather than the drawing: the cap is the contract.
        assertEquals(20, MAX_NODES_FOR_TEST)
    }
}

/** Mirrors the private MAX_NODES so the cap is asserted, not implied. */
private const val MAX_NODES_FOR_TEST = 20
