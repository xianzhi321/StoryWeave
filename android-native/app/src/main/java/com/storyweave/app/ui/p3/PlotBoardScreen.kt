package com.storyweave.app.ui.p3

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * P3: 伏笔看板 & 事件编年.
 *
 * Rows are raw JSON objects from the generic collection store. The editor only
 * touches known fields; anything else in the object survives untouched, which is
 * how the lossless contract is kept without a full schema.
 */

/** Shared helpers for raw-row editing. */
internal fun rowString(row: JsonObject?, key: String): String =
    (row?.get(key) as? kotlinx.serialization.json.JsonPrimitive)
        ?.takeIf { it !is kotlinx.serialization.json.JsonNull }?.content ?: ""

internal fun rowBoolean(row: JsonObject?, key: String): Boolean =
    (row?.get(key) as? kotlinx.serialization.json.JsonPrimitive)?.content == "true"

internal fun newId(prefix: String): String =
    prefix + "-" + java.util.UUID.randomUUID().toString().take(12)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlotBoardScreen(
    plots: List<JsonObject>,
    links: List<JsonObject>,
    chapterTitles: Map<String, String>,
    onBack: () -> Unit,
    onSavePlots: (List<JsonObject>) -> Unit,
    onSaveLinks: (List<JsonObject>) -> Unit
) {
    var editingPlot by remember { mutableStateOf<JsonObject?>(null) }
    var creatingPlot by remember { mutableStateOf(false) }
    var deletingPlot by remember { mutableStateOf<JsonObject?>(null) }
    var editingLink by remember { mutableStateOf<JsonObject?>(null) }
    var deletingLink by remember { mutableStateOf<JsonObject?>(null) }
    var creatingLinkFor by remember { mutableStateOf<JsonObject?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("伏笔看板") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, contentDescription = "返回") }
                }
            )
        }
    ) { inner ->
        Column(modifier = Modifier.fillMaxSize().padding(inner)) {
            if (plots.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("还没有伏笔", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "记录悬念、人物秘密、支线和回收计划。",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(plots, key = { rowString(it, "id") }) { plot ->
                        val plotId = rowString(plot, "id")
                        val plotLinks = links.filter { rowString(it, "plotId") == plotId }
                        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(
                                        rowString(plot, "title"),
                                        style = MaterialTheme.typography.titleSmall,
                                        maxLines = 1, overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        "${rowString(plot, "type")} · ${rowString(plot, "status")}",
                                        style = MaterialTheme.typography.bodySmall
                                    )
                                }
                                TextButton(onClick = { editingPlot = plot }) { Text("编辑") }
                                IconButton(onClick = { deletingPlot = plot }) {
                                    Icon(Icons.Default.Delete, contentDescription = "删除")
                                }
                            }
                            for (link in plotLinks) {
                                val chapterId = rowString(link, "chapterId")
                                val stage = rowString(link, "stage")
                                Text(
                                    "· ${stageLabel(stage)}：${chapterTitles[chapterId] ?: "未知章节"}" +
                                        if (rowBoolean(link, "allowNonlinear")) "（允许倒叙）" else "",
                                    style = MaterialTheme.typography.bodySmall,
                                    modifier = Modifier.padding(start = 8.dp, top = 2.dp)
                                )
                            }
                            TextButton(onClick = { creatingLinkFor = plot }) { Text("＋ 章节关联") }
                        }
                        HorizontalDivider()
                    }
                }
            }
        }
    }

    if (creatingPlot || editingPlot != null) {
        PlotEditor(
            initial = editingPlot,
            onDismiss = { creatingPlot = false; editingPlot = null },
            onSave = { row ->
                val next = if (editingPlot == null) plots + row
                else plots.map { if (rowString(it, "id") == rowString(row, "id")) row else it }
                onSavePlots(next)
                creatingPlot = false
                editingPlot = null
            }
        )
    }

    deletingPlot?.let { target ->
        AlertDialog(
            onDismissRequest = { deletingPlot = null },
            title = { Text("删除伏笔") },
            text = { Text("「${rowString(target, "title")}」会被删除，其章节关联一并移除。") },
            confirmButton = {
                TextButton(onClick = {
                    val id = rowString(target, "id")
                    onSavePlots(plots.filterNot { rowString(it, "id") == id })
                    onSaveLinks(links.filterNot { rowString(it, "plotId") == id })
                    deletingPlot = null
                }) { Text("删除") }
            },
            dismissButton = { TextButton(onClick = { deletingPlot = null }) { Text("取消") } }
        )
    }

    (creatingLinkFor ?: editingLink)?.let { plot ->
    
        LinkEditor(
            plotId = rowString(plot, "id"),
            plotTitle = rowString(plot, "title"),
            initial = editingLink,
            chapterTitles = chapterTitles,
            onDismiss = { creatingLinkFor = null; editingLink = null },
            onSave = { row ->
                val next = if (editingLink == null) links + row
                else links.map { if (rowString(it, "id") == rowString(row, "id")) row else it }
                onSaveLinks(next)
                creatingLinkFor = null
                editingLink = null
            }
        )
    }

    deletingLink?.let { target ->
        AlertDialog(
            onDismissRequest = { deletingLink = null },
            title = { Text("删除章节关联") },
            text = { Text("伏笔和正文不会删除。") },
            confirmButton = {
                TextButton(onClick = {
                    onSaveLinks(links.filterNot { rowString(it, "id") == rowString(target, "id") })
                    deletingLink = null
                }) { Text("删除") }
            },
            dismissButton = { TextButton(onClick = { deletingLink = null }) { Text("取消") } }
        )
    }
}

internal fun stageLabel(stage: String): String = when (stage) {
    "planted" -> "埋设"
    "payoff" -> "回收"
    "mention" -> "提及"
    else -> stage.ifBlank { "未标记" }
}

@Composable
private fun PlotEditor(
    initial: JsonObject?,
    onDismiss: () -> Unit,
    onSave: (JsonObject) -> Unit
) {
    var title by remember { mutableStateOf(rowString(initial, "title")) }
    var type by remember { mutableStateOf(rowString(initial, "type").ifBlank { "悬念" }) }
    var status by remember { mutableStateOf(rowString(initial, "status").ifBlank { "未展开" }) }
    var note by remember { mutableStateOf(rowString(initial, "note")) }
    var error by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "新增伏笔" else "编辑伏笔") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(title, { title = it }, label = { Text("名称") }, singleLine = true)
                OutlinedTextField(type, { type = it }, label = { Text("类别（悬念/秘密/支线）") }, singleLine = true)
                OutlinedTextField(status, { status = it }, label = { Text("阶段（未展开/已埋设/发展中/已回收）") }, singleLine = true)
                OutlinedTextField(note, { note = it }, label = { Text("说明 / 回收计划") })
                if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            TextButton(onClick = {
                if (title.isBlank()) { error = "请填写名称"; return@TextButton }
                onSave(
                    buildJsonObject {
                        put("id", initial?.let { rowString(it, "id") } ?: newId("plot"))
                        put("title", title.trim())
                        put("type", type.trim())
                        put("status", status.trim())
                        put("note", note.trim())
                    }
                )
            }) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}

@Composable
private fun LinkEditor(
    plotId: String,
    plotTitle: String,
    initial: JsonObject?,
    chapterTitles: Map<String, String>,
    onDismiss: () -> Unit,
    onSave: (JsonObject) -> Unit
) {
    var chapterIndex by remember {
        mutableStateOf(
            chapterTitles.keys.indexOfFirst { it == rowString(initial, "chapterId") }.coerceAtLeast(0)
        )
    }
    var stage by remember { mutableStateOf(rowString(initial, "stage").ifBlank { "planted" }) }
    var allowNonlinear by remember { mutableStateOf(rowBoolean(initial, "allowNonlinear")) }

    val chapterIds = chapterTitles.keys.toList()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("章节关联 · $plotTitle") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("选择章节", style = MaterialTheme.typography.bodySmall)
                Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                    chapterIds.forEachIndexed { index, id ->
                        FilterChip(
                            selected = index == chapterIndex,
                            onClick = { chapterIndex = index },
                            label = { Text(chapterTitles[id] ?: id) }
                        )
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (label in listOf("planted" to "埋设", "payoff" to "回收", "mention" to "提及")) {
                        FilterChip(
                            selected = stage == label.first,
                            onClick = { stage = label.first },
                            label = { Text(label.second) }
                        )
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.Checkbox(checked = allowNonlinear, onCheckedChange = { allowNonlinear = it })
                    Text("允许非线性（倒叙）", style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                if (chapterIds.isEmpty()) return@TextButton
                onSave(
                    buildJsonObject {
                        put("id", initial?.let { rowString(it, "id") } ?: newId("link"))
                        put("plotId", plotId)
                        put("chapterId", chapterIds[chapterIndex])
                        put("stage", stage)
                        put("allowNonlinear", allowNonlinear)
                    }
                )
            }) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}
