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
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.storyweave.app.data.ai.ModelEntry

/**
 * P4: 模型连接（endpoint / key / model）.
 *
 * Mirrors the Web build's markup() flow: pull models, test with one short
 * prompt, save. The key is stored in EncryptedSharedPreferences keyed by base
 * address and never enters the manuscript backup.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiSettingsScreen(
    initialEndpoint: String,
    savedKeyPresent: Boolean,
    initialModel: String,
    status: String,
    busy: Boolean,
    models: List<ModelEntry>,
    onBack: () -> Unit,
    onPullModels: (String, String) -> Unit,
    onTest: (String, String, String) -> Unit,
    onSave: (String, String?, String) -> Unit
) {
    var endpoint by remember { mutableStateOf(initialEndpoint) }
    var keyInput by remember { mutableStateOf("") }
    var rememberKey by remember { mutableStateOf(true) }
    var model by remember { mutableStateOf(initialModel) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("模型连接") },
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
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                "拉取模型只请求列表，测试只发送一句测试提示。密钥按 API 地址保存在系统密钥库，不写入作品备份。",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 8.dp)
            )
            OutlinedTextField(
                value = endpoint,
                onValueChange = { endpoint = it },
                label = { Text("OpenAI 兼容 API 地址") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = keyInput,
                onValueChange = { keyInput = it },
                label = { Text(if (savedKeyPresent) "API Key（已保存，可覆盖）" else "API Key") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = rememberKey, onCheckedChange = { rememberKey = it })
                Text("长期保存在本机", style = MaterialTheme.typography.bodySmall)
            }
            OutlinedTextField(
                value = model,
                onValueChange = { model = it },
                label = { Text("模型 ID") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(
                    onClick = { onPullModels(endpoint.trim(), keyInput.trim()) },
                    enabled = !busy
                ) { Text("拉取模型") }
                OutlinedButton(
                    onClick = { onTest(endpoint.trim(), keyInput.trim(), model.trim()) },
                    enabled = !busy
                ) { Text("测试连接") }
                Button(
                    onClick = {
                        // Empty keyInput keeps the saved key (null = don't touch).
                        val keyOrNull = keyInput.trim().takeIf { it.isNotEmpty() }
                        onSave(endpoint.trim(), keyOrNull, model.trim())
                    },
                    enabled = !busy
                ) { Text("保存云端配置") }
            }
            if (models.isNotEmpty()) {
                Text("可用模型（${models.size}）", style = MaterialTheme.typography.titleSmall)
                for (entry in models.take(30)) {
                    TextButton(onClick = { model = entry.id }) {
                        Text(
                            entry.id + if (entry.name.isNotBlank() && entry.name != entry.id) " · ${entry.name}" else "",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }
            if (status.isNotBlank()) {
                Text(status, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
