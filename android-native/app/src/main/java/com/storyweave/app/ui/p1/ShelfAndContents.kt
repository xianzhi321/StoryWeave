package com.storyweave.app.ui.p1

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
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
import com.storyweave.app.data.db.ChapterSummary
import com.storyweave.app.data.db.WorkSummary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShelfScreen(
    works: List<WorkSummary>,
    onOpenWork: (String) -> Unit,
    onCreateWork: (String) -> Unit,
    onDeleteWork: (String) -> Unit,
    onOpenSettings: () -> Unit,
    onImportManuscript: () -> Unit
) {
    var creating by remember { mutableStateOf(false) }
    var newTitle by remember { mutableStateOf("") }
    var pendingDelete by remember { mutableStateOf<WorkSummary?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("书架") },
                actions = {
                    TextButton(onClick = onImportManuscript) { Text("导入小说") }
                    TextButton(onClick = onOpenSettings) { Text("设置") }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { creating = true }) {
                Icon(Icons.Default.Add, contentDescription = "新建作品")
            }
        }
    ) { inner ->
        if (works.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(inner).padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("书架还没有作品", style = MaterialTheme.typography.titleMedium)
                Text(
                    "点右下角新建，或到设置里导入 Web 版备份。",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize().padding(inner)) {
                items(works, key = { it.id }) { work ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(2.dp)
                        ) {
                            Text(work.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (work.genre.isNotBlank()) {
                                Text(work.genre, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        TextButton(onClick = { onOpenWork(work.id) }) { Text("打开") }
                        IconButton(onClick = { pendingDelete = work }) {
                            Icon(Icons.Default.Delete, contentDescription = "删除《${work.title}》")
                        }
                    }
                    HorizontalDivider()
                }
            }
        }
    }

    if (creating) {
        AlertDialog(
            onDismissRequest = { creating = false },
            title = { Text("新建作品") },
            text = {
                OutlinedTextField(
                    value = newTitle,
                    onValueChange = { newTitle = it },
                    label = { Text("书名") },
                    singleLine = true
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    val title = newTitle.trim()
                    creating = false
                    newTitle = ""
                    if (title.isNotEmpty()) onCreateWork(title)
                }) { Text("创建") }
            },
            dismissButton = { TextButton(onClick = { creating = false }) { Text("取消") } }
        )
    }

    pendingDelete?.let { target ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("删除作品") },
            text = { Text("《${target.title}》及其章节会从本机删除，无法撤销。建议先导出备份。") },
            confirmButton = {
                TextButton(onClick = {
                    pendingDelete = null
                    onDeleteWork(target.id)
                }) { Text("删除") }
            },
            dismissButton = { TextButton(onClick = { pendingDelete = null }) { Text("取消") } }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContentsScreen(
    workTitle: String,
    chapters: List<ChapterSummary>,
    onBack: () -> Unit,
    onOpenChapter: (String) -> Unit,
    onCreateChapter: () -> Unit,
    onDeleteChapter: (String) -> Unit,
    onOpenCharacters: () -> Unit,
    onOpenWorld: () -> Unit,
    onOpenPlots: () -> Unit,
    onOpenTimeline: () -> Unit,
    onOpenAudit: () -> Unit,
    onOpenSkills: () -> Unit,
    onOpenTerms: () -> Unit,
    onOpenSceneCards: () -> Unit,
    onSnapshotChapter: (String) -> Unit,
    onOpenHistory: (String) -> Unit,
    onOpenReader: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenTrash: () -> Unit,
    onExportBook: (Boolean) -> Unit,
    onOpenAnnotations: () -> Unit
) {
    var pendingDelete by remember { mutableStateOf<ChapterSummary?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(workTitle.ifBlank { "目录" }, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, contentDescription = "返回") }
                },
                actions = {
                    TextButton(onClick = onOpenCharacters) { Text("人物") }
                    TextButton(onClick = onOpenWorld) { Text("世界") }
                    TextButton(onClick = onOpenPlots) { Text("伏笔") }
                    TextButton(onClick = onOpenTimeline) { Text("编年") }
                    TextButton(onClick = onOpenAudit) { Text("审查") }
                    TextButton(onClick = onOpenSkills) { Text("技能") }
                    var moreOpen by remember { mutableStateOf(false) }
                    androidx.compose.material3.IconButton(onClick = { moreOpen = true }) {
                        Text("⋯", style = MaterialTheme.typography.titleMedium)
                    }
                    androidx.compose.material3.DropdownMenu(
                        expanded = moreOpen,
                        onDismissRequest = { moreOpen = false }
                    ) {
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text("常用术语") },
                            onClick = { moreOpen = false; onOpenTerms() }
                        )
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text("场景卡") },
                            onClick = { moreOpen = false; onOpenSceneCards() }
                        )
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text("全文检索") },
                            onClick = { moreOpen = false; onOpenSearch() }
                        )
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text("阅读预览") },
                            onClick = { moreOpen = false; onOpenReader() }
                        )
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text("批注") },
                            onClick = { moreOpen = false; onOpenAnnotations() }
                        )
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text("回收站") },
                            onClick = { moreOpen = false; onOpenTrash() }
                        )
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text("导出书稿 TXT") },
                            onClick = { moreOpen = false; onExportBook(false) }
                        )
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onCreateChapter) {
                Icon(Icons.Default.Add, contentDescription = "新建章节")
            }
        }
    ) { inner ->
        LazyColumn(modifier = Modifier.fillMaxSize().padding(inner)) {
            items(chapters, key = { it.id }) { chapter ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(chapter.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${chapter.charCount} 字", style = MaterialTheme.typography.bodySmall)
                    }
                    TextButton(onClick = { onOpenChapter(chapter.id) }) { Text("写作") }
                    TextButton(onClick = { onSnapshotChapter(chapter.id) }) { Text("快照") }
                    TextButton(onClick = { onOpenHistory(chapter.id) }) { Text("历史") }
                    IconButton(onClick = { pendingDelete = chapter }) {
                        Icon(Icons.Default.Delete, contentDescription = "删除章节")
                    }
                }
                HorizontalDivider()
            }
        }
    }

    pendingDelete?.let { target ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("移入回收站") },
            text = { Text("《${target.title}》会移入章节回收站，可随时恢复。") },
            confirmButton = {
                TextButton(onClick = {
                    pendingDelete = null
                    onDeleteChapter(target.id)
                }) { Text("移入") }
            },
            dismissButton = { TextButton(onClick = { pendingDelete = null }) { Text("取消") } }
        )
    }
}
