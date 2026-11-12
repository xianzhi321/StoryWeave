package com.storyweave.app.ui.p5

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import android.graphics.BitmapFactory
import android.util.Base64
import kotlinx.serialization.json.JsonObject

/**
 * P5: 世界地图.
 *
 * The base image comes from the map's base64 PNG/JPEG/WEBP (stored by the Web
 * build); places are drawn as labelled dots on top. Azgaar generation is NOT
 * ported — the charter's WebView ban covers it, and this is stated in the UI
 * and in the migration ledger.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AtlasScreen(
    maps: List<JsonObject>,
    places: List<JsonObject>,
    onBack: () -> Unit,
    onSavePlaces: (List<JsonObject>) -> Unit = {},
    workId: String = ""
) {
    var tabIndex by remember { mutableStateOf(0) }
    var selectedMapId by remember { mutableStateOf<String?>(null) }

    val mapOf = remember(maps) {
        maps.mapNotNull { row ->
            val id = (row["id"] as? kotlinx.serialization.json.JsonPrimitive)?.content
            id?.let { it to row }
        }.toMap()
    }
    val activeMapId = selectedMapId ?: maps.firstOrNull()?.let {
        (it["id"] as? kotlinx.serialization.json.JsonPrimitive)?.content
    }
    val activeMap = activeMapId?.let { mapOf[it] }
    val activeMapPlaces = places.filter {
        ((it["mapId"] as? kotlinx.serialization.json.JsonPrimitive)?.content) == activeMapId
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("世界地图") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, contentDescription = "返回") }
                }
            )
        }
    ) { inner ->
        Column(modifier = Modifier.fillMaxSize().padding(inner)) {
            if (maps.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("还没有地图", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Web 版的一键地图生成（Azgaar）依赖 WebView，按章程未迁移。" +
                            "可在 Web 版生成后通过 JSON 备份带入底图。",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            } else {
                if (maps.size > 1) {
                    TabRow(selectedTabIndex = maps.indexOfFirst {
                        (it["id"] as? kotlinx.serialization.json.JsonPrimitive)?.content == activeMapId
                    }.coerceAtLeast(0)) {
                        for (map in maps) {
                            val id = (map["id"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: ""
                            Tab(
                                selected = id == activeMapId,
                                onClick = { selectedMapId = id },
                                text = {
                                    Text(
                                        (map["title"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: "未命名",
                                        maxLines = 1, overflow = TextOverflow.Ellipsis
                                    )
                                }
                            )
                        }
                    }
                }
                MapCanvas(
                    activeMap, activeMapPlaces, modifier = Modifier.weight(1f),
                    onTapPosition = { mapX, mapY ->
                        // 长按/点击落点：把第一个未定位的地点放到该坐标，或新建地点。
                        val mapId = activeMapId ?: return@MapCanvas
                        val target = activeMapPlaces.firstOrNull {
                            (it["position"] as? kotlinx.serialization.json.JsonObject) == null
                        }
                        val updated = if (target != null) {
                            places.map {
                                if ((it["id"] as? kotlinx.serialization.json.JsonPrimitive)?.content ==
                                    (target["id"] as? kotlinx.serialization.json.JsonPrimitive)?.content
                                ) {
                                    kotlinx.serialization.json.buildJsonObject {
                                        for ((key, value) in it) put(key, value)
                                        put("position", kotlinx.serialization.json.buildJsonObject {
                                            put("x", kotlinx.serialization.json.JsonPrimitive(mapX))
                                            put("y", kotlinx.serialization.json.JsonPrimitive(mapY))
                                        })
                                    }
                                } else it
                            }
                        } else {
                            places + kotlinx.serialization.json.buildJsonObject {
                                put("id", kotlinx.serialization.json.JsonPrimitive(
                    "pl-" + java.util.UUID.randomUUID().toString().take(12)))
                                put("projectId", kotlinx.serialization.json.JsonPrimitive(workId))
                                put("mapId", kotlinx.serialization.json.JsonPrimitive(mapId))
                                put("name", kotlinx.serialization.json.JsonPrimitive("新地点"))
                                put("type", kotlinx.serialization.json.JsonPrimitive("其他"))
                                put("aliases", kotlinx.serialization.json.JsonArray(emptyList()))
                                put("description", kotlinx.serialization.json.JsonPrimitive(""))
                                put("position", kotlinx.serialization.json.buildJsonObject {
                                    put("x", kotlinx.serialization.json.JsonPrimitive(mapX))
                                    put("y", kotlinx.serialization.json.JsonPrimitive(mapY))
                                })
                            }
                        }
                        onSavePlaces(updated)
                    }
                )
                Text(
                    "地点 ${activeMapPlaces.size} 个。点击下方列表查看。",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(horizontal = 16.dp)
                )
                LazyColumn(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
                    items(activeMapPlaces, key = { (it["id"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: "" }) { place ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    (place["name"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: "",
                                    style = MaterialTheme.typography.titleSmall,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    (place["type"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: "",
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MapCanvas(
    map: JsonObject?,
    places: List<JsonObject>,
    modifier: Modifier = Modifier,
    onTapPosition: (Double, Double) -> Unit = { _, _ -> }
) {
    val context = LocalContext.current
    val textMeasurer = rememberTextMeasurer()
    if (map == null) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("选择一张地图", style = MaterialTheme.typography.bodySmall)
        }
        return
    }
    val imageBase64 = (map["image"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: ""
    val width = (map["width"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() ?: 1
    val height = (map["height"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() ?: 1

    Box(
        modifier = modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectTapGestures { position ->
                    val mapW = width
                    val mapH = height
                    if (mapW <= 0 || mapH <= 0 || size.height <= 0f) return@detectTapGestures
                    // 显示区域按 Fit 缩放：底图内容宽 = canvasH*mapW/mapH，居中。
                    val contentW = size.height * mapW.toFloat() / mapH
                    val originX = ((size.width - contentW) / 2f).coerceAtLeast(0f)
                    val px = ((position.x - originX) / contentW).toDouble()
                    val py = (position.y / size.height).toDouble()
                    if (px >= 0 && px <= 1 && py >= 0 && py <= 1) {
                        onTapPosition(px * mapW, py * mapH)
                    }
                }
            }
    ) {
        // Base image, drawn once per decode.
        if (imageBase64.startsWith("data:image/")) {
            val decoded = remember(imageBase64) {
                runCatching {
                    val pure = imageBase64.substringAfter("base64,")
                    val bytes = Base64.decode(pure, Base64.DEFAULT)
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                }.getOrNull()
            }
            if (decoded != null) {
                Image(
                    bitmap = decoded.asImageBitmap(),
                    contentDescription = "地图底图",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Fit
                )
            }
        }
        // Place dots, positioned by the map's own coordinate space.
        Canvas(modifier = Modifier.fillMaxSize()) {
            val originX = (size.width - size.height * width.toFloat() / height) / 2f
            val originY = 0f
            for (place in places) {
                val pos = place["position"] as? kotlinx.serialization.json.JsonObject ?: continue
                val x = (pos["x"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toDoubleOrNull() ?: continue
                val y = (pos["y"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toDoubleOrNull() ?: continue
                val dot = Offset(
                    originX + ((x / width) * size.height * (width.toFloat() / height)).toFloat(),
                    originY + ((y / height) * size.height).toFloat()
                )
                drawCircle(Color(0xFFBC995E), radius = 10f, center = dot)
                drawCircle(Color.White, radius = 10f, center = dot, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2f))
                val label = (place["name"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: ""
                if (label.isNotEmpty()) {
                    val laid = textMeasurer.measure(AnnotatedString(label), TextStyle(fontSize = 11.sp))
                    drawText(laid, topLeft = dot + Offset(12f, -laid.size.height / 2f))
                }
            }
        }
        if (imageBase64.isBlank()) {
            Text(
                "此地图还没有底图",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.align(Alignment.Center)
            )
        }
    }
}
