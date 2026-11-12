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
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.foundation.clickable
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.JsonObject

/**
 * P6 三: 选段批注列表.
 *
 * Rows are the Web build's annotations shape ({text, start, end, note});
 * the editor shows the same marginalia "辅助，不修改正文" rule.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnnotationsScreen(
    annotations: List<JsonObject>,
    chapterTitle: (String) -> String,
    onBack: () -> Unit,
    onDelete: (String) -> Unit,
    onJump: (String) -> Unit = {}
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("选段批注") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, contentDescription = "返回") }
                }
            )
        }
    ) { inner ->
        if (annotations.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(inner).padding(24.dp),
                verticalArrangement = Arrangement.Center
            ) {
                Text("本章还没有批注", style = MaterialTheme.typography.titleMedium)
                Text(
                    "在正文里选中一段文字，点「批注」记录想法。批注只作辅助，不会修改正文。",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize().padding(inner)) {
                items(annotations, key = {
                    (it["id"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: ""
                }) { row ->
                    fun str(key: String) =
                        (row[key] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: ""
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 10.dp)
                            .clickable { onJump(str("chapterId")) }
                    ) {
                        Text(
                            "「${str("text")}」",
                            style = MaterialTheme.typography.bodyMedium,
                            maxLines = 2, overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            str("note"),
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 2.dp)
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                chapterTitle(str("chapterId")) + " · " + str("created").take(10),
                                style = MaterialTheme.typography.bodySmall
                            )
                            IconButton(onClick = { onDelete(str("id")) }) {
                                Icon(Icons.Default.Delete, contentDescription = "删除批注")
                            }
                        }
                    }
                    HorizontalDivider()
                }
            }
        }
    }
}
