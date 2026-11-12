package com.storyweave.app.ui.p2

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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.storyweave.app.data.db.ChapterSummary
import com.storyweave.app.data.db.CharacterEntity
import com.storyweave.app.data.db.RelationEvent
import com.storyweave.app.data.db.RelationEntity

@Composable
fun RelationsTab(
    characters: List<CharacterEntity>,
    relations: List<RelationEntity>,
    history: List<RelationEvent>,
    chapters: List<ChapterSummary>,
    onEdit: (RelationEntity) -> Unit,
    onDelete: (RelationEntity) -> Unit,
    onRecordChange: (RelationEntity, String, String, Int, String) -> Unit,
    modifier: Modifier = Modifier
) {
    val nameOf = remember(characters) { characters.associate { it.id to it.name } }
    val chapterTitleOf = remember(chapters) { chapters.associate { it.id to it.title } }
    var deletingRelationFor by remember { mutableStateOf<RelationEntity?>(null) }

    Column(modifier = modifier.fillMaxSize()) {
        RelationshipGraph(
            characters = characters,
            relations = relations,
            modifier = Modifier.padding(bottom = 8.dp)
        )
        if (chapters.isNotEmpty() && relations.isNotEmpty()) {
            var chapterIndex by remember { mutableStateOf(chapters.lastIndex) }
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("查看时点：", style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = { if (chapterIndex > 0) chapterIndex-- }) { Text("◀") }
                Text(
                    chapters.getOrNull(chapterIndex)?.title ?: "—",
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                TextButton(onClick = { if (chapterIndex < chapters.lastIndex) chapterIndex++ }) { Text("▶") }
            }
            val order = chapters.map { it.id }
            val snapshotOf = relations.take(3).map { relation ->
                relation to com.storyweave.app.domain.RelationReplay.stateAt(
                    relation, history, order, chapterIndex
                )
            }
            Text(
                snapshotOf.joinToString("；") { (r, snap) ->
                    "${nameOf[r.a] ?: "?"}·${nameOf[r.b] ?: "?"}：" + snap.type +
                        if (snap.isOriginal) "（原始）" else ""
                },
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
            )
        }
        if (relations.isEmpty()) {
            Text(
                "还没有人物关系。至少需要两位人物才能建立关系。",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(16.dp)
            )
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(relations, key = { it.id }) { relation ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                "${nameOf[relation.a] ?: "?"} · ${nameOf[relation.b] ?: "?"}",
                                style = MaterialTheme.typography.titleSmall,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                relation.type + if (relation.privateRelation) " · 私密" else "",
                                style = MaterialTheme.typography.bodySmall
                            )
                            val latest = history.filter { it.relationId == relation.id }.maxByOrNull { it.created }
                            if (latest != null) {
                                Text(
                                    "最近变化：" + (chapterTitleOf[latest.chapterId] ?: "某章") +
                                        " → " + latest.afterType,
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                        Column {
                            TextButton(onClick = { onEdit(relation) }) { Text("编辑") }
                            TextButton(onClick = { deletingRelationFor = relation }) { Text("变化") }
                        }
                        TextButton(onClick = { onDelete(relation) }) { Text("删除") }
                    }
                    HorizontalDivider()
                }
            }
        }
    }

    deletingRelationFor?.let { relation ->
        RelationChangeDialog(
            relation = relation,
            chapters = chapters,
            onDismiss = { deletingRelationFor = null },
            onSubmit = { chapterId, afterType, afterTrust, cause ->
                onRecordChange(relation, chapterId, afterType, afterTrust, cause)
                deletingRelationFor = null
            }
        )
    }
}

@Composable
private fun RelationChangeDialog(
    relation: RelationEntity,
    chapters: List<ChapterSummary>,
    onDismiss: () -> Unit,
    onSubmit: (chapterId: String, afterType: String, afterTrust: Int, cause: String) -> Unit
) {
    var chapterId by remember { mutableStateOf(chapters.firstOrNull()?.id ?: "") }
    var afterType by remember { mutableStateOf(relation.type) }
    var trust by remember { mutableStateOf("0") }
    var cause by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("记录关系变化") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text("当前：${relation.type}", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(
                    value = chapterTitleOf(chapterId, chapters),
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("发生章节（默认第一章）") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(afterType, { afterType = it }, label = { Text("变化后的关系") }, singleLine = true)
                OutlinedTextField(trust, { trust = it }, label = { Text("信任值 -100..100") }, singleLine = true)
                OutlinedTextField(cause, { cause = it }, label = { Text("变化原因") })
                if (error.isNotEmpty()) {
                    Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                // Same validation the Web build applies in createRelationshipEvent().
                if (chapterId.isEmpty()) { error = "请先创建章节"; return@TextButton }
                if (afterType.length < 2) { error = "请填写变化后的关系"; return@TextButton }
                val value = trust.toIntOrNull()
                if (value == null || value !in -100..100) { error = "信任值必须在 -100 到 100 之间"; return@TextButton }
                onSubmit(chapterId, afterType, value, cause)
            }) { Text("记录") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}

private fun chapterTitleOf(id: String, chapters: List<ChapterSummary>): String =
    chapters.firstOrNull { it.id == id }?.title ?: "（未选择）"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RelationEditor(
    initial: RelationEntity?,
    characters: List<CharacterEntity>,
    onDismiss: () -> Unit,
    onSave: (RelationEntity) -> Unit
) {
    var nameA by remember { mutableStateOf(initial?.let { characters.firstOrNull { c -> c.id == it.a }?.name } ?: "") }
    var nameB by remember { mutableStateOf(initial?.let { characters.firstOrNull { c -> c.id == it.b }?.name } ?: "") }
    var type by remember { mutableStateOf(initial?.type ?: "") }
    var detail by remember { mutableStateOf(initial?.detail ?: "") }
    var isPrivate by remember { mutableStateOf(initial?.privateRelation ?: false) }
    var error by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "建立人物关系" else "编辑人物关系") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                PersonPicker("人物 A", characters, nameA) { nameA = it }
                PersonPicker("人物 B", characters, nameB) { nameB = it }
                OutlinedTextField(
                    value = type, onValueChange = { type = it },
                    label = { Text("关系类型（如 盟友 / 敌对 / 师徒）") }, singleLine = true
                )
                OutlinedTextField(
                    value = detail, onValueChange = { detail = it },
                    label = { Text("关系描述") }
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = isPrivate, onCheckedChange = { isPrivate = it })
                    Text("设为秘密关系", style = MaterialTheme.typography.bodySmall)
                }
                if (error.isNotEmpty()) {
                    Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                // Same validation rules as the Web build's 建立关系 dialog.
                if (nameA == nameB) { error = "请选择两位不同人物"; return@TextButton }
                if (type.isBlank()) { error = "请填写关系类型"; return@TextButton }
                val a = characters.firstOrNull { it.name == nameA }?.id ?: ""
                val b = characters.firstOrNull { it.name == nameB }?.id ?: ""
                if (a.isEmpty() || b.isEmpty()) { error = "请选择人物"; return@TextButton }
                onSave(
                    (initial ?: RelationEntity(
                        id = "", projectId = "", a = "", b = "", type = "", detail = "",
                        privateRelation = false, extrasJson = "{}", position = 0
                    )).copy(a = a, b = b, type = type, detail = detail, privateRelation = isPrivate)
                )
            }) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PersonPicker(
    label: String,
    characters: List<CharacterEntity>,
    selectedName: String,
    onPick: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = selectedName,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor()
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            for (person in characters) {
                DropdownMenuItem(
                    text = { Text(person.name) },
                    onClick = { onPick(person.name); expanded = false }
                )
            }
        }
    }
}
