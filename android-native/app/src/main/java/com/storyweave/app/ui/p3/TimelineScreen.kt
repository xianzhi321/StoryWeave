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
import androidx.compose.material3.Checkbox
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
 * P3: 事件编年.
 *
 * Rows are raw JSON from the `timelineEvents` collection. Fields edited here
 * mirror the Web build's openTimelineEvent(): title/type/storyDate/chapter/
 * description/cause/consequence/isFlashback. Anything else survives.
 */
private val EVENT_TYPES = listOf("事件", "转折", "冲突", "背景", "其他")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimelineScreen(
    events: List<JsonObject>,
    chapterTitles: Map<String, String>,
    onBack: () -> Unit,
    onSave: (List<JsonObject>) -> Unit
) {
    var editing by remember { mutableStateOf<JsonObject?>(null) }
    var creating by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<JsonObject?>(null) }

    val sorted = events.sortedWith(
        compareBy { chapterTitles.keys.indexOf(rowString(it, "chapterId")) }
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("事件编年") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, contentDescription = "返回") }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { creating = true }) {
                Icon(Icons.Default.Add, contentDescription = "记录事件")
            }
        }
    ) { inner ->
        if (events.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(inner).padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("还没有事件", style = MaterialTheme.typography.titleMedium)
                Text(
                    "记录故事内日期、章节、地点与结果。",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize().padding(inner)) {
                items(sorted, key = { rowString(it, "id") }) { event ->
                    val chapterId = rowString(event, "chapterId")
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                rowString(event, "title") +
                                    if (rowBoolean(event, "isFlashback")) "（倒叙）" else "",
                                style = MaterialTheme.typography.titleSmall,
                                maxLines = 1, overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                listOf(
                                    rowString(event, "storyDate").ifBlank { "无日期" },
                                    chapterTitles[chapterId] ?: "未关联",
                                    rowString(event, "type")
                                ).joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 1, overflow = TextOverflow.Ellipsis
                            )
                        }
                        TextButton(onClick = { editing = event }) { Text("编辑") }
                        IconButton(onClick = { deleting = event }) {
                            Icon(Icons.Default.Delete, contentDescription = "删除")
                        }
                    }
                    HorizontalDivider()
                }
            }
        }
    }

    if (creating || editing != null) {
        EventEditor(
            initial = editing,
            chapterTitles = chapterTitles,
            onDismiss = { creating = false; editing = null },
            onSave = { row ->
                val next = if (editing == null) events + row
                else events.map { if (rowString(it, "id") == rowString(row, "id")) row else it }
                onSave(next)
                creating = false
                editing = null
            }
        )
    }

    deleting?.let { target ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text("删除事件") },
            text = { Text("「${rowString(target, "title")}」会被删除。") },
            confirmButton = {
                TextButton(onClick = {
                    onSave(events.filterNot { rowString(it, "id") == rowString(target, "id") })
                    deleting = null
                }) { Text("删除") }
            },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("取消") } }
        )
    }
}

@Composable
private fun EventEditor(
    initial: JsonObject?,
    chapterTitles: Map<String, String>,
    onDismiss: () -> Unit,
    onSave: (JsonObject) -> Unit
) {
    var title by remember { mutableStateOf(rowString(initial, "title")) }
    var type by remember { mutableStateOf(rowString(initial, "type").ifBlank { "事件" }) }
    var storyDate by remember { mutableStateOf(rowString(initial, "storyDate")) }
    var description by remember { mutableStateOf(rowString(initial, "description")) }
    var cause by remember { mutableStateOf(rowString(initial, "cause")) }
    var consequence by remember { mutableStateOf(rowString(initial, "consequence")) }
    var isFlashback by remember { mutableStateOf(rowBoolean(initial, "isFlashback")) }
    var chapterIndex by remember {
        mutableStateOf(chapterTitles.keys.indexOf(rowString(initial, "chapterId")).coerceAtLeast(0))
    }
    var error by remember { mutableStateOf("") }
    val chapterIds = chapterTitles.keys.toList()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "记录事件" else "编辑事件") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()).fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(title, { title = it }, label = { Text("事件名称") }, singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (label in EVENT_TYPES) {
                        FilterChip(selected = type == label, onClick = { type = label }, label = { Text(label) })
                    }
                }
                OutlinedTextField(
                    storyDate, { storyDate = it },
                    label = { Text("故事日期（如 2026-03-15 / 2026）") }, singleLine = true
                )
                Text("关联章节", style = MaterialTheme.typography.bodySmall)
                Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                    chapterIds.forEachIndexed { index, id ->
                        FilterChip(
                            selected = index == chapterIndex,
                            onClick = { chapterIndex = index },
                            label = { Text(chapterTitles[id] ?: id) }
                        )
                    }
                }
                OutlinedTextField(description, { description = it }, label = { Text("经过") })
                OutlinedTextField(cause, { cause = it }, label = { Text("起因") })
                OutlinedTextField(consequence, { consequence = it }, label = { Text("结果") })
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = isFlashback, onCheckedChange = { isFlashback = it })
                    Text("倒叙事件（不参与时间倒退检查）", style = MaterialTheme.typography.bodySmall)
                }
                if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            TextButton(onClick = {
                if (title.isBlank()) { error = "请填写事件名称"; return@TextButton }
                onSave(
                    buildJsonObject {
                        put("id", initial?.let { rowString(it, "id") } ?: newId("time"))
                        put("title", title.trim())
                        put("type", type)
                        put("storyDate", storyDate.trim())
                        if (chapterIds.isNotEmpty()) {
                            put("chapterId", chapterIds[chapterIndex])
                        }
                        put("description", description.trim())
                        put("cause", cause.trim())
                        put("consequence", consequence.trim())
                        put("isFlashback", isFlashback)
                    }
                )
            }) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}
