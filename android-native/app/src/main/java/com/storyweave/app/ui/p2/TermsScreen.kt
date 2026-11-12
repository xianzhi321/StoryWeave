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
import com.storyweave.app.data.db.KnowledgeCard

/**
 * P2: 术语表 / 知识卡.
 *
 * Categories mirror the Web build (`categories` includes 设定/术语/…); "全部"
 * is a native convenience for browsing. Cards are edited as one array.
 */
private val CATEGORIES = listOf("术语", "设定", "考据", "灵感", "写作要求")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TermsScreen(
    cards: List<KnowledgeCard>,
    newId: () -> String,
    onBack: () -> Unit,
    onSaveAll: (List<KnowledgeCard>) -> Unit
) {
    var filter by remember { mutableStateOf("全部") }
    var editing by remember { mutableStateOf<KnowledgeCard?>(null) }
    var creating by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<KnowledgeCard?>(null) }

    val visible = if (filter == "全部") cards else cards.filter { it.category == filter }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("术语与知识卡") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { creating = true }) {
                Icon(Icons.Default.Add, contentDescription = "新建卡片")
            }
        }
    ) { inner ->
        Column(modifier = Modifier.fillMaxSize().padding(inner)) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                for (label in listOf("全部") + CATEGORIES) {
                    FilterChip(
                        selected = filter == label,
                        onClick = { filter = label },
                        label = {
                            Text(if (label == "全部") label else "$label ${cards.count { it.category == label }}")
                        }
                    )
                }
            }
            if (visible.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("还没有$filter", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "点右下角新建，卡片会随备份一起保存。",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(visible, key = { it.id }) { card ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    card.title,
                                    style = MaterialTheme.typography.titleSmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    card.body.take(40),
                                    style = MaterialTheme.typography.bodySmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                            TextButton(onClick = { editing = card }) { Text("编辑") }
                            IconButton(onClick = { deleting = card }) {
                                Icon(Icons.Default.Delete, contentDescription = "删除${card.title}")
                            }
                        }
                        HorizontalDivider()
                    }
                }
            }
        }
    }

    if (creating || editing != null) {
        CardEditor(
            initial = editing,
            defaultCategory = if (filter == "全部") "术语" else filter,
            newId = newId,
            onDismiss = { creating = false; editing = null },
            onSave = { card ->
                val next = if (editing == null) cards + card else cards.map { if (it.id == card.id) card else it }
                onSaveAll(next)
                creating = false
                editing = null
            }
        )
    }

    deleting?.let { target ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text("删除卡片") },
            text = { Text("「${target.title}」会被删除。") },
            confirmButton = {
                TextButton(onClick = {
                    onSaveAll(cards.filterNot { it.id == target.id })
                    deleting = null
                }) { Text("删除") }
            },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("取消") } }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CardEditor(
    initial: KnowledgeCard?,
    defaultCategory: String,
    newId: () -> String,
    onDismiss: () -> Unit,
    onSave: (KnowledgeCard) -> Unit
) {
    var title by remember { mutableStateOf(initial?.title ?: "") }
    var body by remember { mutableStateOf(initial?.body ?: "") }
    var category by remember { mutableStateOf(initial?.category ?: defaultCategory) }
    var aliases by remember { mutableStateOf(initial?.aliases ?: "") }
    var tags by remember { mutableStateOf(initial?.tags ?: "") }
    var error by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "新建卡片" else "编辑卡片") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(title, { title = it }, label = { Text("名称") }, singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (label in CATEGORIES) {
                        FilterChip(
                            selected = category == label,
                            onClick = { category = label },
                            label = { Text(label) }
                        )
                    }
                }
                OutlinedTextField(body, { body = it }, label = { Text("定义 / 内容") }, minLines = 3)
                OutlinedTextField(aliases, { aliases = it }, label = { Text("别名") }, singleLine = true)
                OutlinedTextField(tags, { tags = it }, label = { Text("标签") }, singleLine = true)
                if (error.isNotEmpty()) {
                    Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                // cleanCard() rejects cards without a title or body; mirror that.
                if (title.isBlank()) { error = "请填写名称"; return@TextButton }
                if (body.isBlank()) { error = "请填写内容"; return@TextButton }
                onSave(
                    KnowledgeCard(
                        id = initial?.id ?: newId(),
                        title = title.trim(),
                        body = body.trim(),
                        category = category,
                        tags = tags.trim(),
                        source = initial?.source ?: "手动创建",
                        aliases = aliases.trim(),
                        chapterIds = initial?.chapterIds ?: emptyList()
                    )
                )
            }) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}
