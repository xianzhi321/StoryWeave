package com.storyweave.app.ui.p4

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.storyweave.app.data.db.KnowledgeCard
import com.storyweave.app.data.db.CharacterEntity

/**
 * P4: AI 写作协作.
 *
 * Charter rule enforced here: a generated draft is a **candidate**. It is shown
 * for review; it enters the manuscript only through 「采用」, which appends it
 * via the editor's normal save path. Nothing is written silently.
 *
 * Prompt shape mirrors the Web build's openAiAssist(): work background +
 * characters + optional ready skills + the tail of the current chapter.
 */
private val TASKS = listOf(
    "continue" to "续写下一段",
    "polish" to "润色当前章节",
    "review" to "检查逻辑与人设",
    "outline" to "构思后续剧情"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiAssistScreen(
    workTitle: String,
    chapterTitle: String,
    chapterText: String,
    characters: List<CharacterEntity>,
    readySkills: List<Pair<String, String>>,
    cards: List<KnowledgeCard>,
    configured: Boolean,
    busy: Boolean,
    result: String?,
    error: String?,
    onBack: () -> Unit,
    onGenerate: (task: String, instructions: String, skillTitle: String?) -> Unit,
    onAdopt: (String) -> Unit
) {
    var task by remember { mutableStateOf("continue") }
    var instructions by remember { mutableStateOf("") }
    var skillTitle by remember { mutableStateOf<String?>(null) }

    val tail = chapterText.takeLast(3000)
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("AI 写作协作 · $chapterTitle", maxLines = 1) },
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
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (!configured) {
                Text(
                    "先在「设置 → 模型连接」填写 OpenAI 兼容地址与模型 ID。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
            Text("任务", style = MaterialTheme.typography.titleSmall)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                for ((id, label) in TASKS.take(2)) {
                    androidx.compose.material3.FilterChip(
                        selected = task == id,
                        onClick = { task = id },
                        label = { Text(label) }
                    )
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                for ((id, label) in TASKS.takeLast(2)) {
                    androidx.compose.material3.FilterChip(
                        selected = task == id,
                        onClick = { task = id },
                        label = { Text(label) }
                    )
                }
            }
            OutlinedTextField(
                value = instructions,
                onValueChange = { instructions = it },
                label = { Text("额外要求（可选）") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2
            )
            if (readySkills.isNotEmpty()) {
                Text(
                    "附带技能（${readySkills.size} 条已审核）",
                    style = MaterialTheme.typography.titleSmall
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    androidx.compose.material3.FilterChip(
                        selected = skillTitle == null,
                        onClick = { skillTitle = null },
                        label = { Text("全部") }
                    )
                    readySkills.take(2).forEach { (title, _) ->
                        androidx.compose.material3.FilterChip(
                            selected = skillTitle == title,
                            onClick = { skillTitle = title },
                            label = { Text(title, maxLines = 1) }
                        )
                    }
                }
            }
            Button(
                onClick = { onGenerate(task, instructions.trim(), skillTitle) },
                enabled = configured && !busy
            ) { Text(if (busy) "正在生成…" else "生成建议") }
            if (error != null) {
                Text(error!!, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
            result?.let { draft ->
                Text("AI 候选（未写入正文）", style = MaterialTheme.typography.titleSmall)
                Text(
                    draft,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp)
                )
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(onClick = { onAdopt(draft) }) { Text("采用（追加到本章末尾）") }
                    OutlinedButton(onClick = { onBack() }) { Text("不采用，返回") }
                }
            }
            // Show what will be sent, like the Web build's 发送内容预览.
            Text(
                "发送内容：作品《$workTitle》 · 本章《$chapterTitle》 · 正文末 ${tail.length} 字" +
                    " · 人物 ${characters.size} 位 · 技能 ${readySkills.size} 条",
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}
