package com.storyweave.app.data.json

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Atlas round trip and coordinate rules. A lost image (base64) or position
 * would silently destroy the author's cartography, so the round trip covers
 * them explicitly.
 */
class AtlasJsonRoundTripTest {

    private val maps = """
    [
      {
        "id": "m-1",
        "projectId": "w-1",
        "title": "雾城全域",
        "mode": "fiction",
        "width": 2048,
        "height": 1536,
        "image": "data:image/png;base64,iVBORw0KGgo=",
        "futureMapField": {"tone": "sepia"}
      },
      {
        "id": "m-2",
        "projectId": "w-1",
        "title": "真实世界",
        "mode": "earth",
        "width": 1024,
        "height": 1024,
        "image": "",
        "bounds": {"west": 110.0, "south": 20.0, "east": 122.0, "north": 40.0}
      }
    ]
    """.trimIndent()

    private val places = """
    [
      {
        "id": "pl-1",
        "projectId": "w-1",
        "mapId": "m-1",
        "name": "钟楼",
        "type": "城市",
        "aliases": ["旧钟楼", "老钟楼"],
        "description": "俯瞰全城。",
        "position": {"x": 512, "y": 300},
        "extraField": 42
      },
      {
        "id": "pl-2",
        "projectId": "w-1",
        "mapId": "m-2",
        "name": "未定锚点",
        "type": "其他",
        "aliases": [],
        "description": "",
        "extraField": 7
      }
    ]
    """.trimIndent()

    private fun parse(raw: String): JsonArray = Json.parseToJsonElement(raw) as JsonArray

    @Test
    fun `maps survive a decode encode cycle`() {
        val decoded = AtlasJson.decodeMaps(parse(maps))
        val encoded = JsonArray(decoded.map { AtlasJson.encodeMap(it) })
        assertEquals(parse(maps), parse(encoded.toString()))
    }

    @Test
    fun `map image and unmodelled fields survive`() {
        val decoded = AtlasJson.decodeMaps(parse(maps))
        assertTrue(decoded[0].image.startsWith("data:image/png;base64,"))
        assertTrue(decoded[0].extrasJson.contains("futureMapField"))
        assertNull(decoded[1].bounds?.let { null }) // placeholder to keep structure obvious
        assertEquals(110.0, decoded[1].bounds?.west ?: -1.0, 0.0001)
    }

    @Test
    fun `invalid mode rows are dropped like the web build`() {
        val broken = parse(
            """[{"id":"m-x","projectId":"w-1","title":"X","mode":"isometric","width":10,"height":10}]"""
        )
        assertEquals(0, AtlasJson.decodeMaps(broken).size)
    }

    @Test
    fun `places survive a decode encode cycle`() {
        val decoded = AtlasJson.decodePlaces(parse(places))
        val encoded = JsonArray(decoded.map { AtlasJson.encodePlace(it) })
        assertEquals(parse(places), parse(encoded.toString()))
    }

    @Test
    fun `place position and aliases survive`() {
        val decoded = AtlasJson.decodePlaces(parse(places))
        assertEquals(512.0 to 300.0, decoded[0].position)
        assertEquals(listOf("旧钟楼", "老钟楼"), decoded[0].aliases)
        assertNull(decoded[1].position) // unplaced
        assertTrue(decoded[0].extrasJson.contains("extraField"))
    }

    // ---------- coordinate rules ----------

    @Test
    fun `fiction positions are validated against pixel size`() {
        val map = AtlasJson.decodeMaps(parse(maps))[0]
        assertTrue(AtlasJson.validatePosition(map, 0.0, 0.0))
        assertTrue(AtlasJson.validatePosition(map, 2048.0, 1536.0))
        assertFalse(AtlasJson.validatePosition(map, 2049.0, 100.0))
        assertFalse(AtlasJson.validatePosition(map, -1.0, 100.0))
    }

    @Test
    fun `earth positions are validated against bounds`() {
        val map = AtlasJson.decodeMaps(parse(maps))[1]
        assertTrue(AtlasJson.validatePosition(map, 118.0, 30.0))
        assertFalse(AtlasJson.validatePosition(map, 100.0, 30.0)) // west of bounds
        assertFalse(AtlasJson.validatePosition(map, 118.0, 50.0)) // north of bounds
    }
}
