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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
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
import kotlinx.serialization.json.JsonObject

/**
 * P6 九: 场景卡（Web 版 v11 场景罗盘）.
 *
 * 每章一张罗盘：视角人物 / 状态 / 目的 / 备注。数据走 sceneCards 集合
 * （{title, viewpoint, status, purpose, notes}，Web 兼容）。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SceneCardsScreen(
    cards: List<JsonObject>,
    chapterTitle: (String) -> String,
    onBack: () -> Unit,
    onAdd: () -> Unit,
    onEdit: (JsonObject) -> Unit,
    onDelete: (String) -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("场景卡") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, contentDescription = "返回") }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onAdd) {
                Icon(Icons.Default.Add, contentDescription = "新增场景卡")
            }
        }
    ) { inner ->
        if (cards.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(inner).padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("本章还没有场景卡", style = MaterialTheme.typography.titleMedium)
                Text(
                    "场景卡不会混进正文。先规划行动与冲突，写作时随时查看。",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize().padding(inner)) {
                items(cards, key = { (it["id"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: "" }) { row ->
                    fun str(key: String) =
                        (row[key] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: ""
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 10.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    str("title"),
                                    style = MaterialTheme.typography.titleSmall,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    chapterTitle(str("chapterId")) + " · " + str("status") + " · 视角 " +
                                        str("viewpoint").ifBlank { "未定" },
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                            TextButton(onClick = { onEdit(row) }) { Text("编辑") }
                            IconButton(onClick = { onDelete(str("id")) }) {
                                Icon(Icons.Default.Delete, contentDescription = "删除场景卡")
                            }
                        }
                        if (str("purpose").isNotBlank()) {
                            Text(
                                "目的：" + str("purpose"),
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 1, overflow = TextOverflow.Ellipsis
                            )
                        }
                        if (str("notes").isNotBlank()) {
                            Text(
                                str("notes"),
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 2, overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                    HorizontalDivider()
                }
            }
        }
    }
}
