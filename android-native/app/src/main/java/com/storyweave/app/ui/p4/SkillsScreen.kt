package com.storyweave.app.ui.p4

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement

/**
 * P4: 技能工坊.
 *
 * Skills live in the top-level `skills` collection (raw JSON rows, same as the
 * Web build). The editor touches title/category/description/rules/status and
 * leaves everything else in place. Audit = candidate → ready, exactly like the
 * Web build's 审核 flow.
 */
internal fun skillString(row: JsonObject?, key: String): String =
    (row?.get(key) as? kotlinx.serialization.json.JsonPrimitive)
        ?.takeIf { it !is kotlinx.serialization.json.JsonNull }?.content ?: ""

internal fun skillRules(row: JsonObject?): List<String> =
    (row?.get("rules") as? JsonArray)?.mapNotNull { element ->
        (element as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it.isString }?.content
    } ?: emptyList()

private val NEW_SKILL_ID = { newIdFrom("skill") }
internal fun newIdFrom(prefix: String): String =
    prefix + "-" + java.util.UUID.randomUUID().toString().take(12)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SkillsScreen(
    skills: List<JsonObject>,
    onBack: () -> Unit,
    onSaveAll: (List<JsonObject>) -> Unit,
    onImport: (List<JsonObject>) -> Unit,
    onExport: (String) -> Unit,
    statusMessage: String,
    aiBusy: Boolean,
    onBulk: (Set<String>, String) -> Unit
) {
    var creating by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<JsonObject?>(null) }
    var deleting by remember { mutableStateOf<JsonObject?>(null) }
    var filter by remember { mutableStateOf("全部") }
    val context = LocalContext.current
    // P6 四: 批量管理模式
    var bulkMode by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf(setOf<String>()) }
    val importLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        try {
            val raw = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
                ?: return@rememberLauncherForActivityResult
            val parsed = Json.parseToJsonElement(raw)
            // Accept a bare array or {skills:[...]} like the Web build's importer.
            val rows = when (parsed) {
                is JsonArray -> parsed.mapNotNull { it as? JsonObject }
                is JsonObject -> (parsed["skills"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
                else -> emptyList()
            }
            onImport(rows)
        } catch (_: Exception) {
        }
    }

    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        val payload = buildJsonObject {
            put("skills", JsonArray(skills))
        }
        try {
            context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use {
                it.write(payload.toString())
            }
        } catch (_: Exception) {
        }
    }

    val ready = skills.filter { skillString(it, "status") == "ready" }
    val candidates = skills.filter { skillString(it, "status") == "candidate" }
    val visible = when (filter) {
        "全部" -> skills
        "待审核" -> candidates
        "已审核" -> ready
        else -> skills.filter { skillString(it, "category") == filter }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("技能工坊") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, contentDescription = "返回") }
                },
                actions = {
                    TextButton(onClick = { bulkMode = !bulkMode; selected = setOf() }) {
                        Text(if (bulkMode) "退出多选" else "批量")
                    }
                    TextButton(onClick = { exportLauncher.launch("StoryWeave-技能.json") }) { Text("导出") }
                    TextButton(onClick = {
                        importLauncher.launch(arrayOf("application/json", "text/plain", "*/*"))
                    }) { Text("导入") }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { creating = true }) {
                Icon(Icons.Default.Add, contentDescription = "新建技能")
            }
        }
    ) { inner ->
        Column(modifier = Modifier.fillMaxSize().padding(inner)) {
            if (statusMessage.isNotBlank()) {
                Text(
                    statusMessage,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                for (label in listOf("全部", "待审核", "已审核")) {
                    FilterChip(
                        selected = filter == label,
                        onClick = { filter = label },
                        label = { Text(label) }
                    )
                }
            }
            if (candidates.isNotEmpty()) {
                Text(
                    "有 ${candidates.size} 条待审核技能：确认后状态转为已审核。",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(horizontal = 16.dp)
                )
            }
            if (visible.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("暂无技能", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "新建、导入 JSON，或在 AI 协作中沉淀。",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(visible, key = { skillString(it, "id").ifBlank { skillString(it, "title") } }) { skill ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    skillString(skill, "title"),
                                    style = MaterialTheme.typography.titleSmall,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    "${skillString(skill, "category")} · " +
                                        (skillString(skill, "source").ifBlank { "手动创建" }),
                                    style = MaterialTheme.typography.bodySmall,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis
                                )
                            }
                            if (bulkMode) {
                                androidx.compose.material3.Checkbox(
                                    checked = skillString(skill, "id") in selected,
                                    onCheckedChange = { checked ->
                                        val id = skillString(skill, "id")
                                        selected = if (checked) selected + id else selected - id
                                    }
                                )
                            }
                            if (!bulkMode && skillString(skill, "status") == "candidate") {
                                AssistChip(
                                    onClick = {
                                        onSaveAll(
                                            skills.map {
                                                if (skillString(it, "id") == skillString(skill, "id")) {
                                                    buildJsonObject {
                                                        for ((key, value) in it) put(key, value)
                                                        put("status", "ready")
                                                    }
                                                } else it
                                            }
                                        )
                                    },
                                    label = { Text("审核通过") }
                                )
                            }
                            if (!bulkMode) {
                                TextButton(onClick = { editing = skill }) { Text("编辑") }
                                IconButton(onClick = { deleting = skill }) {
                                    Icon(Icons.Default.Delete, contentDescription = "删除")
                                }
                            }
                        }
                        HorizontalDivider()
                    }
                }
            }
            if (bulkMode) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = { onBulk(selected, "approve"); bulkMode = false; selected = setOf() },
                        enabled = selected.isNotEmpty()
                    ) { Text("审核通过（${selected.size}）") }
                    OutlinedButton(
                        onClick = { onBulk(selected, "delete"); bulkMode = false; selected = setOf() },
                        enabled = selected.isNotEmpty()
                    ) { Text("删除（${selected.size}）") }
                }
            }
        }
    }

    if (creating || editing != null) {
        SkillEditor(
            initial = editing,
            onDismiss = { creating = false; editing = null },
            onSave = { row ->
                val next = if (editing == null) skills + row
                else skills.map {
                    if (skillString(it, "id") == skillString(row, "id")) row else it
                }
                onSaveAll(next)
                creating = false
                editing = null
            }
        )
    }

    deleting?.let { target ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text("删除技能") },
            text = { Text("「${skillString(target, "title")}」会被删除。") },
            confirmButton = {
                TextButton(onClick = {
                    onSaveAll(skills.filterNot { skillString(it, "id") == skillString(target, "id") })
                    deleting = null
                }) { Text("删除") }
            },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("取消") } }
        )
    }
}

@Composable
private fun SkillEditor(
    initial: JsonObject?,
    onDismiss: () -> Unit,
    onSave: (JsonObject) -> Unit
) {
    var title by remember { mutableStateOf(skillString(initial, "title")) }
    var category by remember { mutableStateOf(skillString(initial, "category").ifBlank { "通用" }) }
    var description by remember { mutableStateOf(skillString(initial, "description")) }
    var rulesText by remember { mutableStateOf(skillRules(initial).joinToString("\n")) }
    var error by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "新建技能" else "编辑技能") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(title, { title = it }, label = { Text("技能名称") }, singleLine = true)
                OutlinedTextField(category, { category = it }, label = { Text("分类") }, singleLine = true)
                OutlinedTextField(description, { description = it }, label = { Text("核心方法") })
                OutlinedTextField(rulesText, { rulesText = it }, label = { Text("执行规则（每行一条）") })
                if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            TextButton(onClick = {
                if (title.isBlank()) { error = "请填写技能名称"; return@TextButton }
                onSave(
                    buildJsonObject {
                        put("id", initial?.let { skillString(it, "id") } ?: newIdFrom("skill"))
                        put("title", title.trim())
                        put("category", category.trim())
                        put("description", description.trim())
                        put("rules", JsonArray(rulesText.split("\n").map { it.trim() }.filter { it.isNotEmpty() }.map { kotlinx.serialization.json.JsonPrimitive(it) }))
                        put("status", initial?.let { skillString(it, "status") }.takeIf { s -> s == "ready" || s == "candidate" } ?: "ready")
                        put("source", initial?.let { skillString(it, "source") } ?: "手动创建")
                    }
                )
            }) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}
