package com.storyweave.app.data.json

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.JsonPrimitive

/**
 * World atlas mapping — worldMaps / worldPlaces, ported from atlas-core.js.
 *
 * Maps carry a base64 image (≤6 MB, png/jpeg/webp), a pixel size 1–4096, and
 * either `fiction` (pixel coordinates) or `earth` (geo bounds) mode. Places
 * belong to exactly one map; their position must fall inside the map bounds.
 * Unknown fields ride in `extrasJson` as everywhere else.
 */
object AtlasJson {

    val PLACE_TYPES = listOf("城市", "城镇", "村庄", "据点", "遗迹", "自然", "其他")

    data class Bounds(val west: Double, val south: Double, val east: Double, val north: Double)

    data class MapData(
        val id: String,
        val projectId: String,
        val title: String,
        val mode: String,
        val width: Int,
        val height: Int,
        val image: String,
        val bounds: Bounds?,
        val boundsJson: JsonElement?,
        val extrasJson: String,
        val modeledKeysJson: String,
        val position: Int
    )

    data class Place(
        val id: String,
        val projectId: String,
        val mapId: String,
        val name: String,
        val type: String,
        val aliases: List<String>,
        val description: String,
        /** Null = not yet placed on the map. */
        val position: Pair<Double, Double>?,
        val extrasJson: String,
        val modeledKeysJson: String,
        val position2: Int
    )

    fun decodeMaps(array: JsonArray): List<MapData> =
        array.mapIndexedNotNull { index, element ->
            val obj = element as? JsonObject ?: return@mapIndexedNotNull null
            val id = JsonLossless.string(obj["id"]) ?: return@mapIndexedNotNull null
            val projectId = JsonLossless.string(obj["projectId"]) ?: return@mapIndexedNotNull null
            val mode = JsonLossless.string(obj["mode"]) ?: return@mapIndexedNotNull null
            if (mode != "fiction" && mode != "earth") return@mapIndexedNotNull null
            val width = JsonLossless.int(obj["width"], -1)
            val height = JsonLossless.int(obj["height"], -1)
            val extras = LinkedHashMap<String, JsonElement>()
            for ((key, value) in obj) if (key !in MAP_KEYS) extras[key] = value
            val boundsObj = obj["bounds"] as? JsonObject
            MapData(
                id = id,
                projectId = projectId,
                title = JsonLossless.string(obj["title"]) ?: "",
                mode = mode,
                width = width,
                height = height,
                image = JsonLossless.string(obj["image"]) ?: "",
                bounds = boundsObj?.let { boundsValue ->
                    fun number(key: String): Double =
                        (boundsValue[key] as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.0
                    Bounds(number("west"), number("south"), number("east"), number("north"))
                },
                boundsJson = boundsObj,
                extrasJson = JsonObject(extras).toString(),
                modeledKeysJson = JsonArray(
                    MAP_KEYS.filter { obj.containsKey(it) }.map { JsonLossless.primitive(it) }
                ).toString(),
                position = index
            )
        }

    fun decodePlaces(array: JsonArray): List<Place> =
        array.mapIndexedNotNull { index, element ->
            val obj = element as? JsonObject ?: return@mapIndexedNotNull null
            val id = JsonLossless.string(obj["id"]) ?: return@mapIndexedNotNull null
            val extras = LinkedHashMap<String, JsonElement>()
            for ((key, value) in obj) if (key !in PLACE_KEYS) extras[key] = value
            val positionObj = obj["position"] as? JsonObject
            val position = positionObj?.let {
                val x = (it["x"] as? JsonPrimitive)?.content?.toDoubleOrNull()
                val y = (it["y"] as? JsonPrimitive)?.content?.toDoubleOrNull()
                if (x != null && y != null) x to y else null
            }
            Place(
                id = id,
                projectId = JsonLossless.string(obj["projectId"]) ?: "",
                mapId = JsonLossless.string(obj["mapId"]) ?: "",
                name = JsonLossless.string(obj["name"]) ?: "",
                type = PLACE_TYPES.firstOrNull { it == JsonLossless.string(obj["type"]) } ?: "其他",
                aliases = (obj["aliases"] as? JsonArray)
                    ?.mapNotNull { JsonLossless.string(it) }
                    ?.filter { it.isNotEmpty() }
                    ?.distinct()
                    ?.take(20) ?: emptyList(),
                description = JsonLossless.string(obj["description"]) ?: "",
                position = position,
                extrasJson = JsonObject(extras).toString(),
                modeledKeysJson = JsonArray(
                    PLACE_KEYS.filter { obj.containsKey(it) }.map { JsonLossless.primitive(it) }
                ).toString(),
                position2 = index
            )
        }

    fun encodeMap(map: MapData): JsonObject {
        val fields = LinkedHashMap<String, JsonElement>()
        runCatching {
            val extras = kotlinx.serialization.json.Json.parseToJsonElement(map.extrasJson)
            if (extras is JsonObject) fields.putAll(extras)
        }
        val present = presentKeys(map.modeledKeysJson, MAP_KEYS)
        for (key in MAP_KEYS) {
            if (key !in present) continue
            when (key) {
                "id" -> fields[key] = JsonLossless.primitive(map.id)
                "projectId" -> fields[key] = JsonLossless.primitive(map.projectId)
                "title" -> fields[key] = JsonLossless.primitive(map.title)
                "mode" -> fields[key] = JsonLossless.primitive(map.mode)
                "width" -> fields[key] = JsonLossless.primitive(map.width)
                "height" -> fields[key] = JsonLossless.primitive(map.height)
                "image" -> fields[key] = JsonLossless.primitive(map.image)
                "bounds" -> map.boundsJson?.let { fields[key] = it }
            }
        }
        return JsonObject(fields)
    }

    fun encodePlace(place: Place): JsonObject {
        val fields = LinkedHashMap<String, JsonElement>()
        runCatching {
            val extras = kotlinx.serialization.json.Json.parseToJsonElement(place.extrasJson)
            if (extras is JsonObject) fields.putAll(extras)
        }
        val present = presentKeys(place.modeledKeysJson, PLACE_KEYS)
        for (key in PLACE_KEYS) {
            if (key !in present) continue
            when (key) {
                "id" -> fields[key] = JsonLossless.primitive(place.id)
                "projectId" -> fields[key] = JsonLossless.primitive(place.projectId)
                "mapId" -> fields[key] = JsonLossless.primitive(place.mapId)
                "name" -> fields[key] = JsonLossless.primitive(place.name)
                "type" -> fields[key] = JsonLossless.primitive(place.type)
                "aliases" -> fields[key] = JsonArray(place.aliases.map { JsonLossless.primitive(it) })
                "description" -> fields[key] = JsonLossless.primitive(place.description)
                "position" -> place.position?.let { (x, y) ->
                    fields[key] = buildJsonObject {
                        put("x", JsonLossless.number(x))
                        put("y", JsonLossless.number(y))
                    }
                }
            }
        }
        return JsonObject(fields)
    }

    /** Place position must fall inside its map's bounds (fiction: pixel size). */
    fun validatePosition(map: MapData, x: Double, y: Double): Boolean {
        val bounds = if (map.mode == "earth") {
            map.bounds ?: Bounds(0.0, 0.0, 0.0, 0.0)
        } else {
            Bounds(0.0, 0.0, map.width.toDouble(), map.height.toDouble())
        }
        return x in bounds.west..bounds.east && y in bounds.south..bounds.north
    }

    private fun presentKeys(modeledKeysJson: String, all: List<String>): Set<String> =
        runCatching {
            (kotlinx.serialization.json.Json.parseToJsonElement(modeledKeysJson) as? JsonArray)
                ?.mapNotNull { JsonLossless.string(it) }
                ?.toSet()
        }.getOrNull() ?: all.toSet()

    private val MAP_KEYS = listOf(
        "id", "projectId", "title", "mode", "width", "height", "image", "bounds"
    )
    private val PLACE_KEYS = listOf(
        "id", "projectId", "mapId", "name", "type", "aliases", "description", "position"
    )
}
