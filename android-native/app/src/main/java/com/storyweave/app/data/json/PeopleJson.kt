package com.storyweave.app.data.json

import com.storyweave.app.data.db.CharacterEntity
import com.storyweave.app.data.db.RelationEntity
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/**
 * JSON ↔ row mapping for characters and relations.
 *
 * Extracted from the repository so the loss-free round trip can be tested on the
 * JVM without a database. Any field the native app does not model rides in
 * `extrasJson` and is written back verbatim.
 */
object PeopleJson {

    val CHARACTER_KEYS = setOf(
        "id", "projectId", "name", "role", "personality", "goal", "knowledge", "secret", "created"
    )
    val RELATION_KEYS = setOf("id", "projectId", "a", "b", "type", "detail", "private")

    fun decodeCharacters(array: JsonArray): List<CharacterEntity> =
        array.mapIndexedNotNull { index, element ->
            val obj = runCatching { element.jsonObject }.getOrNull() ?: return@mapIndexedNotNull null
            val id = JsonLossless.string(obj["id"]) ?: return@mapIndexedNotNull null
            val extras = LinkedHashMap<String, JsonElement>()
            for ((key, value) in obj) if (key !in CHARACTER_KEYS) extras[key] = value
            val modeledKeys = CHARACTER_KEYS.filter { obj.containsKey(it) }
            CharacterEntity(
                id = id,
                projectId = JsonLossless.string(obj["projectId"]) ?: "",
                name = JsonLossless.string(obj["name"]) ?: "",
                role = JsonLossless.string(obj["role"]) ?: "",
                personality = JsonLossless.string(obj["personality"]) ?: "",
                goal = JsonLossless.string(obj["goal"]) ?: "",
                knowledge = JsonLossless.string(obj["knowledge"]) ?: "",
                secret = JsonLossless.string(obj["secret"]) ?: "",
                created = JsonLossless.string(obj["created"]) ?: "",
                extrasJson = JsonObject(extras).toString(),
                modeledKeysJson = JsonArray(modeledKeys.map { JsonLossless.primitive(it) }).toString(),
                position = index
            )
        }

    fun decodeRelations(array: JsonArray): List<RelationEntity> =
        array.mapIndexedNotNull { index, element ->
            val obj = runCatching { element.jsonObject }.getOrNull() ?: return@mapIndexedNotNull null
            val id = JsonLossless.string(obj["id"]) ?: return@mapIndexedNotNull null
            val extras = LinkedHashMap<String, JsonElement>()
            for ((key, value) in obj) if (key !in RELATION_KEYS) extras[key] = value
            val modeledKeys = RELATION_KEYS.filter { obj.containsKey(it) }
            RelationEntity(
                id = id,
                projectId = JsonLossless.string(obj["projectId"]) ?: "",
                a = JsonLossless.string(obj["a"]) ?: "",
                b = JsonLossless.string(obj["b"]) ?: "",
                type = JsonLossless.string(obj["type"]) ?: "",
                detail = JsonLossless.string(obj["detail"]) ?: "",
                privateRelation = JsonLossless.bool(obj["private"]),
                extrasJson = JsonObject(extras).toString(),
                modeledKeysJson = JsonArray(modeledKeys.map { JsonLossless.primitive(it) }).toString(),
                position = index
            )
        }

    fun encodeCharacter(row: CharacterEntity): JsonObject {
        val fields = LinkedHashMap<String, JsonElement>()
        // extras first; modelled fields after, but only the keys that existed in
        // the source JSON. This keeps absent keys absent and empty strings present.
        runCatching {
            val extras = kotlinx.serialization.json.Json.parseToJsonElement(row.extrasJson)
            if (extras is JsonObject) fields.putAll(extras)
        }
        val present = runCatching {
            kotlinx.serialization.json.Json.parseToJsonElement(row.modeledKeysJson) as? JsonArray
        }.getOrNull()?.mapNotNull { JsonLossless.string(it) }?.toSet()
            ?: CHARACTER_KEYS // Legacy rows without the key set keep the old behaviour.
        for (key in CHARACTER_KEYS) {
            if (key !in present) continue
            when (key) {
                "id" -> fields[key] = JsonLossless.primitive(row.id)
                "projectId" -> fields[key] = JsonLossless.primitive(row.projectId)
                "name" -> fields[key] = JsonLossless.primitive(row.name)
                "role" -> fields[key] = JsonLossless.primitive(row.role)
                "personality" -> fields[key] = JsonLossless.primitive(row.personality)
                "goal" -> fields[key] = JsonLossless.primitive(row.goal)
                "knowledge" -> fields[key] = JsonLossless.primitive(row.knowledge)
                "secret" -> fields[key] = JsonLossless.primitive(row.secret)
                "created" -> fields[key] = JsonLossless.primitive(row.created)
                else -> continue
            }
        }
        return JsonObject(fields)
    }

    fun encodeRelation(row: RelationEntity): JsonObject {
        val fields = LinkedHashMap<String, JsonElement>()
        runCatching {
            val extras = kotlinx.serialization.json.Json.parseToJsonElement(row.extrasJson)
            if (extras is JsonObject) fields.putAll(extras)
        }
        val present = runCatching {
            kotlinx.serialization.json.Json.parseToJsonElement(row.modeledKeysJson) as? JsonArray
        }.getOrNull()?.mapNotNull { JsonLossless.string(it) }?.toSet()
            ?: RELATION_KEYS
        for (key in RELATION_KEYS) {
            if (key !in present) continue
            when (key) {
                "id" -> fields[key] = JsonLossless.primitive(row.id)
                "projectId" -> fields[key] = JsonLossless.primitive(row.projectId)
                "a" -> fields[key] = JsonLossless.primitive(row.a)
                "b" -> fields[key] = JsonLossless.primitive(row.b)
                "type" -> fields[key] = JsonLossless.primitive(row.type)
                "detail" -> fields[key] = JsonLossless.primitive(row.detail)
                "private" -> fields[key] = JsonLossless.primitive(row.privateRelation)
                else -> continue
            }
        }
        return JsonObject(fields)
    }
}
