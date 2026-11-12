package com.storyweave.app.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.storyweave.app.core.migration.MigrationEntry
import com.storyweave.app.core.migration.MigrationLedger
import com.storyweave.app.data.Graph
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * P0 screen: migration ledger plus the backup import/export bridge.
 *
 * The bridge is the only feature that is genuinely functional in P0; it exists
 * so the data layer is verifiable on a real device against real Web backups.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MigrationScreen(entries: List<MigrationEntry>) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember { Graph.repository(context.applicationContext) }

    var status by remember { mutableStateOf("导入 Web 版导出的 JSON 备份以验证数据兼容。") }
    var busy by remember { mutableStateOf(false) }

    val importLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        busy = true
        scope.launch {
            status = try {
                val raw = withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
                        ?: error("无法读取所选文件")
                }
                withContext(Dispatchers.IO) { repository.importJson(raw) }
                val document = withContext(Dispatchers.IO) { repository.load() }
                "已导入 ${document.projects.size} 部作品、${document.collections.size} 个集合。"
            } catch (error: Throwable) {
                "导入失败：${error.message ?: error::class.java.simpleName}"
            } finally {
                busy = false
            }
        }
    }

    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        busy = true
        scope.launch {
            status = try {
                val json = withContext(Dispatchers.IO) { repository.exportJson() }
                withContext(Dispatchers.IO) {
                    context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use { it.write(json) }
                        ?: error("无法写入所选位置")
                }
                "已导出 ${json.length} 字节的 JSON 备份。"
            } catch (error: Throwable) {
                "导出失败：${error.message ?: error::class.java.simpleName}"
            } finally {
                busy = false
            }
        }
    }

    val done = entries.count { it.status == MigrationEntry.Status.DONE }
    val total = entries.size
    val percent = if (total == 0) 0 else done * 100 / total

    Scaffold(
        topBar = { TopAppBar(title = { Text("叙境 · 原生版 P0") }) },
        contentWindowInsets = WindowInsets.safeDrawing
    ) { inner ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(inner)
                .padding(horizontal = 16.dp)
        ) {
            Text(
                text = "原生化进度 $done / $total（$percent%）",
                style = MaterialTheme.typography.titleMedium
            )
            Text(
                text = "未完成迁移的功能会如实列出，不会被隐藏或假装已完成。",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(vertical = 6.dp)
            )
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    onClick = { importLauncher.launch(arrayOf("application/json", "text/plain", "*/*")) },
                    enabled = !busy
                ) { Text("导入 JSON 备份") }
                OutlinedButton(
                    onClick = { exportLauncher.launch("StoryWeave-原生导出.json") },
                    enabled = !busy
                ) { Text("导出 JSON") }
            }
            Text(
                text = status,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                items(entries) { entry ->
                    Column(modifier = Modifier.padding(vertical = 6.dp)) {
                        Text("${entry.statusLabel} · ${entry.name}")
                        if (entry.note.isNotBlank()) {
                            Text(entry.note, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}
