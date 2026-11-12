package com.storyweave.app.data.json

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * People round trip.
 *
 * Characters and relations moved from raw JSON rows into typed tables in P2.
 * That refactor is only safe if a load → save cycle still reproduces the original
 * JSON, including fields the native app does not model.
 */
class PeopleJsonRoundTripTest {

    private val json = Json { prettyPrint = false }

    private val characters = """
    [
      {
        "id": "r-1",
        "projectId": "w-1",
        "name": "林澈",
        "role": "旧书店临时店员",
        "personality": "寡言、谨慎",
        "goal": "查明十三年前列车失踪事件",
        "knowledge": "知道旧车票来源",
        "secret": "认得信封字迹",
        "created": "2026-11-11T05:35:44.000Z",
        "futureField": {"nested": true},
        "avatar": "river"
      }
    ]
    """.trimIndent()

    private val relations = """
    [
      {
        "id": "rel-1",
        "projectId": "w-1",
        "a": "r-1",
        "b": "r-2",
        "type": "互相试探",
        "detail": "彼此寻找线索",
        "private": true,
        "history": [{"at":"2026-11-11T08:00:00.000Z","type":"旧识"}],
        "trustNote": "低"
      }
    ]
    """.trimIndent()

    @Test
    fun `characters survive a decode encode cycle`() {
        val decoded = PeopleJson.decodeCharacters(tree(characters))
        val encoded = JsonArray(decoded.map { PeopleJson.encodeCharacter(it) })
        assertEquals(tree(characters), tree(encoded.toString()))
    }

    @Test
    fun `unmodelled character fields survive`() {
        val decoded = PeopleJson.decodeCharacters(tree(characters)).single()
        assertTrue(decoded.extrasJson.contains("futureField"))
        assertTrue(decoded.extrasJson.contains("avatar"))
        val encoded = PeopleJson.encodeCharacter(decoded).toString()
        assertTrue(encoded.contains("futureField"))
        assertTrue(encoded.contains("river"))
    }

    @Test
    fun `relations survive a decode encode cycle`() {
        val decoded = PeopleJson.decodeRelations(tree(relations))
        val encoded = JsonArray(decoded.map { PeopleJson.encodeRelation(it) })
        assertEquals(tree(relations), tree(encoded.toString()))
    }

    @Test
    fun `private flag and unmodelled relation fields survive`() {
        val decoded = PeopleJson.decodeRelations(tree(relations)).single()
        assertTrue(decoded.privateRelation)
        assertTrue(decoded.extrasJson.contains("history"))
        assertTrue(decoded.extrasJson.contains("trustNote"))
        val encoded = PeopleJson.encodeRelation(decoded).toString()
        assertTrue(encoded.contains("\"private\":true"))
        assertTrue(encoded.contains("trustNote"))
    }

    @Test
    fun `empty string fields keep their key`() {
        // Found by the module audit: the old encoder wrote modelled fields only
        // when non-empty, so role:"" lost its key across a round trip.
        val withEmpty = tree(
            """[{"id":"r-1","projectId":"w-1","name":"空字段","role":"","personality":"",
                 "goal":"","knowledge":"","secret":"","created":""}]"""
        )
        val decoded = PeopleJson.decodeCharacters(withEmpty).single()
        val encoded = JsonArray(listOf(PeopleJson.encodeCharacter(decoded)))
        assertEquals(tree(withEmpty.toString()), tree(encoded.toString()))
    }

    @Test
    fun `absent keys stay absent`() {
        // A row that never had role/personality/... must not grow empty keys.
        val minimal = tree("""[{"id":"r-2","name":"极简"}]""")
        val decoded = PeopleJson.decodeCharacters(minimal).single()
        val encoded = JsonArray(listOf(PeopleJson.encodeCharacter(decoded)))
        val roundTripped = (tree(encoded.toString()).single() as JsonObject)
        assertEquals(2, roundTripped.size)
        assertTrue(roundTripped.containsKey("id"))
        assertTrue(roundTripped.containsKey("name"))
    }

    @Test
    fun `empty relation detail keeps its key`() {
        val withEmptyDetail = tree(
            """[{"id":"rel-1","projectId":"w-1","a":"r-1","b":"r-2","type":"盟友",
                 "detail":"","private":false}]"""
        )
        val decoded = PeopleJson.decodeRelations(withEmptyDetail).single()
        val encoded = JsonArray(listOf(PeopleJson.encodeRelation(decoded)))
        assertEquals(tree(withEmptyDetail.toString()), tree(encoded.toString()))
    }

    @Test
    fun `position follows array order`() {
        val two = tree("""[{"id":"r-1","name":"A"},{"id":"r-2","name":"B"}]""")
        val decoded = PeopleJson.decodeCharacters(two)
        assertEquals(listOf(0, 1), decoded.map { it.position })
        assertEquals(listOf("r-1", "r-2"), decoded.map { it.id })
    }

    @Test
    fun `entries without an id are dropped like the web build`() {
        val broken = tree("""[{"name":"没有 id"},{"id":"r-9","name":"正常"}]""")
        val decoded = PeopleJson.decodeCharacters(broken)
        assertEquals(1, decoded.size)
        assertEquals("r-9", decoded.single().id)
    }

    private fun tree(raw: String): JsonArray =
        json.parseToJsonElement(raw) as JsonArray
}
