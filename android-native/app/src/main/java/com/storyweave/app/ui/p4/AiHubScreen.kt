package com.storyweave.app.ui.p4

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
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
import com.storyweave.app.data.ai.ModelEntry
import com.storyweave.app.data.db.CharacterEntity
import com.storyweave.app.data.db.KnowledgeCard
import com.storyweave.app.domain.AiAudit
import kotlinx.serialization.json.JsonObject

/**
 * P6 十一：AI 协作（统一入口）.
 *
 * 收拢原本散落的 AI 功能：写作协作、AI 深查、蒸馏提炼、模型连接、AI 推演。
 * 章程红线：所有生成结果都是候选，展示后须作者确认，绝不静默写入正文。
 */
private val TABS = listOf("写作协作", "AI 深查", "蒸馏提炼", "AI 推演", "模型连接")

private val TASKS = listOf(
    "continue" to "续写下一段",
    "polish" to "润色当前章节",
    "review" to "检查逻辑与人设",
    "outline" to "构思后续剧情"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiHubScreen(
    workTitle: String,
    chapterTitle: String,
    chapterText: String,
    characters: List<CharacterEntity>,
    readySkills: List<Pair<String, String>>,
    cards: List<KnowledgeCard>,
    books: List<JsonObject>,
    booksOnImport: () -> Unit,
    booksOnDistill: (String) -> Unit,
    findings: List<AiAudit.Finding>,
    onJumpToFinding: (String, String, Int) -> Unit,
    models: List<ModelEntry>,
    endpoint: String,
    model: String,
    keySaved: Boolean,
    configured: Boolean,
    busy: Boolean,
    status: String,
    result: String?,
    error: String?,
    onBack: () -> Unit,
    onGenerate: (task: String, instructions: String, skillTitle: String?) -> Unit,
    onAdopt: (String) -> Unit,
    onRunAudit: () -> Unit,
    onRehearse: (aId: String, bId: String, prompt: String) -> Unit,
    onPullModels: (String, String) -> Unit,
    onTest: (String, String, String) -> Unit,
    onSaveSettings: (String, String?, String) -> Unit
) {
    var tab by remember { mutableStateOf(0) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("AI 协作") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        }
    ) { inner ->
        Column(modifier = Modifier.fillMaxSize().padding(inner)) {
            ScrollableTabRow(selectedTabIndex = tab, edgePadding = 12.dp) {
                TABS.forEachIndexed { index, label ->
                    Tab(selected = tab == index, onClick = { tab = index }, text = { Text(label) })
                }
            }
            if (status.isNotBlank()) {
                Text(
                    status,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                )
            }
            when (tab) {
                0 -> WritingTab(
                    workTitle, chapterTitle, chapterText, characters, readySkills,
                    configured, busy, result, error, onGenerate, onAdopt
                )
                1 -> AuditTab(configured, busy, findings, onRunAudit, onJumpToFinding)
                2 -> DistillTab(books, busy, booksOnImport, booksOnDistill)
                3 -> RehearseTab(characters, configured, busy, result, error, onRehearse, onAdopt)
                4 -> SettingsTab(
                    endpoint, model, keySaved, busy, models, onPullModels, onTest, onSaveSettings
                )
            }
        }
    }
}

// ---------- Tab 0: 写作协作 ----------
@Composable
private fun WritingTab(
    workTitle: String,
    chapterTitle: String,
    chapterText: String,
    characters: List<CharacterEntity>,
    readySkills: List<Pair<String, String>>,
    configured: Boolean,
    busy: Boolean,
    result: String?,
    error: String?,
    onGenerate: (String, String, String?) -> Unit,
    onAdopt: (String) -> Unit
) {
    var task by remember { mutableStateOf("continue") }
    var instructions by remember { mutableStateOf("") }
    var skillTitle by remember { mutableStateOf<String?>(null) }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        if (!configured) {
            Text(
                "先在「模型连接」页填写 OpenAI 兼容地址与模型 ID。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 8.dp)
            )
        }
        Text("任务", style = MaterialTheme.typography.titleSmall)
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(TASKS[0], TASKS[1]).forEach { (id, label) ->
                FilterChip(selected = task == id, onClick = { task = id }, label = { Text(label) })
            }
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(TASKS[2], TASKS[3]).forEach { (id, label) ->
                FilterChip(selected = task == id, onClick = { task = id }, label = { Text(label) })
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
            Text("附带技能（${readySkills.size} 条已审核）", style = MaterialTheme.typography.titleSmall)
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = skillTitle == null, onClick = { skillTitle = null }, label = { Text("全部") })
                readySkills.take(2).forEach { (title, _) ->
                    FilterChip(
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
            Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
        result?.let { draft ->
            Text("AI 候选（未写入正文）", style = MaterialTheme.typography.titleSmall)
            Text(
                draft,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.fillMaxWidth().padding(8.dp)
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = { onAdopt(draft) }) { Text("采用（追加到本章末尾）") }
                OutlinedButton(onClick = { }) { Text("不采用") }
            }
        }
        Text(
            "发送内容：作品《$workTitle》 · 本章《$chapterTitle》 · 正文末 ${chapterText.takeLast(3000).length} 字" +
                " · 人物 ${characters.size} 位 · 技能 ${readySkills.size} 条",
            style = MaterialTheme.typography.bodySmall
        )
    }
}

// ---------- Tab 1: AI 深查 ----------
@Composable
private fun AuditTab(
    configured: Boolean,
    busy: Boolean,
    findings: List<AiAudit.Finding>,
    onRunAudit: () -> Unit,
    onJumpToFinding: (String, String, Int) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            "把前 5 章与人物/伏笔/编年发给模型；每条发现必须逐字引自正文，证据不足的自动拒收。",
            style = MaterialTheme.typography.bodySmall
        )
        Button(onClick = onRunAudit, enabled = configured && !busy) {
            Text(if (busy) "深查中…" else "AI 深查（逐字证据校验）")
        }
        if (findings.isNotEmpty()) {
            Text("AI 发现 ${findings.size} 条（请人工复核）：", style = MaterialTheme.typography.titleSmall)
            LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp)) {
                items(findings, key = { it.id }) { finding ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 6.dp)
                            .clickable {
                                onJumpToFinding(finding.chapterId, finding.quote, finding.offset)
                            }
                    ) {
                        Text(
                            "${finding.severity} · ${finding.title}",
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 2, overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            "证据：「${finding.quote}」",
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1, overflow = TextOverflow.Ellipsis
                        )
                    }
                    HorizontalDivider()
                }
            }
        }
    }
}

// ---------- Tab 2: 蒸馏提炼 ----------
@Composable
private fun DistillTab(
    books: List<JsonObject>,
    busy: Boolean,
    onImport: () -> Unit,
    onDistill: (String) -> Unit
) {
    fun str(row: JsonObject, key: String) =
        (row[key] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: ""
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            "导入参考书（TXT/Markdown），平衡抽样开头/中段/后段，AI 提炼可复用写作技巧为待审核候选。",
            style = MaterialTheme.typography.bodySmall
        )
        OutlinedButton(onClick = onImport) { Text("导入参考书") }
        if (books.isEmpty()) {
            Text("还没有参考书。", style = MaterialTheme.typography.bodySmall)
        } else {
            Text("我的参考文献（${books.size}）", style = MaterialTheme.typography.titleSmall)
            books.forEach { row ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(str(row, "title"), style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                        Text(
                            str(row, "type").uppercase() + " · " + str(row, "text").length + " 字",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                    TextButton(onClick = { onDistill(str(row, "id")) }, enabled = !busy) {
                        Text(if (busy) "蒸馏中…" else "提炼")
                    }
                }
            }
        }
    }
}

// ---------- Tab 3: AI 推演 ----------
@Composable
private fun RehearseTab(
    characters: List<CharacterEntity>,
    configured: Boolean,
    busy: Boolean,
    result: String?,
    error: String?,
    onRehearse: (String, String, String) -> Unit,
    onAdopt: (String) -> Unit
) {
    var aId by remember { mutableStateOf("") }
    var bId by remember { mutableStateOf("") }
    var prompt by remember { mutableStateOf("") }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            "选两位角色试运行冲突：人物只能基于自己知道的信息行动。候选不写正文、不改档案。",
            style = MaterialTheme.typography.bodySmall
        )
        if (characters.size < 2) {
            Text("请先在「人物」页创建至少两位角色。", style = MaterialTheme.typography.bodySmall)
        } else {
            Text("角色甲", style = MaterialTheme.typography.titleSmall)
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                characters.take(4).forEach { c ->
                    FilterChip(
                        selected = aId == c.id,
                        onClick = { aId = c.id },
                        label = { Text(c.name, maxLines = 1) }
                    )
                }
            }
            Text("角色乙", style = MaterialTheme.typography.titleSmall)
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                characters.take(4).forEach { c ->
                    FilterChip(
                        selected = bId == c.id,
                        onClick = { bId = c.id },
                        label = { Text(c.name, maxLines = 1) }
                    )
                }
            }
            OutlinedTextField(
                value = prompt,
                onValueChange = { prompt = it },
                label = { Text("推演要求（如：在旧钟楼对峙）") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2
            )
            Button(
                onClick = { onRehearse(aId, bId, prompt.trim()) },
                enabled = configured && !busy && aId.isNotBlank() && bId.isNotBlank() && aId != bId
            ) { Text(if (busy) "推演中…" else "生成候选场景") }
            if (error != null) {
                Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
            result?.let { draft ->
                Text("推演候选（未写入正文）", style = MaterialTheme.typography.titleSmall)
                Text(draft, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(onClick = { onAdopt(draft) }) { Text("采用（追加到本章末尾）") }
                    OutlinedButton(onClick = { }) { Text("不采用") }
                }
            }
        }
    }
}

// ---------- Tab 4: 模型连接 ----------
@Composable
private fun SettingsTab(
    endpoint: String,
    model: String,
    keySaved: Boolean,
    busy: Boolean,
    models: List<ModelEntry>,
    onPullModels: (String, String) -> Unit,
    onTest: (String, String, String) -> Unit,
    onSaveSettings: (String, String?, String) -> Unit
) {
    var ep by remember { mutableStateOf(endpoint) }
    var keyInput by remember { mutableStateOf("") }
    var rememberKey by remember { mutableStateOf(true) }
    var selectedModel by remember { mutableStateOf(model) }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(
            "拉取模型只请求列表，测试只发送一句测试提示。密钥按 API 地址保存在系统密钥库，不写入作品备份。",
            style = MaterialTheme.typography.bodySmall
        )
        OutlinedTextField(
            value = ep,
            onValueChange = { ep = it },
            label = { Text("OpenAI 兼容 API 地址") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = keyInput,
            onValueChange = { keyInput = it },
            label = { Text(if (keySaved) "API Key（已保存，可覆盖）" else "API Key") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = rememberKey, onCheckedChange = { rememberKey = it })
            Text("长期保存在本机", style = MaterialTheme.typography.bodySmall)
        }
        OutlinedTextField(
            value = selectedModel,
            onValueChange = { selectedModel = it },
            label = { Text("模型 ID") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(onClick = { onPullModels(ep.trim(), keyInput.trim()) }, enabled = !busy) {
                Text("拉取模型")
            }
            OutlinedButton(
                onClick = { onTest(ep.trim(), keyInput.trim(), selectedModel.trim()) },
                enabled = !busy
            ) { Text("测试连接") }
            Button(
                onClick = {
                    val keyOrNull = keyInput.trim().takeIf { it.isNotEmpty() }
                    onSaveSettings(ep.trim(), keyOrNull, selectedModel.trim())
                },
                enabled = !busy
            ) { Text("保存云端配置") }
        }
        if (models.isNotEmpty()) {
            Text("可用模型（${models.size}）", style = MaterialTheme.typography.titleSmall)
            models.take(20).forEach { entry ->
                TextButton(onClick = { selectedModel = entry.id }) {
                    Text(
                        entry.id + if (entry.name.isNotBlank() && entry.name != entry.id) " · ${entry.name}" else "",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
    }
}
