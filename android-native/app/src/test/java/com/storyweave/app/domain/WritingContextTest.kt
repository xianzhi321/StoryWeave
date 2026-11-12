package com.storyweave.app.domain

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import org.junit.Assert.assertEquals
import org.junit.Test

class WritingContextTest {

    private fun person(id: String, name: String, goal: String, role: String = "") =
        Json.parseToJsonElement("""{"id":"$id","name":"$name","goal":"$goal","role":"$role"}""") as kotlinx.serialization.json.JsonObject

    private fun plot(id: String, title: String, status: String) =
        Json.parseToJsonElement("""{"id":"$id","title":"$title","status":"$status"}""") as kotlinx.serialization.json.JsonObject

    @Test
    fun `only characters named in the text are mentioned`() {
        val people = listOf(
            person("r1", "林澈", "查明真相"),
            person("r2", "沈雾", "守住秘密"),
            person("r3", "赵六", "无戏份")
        )
        val text = "林澈拆开信，沈雾在门外。"
        val mentions = WritingContext.mentionedCharacters(text, people)
        assertEquals(listOf("林澈", "沈雾"), mentions.map { it.name })
        assertEquals("查明真相", mentions[0].detail)
    }

    @Test
    fun `empty name rows are skipped`() {
        val people = listOf(person("r-x", "", "无名"))
        assertEquals(0, WritingContext.mentionedCharacters("正文提及", people).size)
    }

    private fun plotWithLinks(id: String, title: String, status: String, links: String) =
        Json.parseToJsonElement("""{"id":"$id","title":"$title","status":"$status","chapterLinks":$links}""")
            as kotlinx.serialization.json.JsonObject

    @Test
    fun `plots linked to this chapter or named in the text are relevant`() {
        val plots = listOf(
            plotWithLinks("p1", "失踪列车", "发展中", """["ch-1","ch-9"]"""),
            plotWithLinks("p2", "雾中旧钟", "收尾", """["ch-5"]"""),
            plot("p3", "无关线索", "发展中")
        )
        val relevant = WritingContext.relevantPlots("ch-1", "正文提到失踪列车的事", plots)
        // p1: linked via chapterLinks; p3: title named in text… p3 title is 无关线索 not in text.
        assertEquals(listOf("失踪列车"), relevant.map { it.name })
    }

    @Test
    fun `plot title appearing in text counts even without links`() {
        val plots = listOf(plot("p4", "红伞之谜", "发展中"))
        val relevant = WritingContext.relevantPlots("ch-1", "她收起了那把红伞之谜般的东西", plots)
        assertEquals(1, relevant.size)
    }
}
