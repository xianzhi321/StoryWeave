package com.storyweave.app.ui.p2

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.unit.dp
import com.storyweave.app.data.db.KnowledgeCard

/**
 * P2: 世界设定.
 *
 * Six fields with the same names, order and 1800-character cap as the Web
 * build's `worldFields`, stored inside `work.worldProfile`.
 */
private val WORLD_LABELS = listOf(
    "premise" to "故事背景与核心矛盾",
    "chronology" to "时代与历史",
    "geography" to "地理、地点与社会",
    "rules" to "世界规则与代价",
    "factions" to "势力与阵营",
    "themes" to "主题与叙事基调"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorldScreen(
    initial: Map<String, String>,
    cards: List<KnowledgeCard>,
    newCardId: () -> String,
    onBack: () -> Unit,
    onSave: (Map<String, String>) -> Unit,
    onSaveCards: (List<KnowledgeCard>) -> Unit
) {
    val draft = remember {
        mutableStateOf(WORLD_LABELS.associate { (key, _) -> key to (initial[key] ?: "") })
    }
    var tab by remember { mutableStateOf(0) }
    if (tab == 1) {
        TermsScreen(
            cards = cards,
            newId = newCardId,
            onBack = { tab = 0 },
            onSaveAll = onSaveCards
        )
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("世界设定") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "返回")
                    }
                },
                actions = {
                    TextButton(onClick = { tab = 1 }) { Text("术语") }
                    TextButton(onClick = { onSave(draft.value) }) { Text("保存") }
                }
            )
        }
    ) { inner ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(inner)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                "整理这部作品的故事背景与约束。随备份一起保存。",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 8.dp)
            )
            for ((key, label) in WORLD_LABELS) {
                OutlinedTextField(
                    value = draft.value[key] ?: "",
                    onValueChange = { text ->
                        if (text.length <= 1800) {
                            draft.value = draft.value + (key to text)
                        }
                    },
                    label = { Text(label) },
                    supportingText = { Text("${(draft.value[key] ?: "").length} / 1800") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3
                )
            }
        }
    }
}
