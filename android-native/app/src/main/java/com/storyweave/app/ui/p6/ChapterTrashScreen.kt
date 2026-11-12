package com.storyweave.app.ui.p6

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.storyweave.app.data.db.TrashEntry

/**
 * P6: 章节回收站.
 *
 * 恢复 puts the chapter back near its original position; 彻底删除 is permanent
 * and asks separately. The recycle bin travels inside the work's JSON backup,
 * so Web ↔ native round trips keep it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChapterTrashScreen(
    entries: List<TrashEntry>,
    onBack: () -> Unit,
    onRestore: (String) -> Unit,
    onPurge: (String) -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("章节回收站") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, contentDescription = "返回") }
                }
            )
        }
    ) { inner ->
        if (entries.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(inner).padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("回收站为空", style = MaterialTheme.typography.titleMedium)
                Text(
                    "删除的章节会先留在这里，可随时恢复。",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize().padding(inner)) {
                items(entries, key = { it.chapterId }) { entry ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                entry.title,
                                style = MaterialTheme.typography.titleSmall,
                                maxLines = 1, overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                "${entry.charCount} 字 · 删除于 ${entry.deletedAt.take(10)}",
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                        TextButton(onClick = { onRestore(entry.chapterId) }) { Text("恢复") }
                        IconButton(onClick = { onPurge(entry.chapterId) }) {
                            Icon(Icons.Default.DeleteForever, contentDescription = "彻底删除")
                        }
                    }
                    HorizontalDivider()
                }
            }
        }
    }
}
