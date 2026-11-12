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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
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
import com.storyweave.app.data.db.ChapterSummary
import com.storyweave.app.data.db.CharacterEntity
import com.storyweave.app.data.db.RelationEvent
import com.storyweave.app.data.db.RelationEntity

/**
 * P2 people screen: 人物 / 关系 two tabs.
 *
 * The Web build shows characters and relations on separate pages linked by a
 * graph; here both live in one screen with the graph on the relations tab.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CharactersScreen(
    characters: List<CharacterEntity>,
    relations: List<RelationEntity>,
    relationHistory: List<RelationEvent>,
    chapters: List<ChapterSummary>,
    onBack: () -> Unit,
    onSave: (CharacterEntity) -> Unit,
    onDelete: (CharacterEntity) -> Unit,
    onSaveRelation: (RelationEntity) -> Unit,
    onDeleteRelation: (RelationEntity) -> Unit,
    onRecordChange: (RelationEntity, String, String, Int, String) -> Unit
) {
    var tab by remember { mutableStateOf(0) }
    var creatingPerson by remember { mutableStateOf(false) }
    var editingPerson by remember { mutableStateOf<CharacterEntity?>(null) }
    var deletingPerson by remember { mutableStateOf<CharacterEntity?>(null) }
    var creatingRelation by remember { mutableStateOf(false) }
    var editingRelation by remember { mutableStateOf<RelationEntity?>(null) }
    var deletingRelation by remember { mutableStateOf<RelationEntity?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("人物") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = {
                if (tab == 0) creatingPerson = true else creatingRelation = true
            }) {
                Icon(
                    Icons.Default.Add,
                    contentDescription = if (tab == 0) "新建人物" else "建立关系"
                )
            }
        }
    ) { inner ->
        Column(modifier = Modifier.fillMaxSize().padding(inner)) {
            TabRow(selectedTabIndex = tab) {
                Tab(
                    selected = tab == 0,
                    onClick = { tab = 0 },
                    text = { Text("人物 · ${characters.size}") }
                )
                Tab(
                    selected = tab == 1,
                    onClick = { tab = 1 },
                    text = { Text("关系 · ${relations.size}") }
                )
            }
            if (tab == 0) {
                PeopleTab(
                    characters = characters,
                    onEdit = { editingPerson = it },
                    onDelete = { deletingPerson = it }
                )
            } else {
                RelationsTab(
                    characters = characters,
                    relations = relations,
                    history = relationHistory,
                    chapters = chapters,
                    onEdit = { editingRelation = it },
                    onDelete = { deletingRelation = it },
                    onRecordChange = onRecordChange
                )
            }
        }
    }

    if (creatingPerson || editingPerson != null) {
        CharacterEditor(
            initial = editingPerson,
            onDismiss = { creatingPerson = false; editingPerson = null },
            onSave = { entity ->
                onSave(entity)
                creatingPerson = false
                editingPerson = null
            }
        )
    }

    deletingPerson?.let { target ->
        AlertDialog(
            onDismissRequest = { deletingPerson = null },
            title = { Text("删除人物") },
            text = { Text("「${target.name}」的档案会被删除。Web 版会同时清理相关关系，该级联尚未迁移。") },
            confirmButton = {
                TextButton(onClick = { deletingPerson = null; onDelete(target) }) { Text("删除") }
            },
            dismissButton = { TextButton(onClick = { deletingPerson = null }) { Text("取消") } }
        )
    }

    if (creatingRelation || editingRelation != null) {
        RelationEditor(
            initial = editingRelation,
            characters = characters,
            onDismiss = { creatingRelation = false; editingRelation = null },
            onSave = { entity ->
                onSaveRelation(entity)
                creatingRelation = false
                editingRelation = null
            }
        )
    }

    deletingRelation?.let { target ->
        AlertDialog(
            onDismissRequest = { deletingRelation = null },
            title = { Text("删除关系") },
            text = { Text("这条人物关系会被删除。") },
            confirmButton = {
                TextButton(onClick = { deletingRelation = null; onDeleteRelation(target) }) { Text("删除") }
            },
            dismissButton = { TextButton(onClick = { deletingRelation = null }) { Text("取消") } }
        )
    }
}

@Composable
private fun PeopleTab(
    characters: List<CharacterEntity>,
    onEdit: (CharacterEntity) -> Unit,
    onDelete: (CharacterEntity) -> Unit
) {
    if (characters.isEmpty()) {
        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("还没有人物", style = MaterialTheme.typography.titleMedium)
            Text(
                "点右下角新建，人物设定会随备份一起保存。",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 8.dp)
            )
        }
        return
    }
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(characters, key = { it.id }) { person ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        person.name,
                        style = MaterialTheme.typography.titleSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (person.role.isNotBlank()) {
                        Text(
                            person.role,
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                TextButton(onClick = { onEdit(person) }) { Text("编辑") }
                IconButton(onClick = { onDelete(person) }) {
                    Icon(Icons.Default.Delete, contentDescription = "删除${person.name}")
                }
            }
            HorizontalDivider()
        }
    }
}

@Composable
private fun CharacterEditor(
    initial: CharacterEntity?,
    onDismiss: () -> Unit,
    onSave: (CharacterEntity) -> Unit
) {
    var name by remember { mutableStateOf(initial?.name ?: "") }
    var role by remember { mutableStateOf(initial?.role ?: "") }
    var personality by remember { mutableStateOf(initial?.personality ?: "") }
    var goal by remember { mutableStateOf(initial?.goal ?: "") }
    var knowledge by remember { mutableStateOf(initial?.knowledge ?: "") }
    var secret by remember { mutableStateOf(initial?.secret ?: "") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "新建人物" else "人物档案") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(name, { name = it }, label = { Text("姓名") }, singleLine = true)
                OutlinedTextField(role, { role = it }, label = { Text("身份 / 角色") }, singleLine = true)
                OutlinedTextField(personality, { personality = it }, label = { Text("性格与表达特点") })
                OutlinedTextField(goal, { goal = it }, label = { Text("当前目标") })
                OutlinedTextField(knowledge, { knowledge = it }, label = { Text("角色个人知识") })
                OutlinedTextField(secret, { secret = it }, label = { Text("私密设定") })
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val trimmed = name.trim()
                    if (trimmed.isEmpty()) return@TextButton
                    onSave(
                        (initial ?: CharacterEntity(
                            id = "", projectId = "", name = "", role = "", personality = "",
                            goal = "", knowledge = "", secret = "", created = "",
                            extrasJson = "{}", position = 0
                        )).copy(
                            name = trimmed, role = role, personality = personality,
                            goal = goal, knowledge = knowledge, secret = secret
                        )
                    )
                }
            ) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}
