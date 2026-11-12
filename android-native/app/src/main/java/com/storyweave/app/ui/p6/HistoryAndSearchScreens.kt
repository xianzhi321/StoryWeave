package com.storyweave.app.ui.p6

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.storyweave.app.domain.ChapterHistory
import com.storyweave.app.domain.GlobalSearch

/** 历史版本：列表 + 恢复（对齐 Web 版 openHistory）。 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    entries: List<ChapterHistory.Entry>,
    onBack: () -> Unit,
    onRestore: (String) -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("历史版本") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, contentDescription = "返回") }
                }
            )
        }
    ) { inner ->
        if (entries.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(inner).padding(24.dp),
                verticalArrangement = Arrangement.Center
            ) {
                Text("暂无手动保存的版本。", style = MaterialTheme.typography.titleMedium)
                Text(
                    "在目录页对某一章点「快照」，可随时回到这一版。",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize().padding(inner)) {
                items(entries, key = { it.id }) { entry ->
                    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)) {
                        Text(entry.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            entry.at.replace('T', ' ').take(16) + " · " + entry.text.length + " 字",
                            style = MaterialTheme.typography.bodySmall
                        )
                        TextButton(onClick = { onRestore(entry.id) }) { Text("恢复这一版") }
                    }
                    HorizontalDivider()
                }
            }
        }
    }
}

/** 章节阅读预览（对齐 Web 版 openReader）：纯展示，不进编辑。 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReaderScreen(
    title: String,
    text: String,
    onBack: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("阅读预览") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, contentDescription = "返回") }
                }
            )
        }
    ) { inner ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(inner)
                .padding(horizontal = 20.dp)
        ) {
            Text(
                title,
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(vertical = 12.dp)
            )
            Text(
                text.ifBlank { "还没有正文。" },
                style = MaterialTheme.typography.bodyLarge,
                lineHeight = androidx.compose.ui.unit.TextUnit.Unspecified
            )
            Text(
                text.length.toString() + " 字 · 阅读预览",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(vertical = 12.dp)
            )
        }
    }
}

/** 全文检索（对齐 Web 版 openSearch）：标题/正文/人物/事件一次查。 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    query: String,
    hits: List<GlobalSearch.Hit>,
    onBack: () -> Unit,
    onQuery: (String) -> Unit,
    onOpenChapter: (String) -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("全文检索") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, contentDescription = "返回") }
                }
            )
        }
    ) { inner ->
        Column(modifier = Modifier.fillMaxSize().padding(inner)) {
            OutlinedTextField(
                value = query,
                onValueChange = onQuery,
                label = { Text("查找章节、人名或世界事件") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)
            )
            if (hits.isEmpty()) {
                Text(
                    "输入内容后，将在当前作品中查找。",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(16.dp)
                )
            } else {
                LazyColumn {
                    items(hits, key = { it.kind + it.id }) { hit ->
                        androidx.compose.foundation.layout.Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onOpenChapter(hit.id) }
                                .padding(horizontal = 16.dp, vertical = 10.dp)
                        ) {
                            Text(hit.title, style = MaterialTheme.typography.titleSmall, maxLines = 1)
                            Text(
                                hit.detail,
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 2, overflow = TextOverflow.Ellipsis
                            )
                        }
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}
