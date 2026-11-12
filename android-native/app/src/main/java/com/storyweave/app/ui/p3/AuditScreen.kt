package com.storyweave.app.ui.p3

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
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.storyweave.app.domain.AuditIssue
import com.storyweave.app.domain.AuditReport
import com.storyweave.app.domain.Severity

/**
 * P3: 一致性审查结果页.
 *
 * Shows what the rule engine found. The copy mirrors the Web build on purpose:
 * these are hints for the author to verify, not verdicts.
 */
private fun severityLabel(severity: Severity): String = when (severity) {
    Severity.CRITICAL -> "严重"
    Severity.WARNING -> "需要核查"
    Severity.NOTICE -> "提示"
    Severity.INFO -> "说明"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuditScreen(
    workTitle: String,
    report: AuditReport?,
    loading: Boolean,
    aiAvailable: Boolean,
    aiBusy: Boolean,
    aiStatus: String,
    aiFindings: List<com.storyweave.app.domain.AiAudit.Finding>,
    onBack: () -> Unit,
    onRunAiAudit: () -> Unit,
    onJumpToFinding: (String, String, Int) -> Unit = { _, _, _ -> }
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("一致性审查 · $workTitle", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, contentDescription = "返回") }
                }
            )
        }
    ) { inner ->
        Column(
            modifier = Modifier.fillMaxSize().padding(inner).padding(horizontal = 16.dp)
        ) {
            Text(
                "这是规则检查，不是完整的事实一致性证明。请人工复核每一条。",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 8.dp, bottom = 8.dp)
            )
            when {
                loading -> Text("正在检查…", style = MaterialTheme.typography.bodySmall)
                report == null -> Text("尚未运行审查。", style = MaterialTheme.typography.bodySmall)
                report.issues.isEmpty() -> {
                    Text("未发现规则检查所覆盖的问题", style = MaterialTheme.typography.titleSmall)
                    Text(
                        "建议继续人工审读。",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
                else -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (severity in listOf(Severity.WARNING, Severity.NOTICE, Severity.INFO)) {
                            val count = report.counts[severity] ?: 0
                            if (count > 0) {
                                AssistChip(
                                    onClick = {},
                                    label = { Text("${severityLabel(severity)} $count") }
                                )
                            }
                        }
                    }
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        items(report.issues, key = { it.id }) { issue ->
                            IssueRow(issue)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun IssueRow(issue: AuditIssue) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
        Text(
            "${severityLabel(issue.severity)} · ${issue.title}",
            style = MaterialTheme.typography.titleSmall,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            issue.detail,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 2.dp)
        )
    }
}
