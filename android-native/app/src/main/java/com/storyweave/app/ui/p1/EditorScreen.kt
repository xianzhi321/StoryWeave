package com.storyweave.app.ui.p1

import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

/**
 * Writing screen.
 *
 * The body uses an EditText hosted in AndroidView rather than BasicTextField:
 * for chapters in the tens of thousands of characters plus Chinese IME
 * composition, the platform text widget is the reliable path (see the migration
 * plan §3.2). It is still fully native — no WebView anywhere.
 *
 * IME safety: text is only committed on confirmed input. While a composition is
 * active (`isComposing`), intermediate candidates never reach the model, which
 * is the same rule the Web build enforces.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditorScreen(
    state: EditorState,
    saveState: SaveState,
    onTextChanged: (String) -> Unit,
    onTitleChanged: (String) -> Unit,
    onBack: () -> Unit,
    onFlush: () -> Unit,
    todayCount: Int = 0,
    dailyGoal: Int = 0,
    onSetGoal: (Int) -> Unit = {},
    onExportChapter: () -> Unit = {},
    onOpenAiHub: () -> Unit = {},
    onAddAnnotation: (start: Int, end: Int, selectedText: String, note: String) -> Unit,
    onPrevChapter: () -> Unit,
    onNextChapter: () -> Unit,
    contextPeople: List<com.storyweave.app.domain.WritingContext.Mention>,
    contextPlots: List<com.storyweave.app.domain.WritingContext.Mention>,
    chapterAnnotations: List<kotlinx.serialization.json.JsonObject>,
    pendingSelection: Pair<String, IntRange>? = null
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val currentFlush by rememberUpdatedState(onFlush)

    // Backgrounding the app must persist immediately: the process can be killed
    // while stopped, and a 270 ms debounce window would lose the last keystrokes.
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) currentFlush()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // Leaving the editor flushes too.
    DisposableEffect(Unit) {
        onDispose { currentFlush() }
    }

    var focusMode by remember { mutableStateOf(false) }
    var bodyRef by remember { mutableStateOf<android.widget.EditText?>(null) }
    var annotationDraft by remember { mutableStateOf<Triple<Int, Int, String>?>(null) }
    var annotationNote by remember { mutableStateOf("") }
    var showContext by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            if (focusMode) {
                // 专注模式：只留退出按钮，标题输入收起。
                TopAppBar(
                    title = { Text(state.title, maxLines = 1) },
                    navigationIcon = {
                        IconButton(onClick = { focusMode = false; onBack() }) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "退出专注")
                        }
                    },
                    actions = {
                        TextButton(onClick = { focusMode = false }) { Text("退出") }
                    }
                )
            } else {
                TopAppBar(
                    title = {
                        OutlinedTextField(
                            value = state.title,
                            onValueChange = onTitleChanged,
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            textStyle = MaterialTheme.typography.titleMedium
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "返回目录")
                        }
                    },
                    actions = {
                        TextButton(onClick = onExportChapter) { Text("本章TXT") }
                        TextButton(onClick = { onPrevChapter() }) { Text("◀") }
                        TextButton(onClick = { onNextChapter() }) { Text("▶") }
                        TextButton(onClick = { showContext = true }) { Text("上下文") }
                        TextButton(onClick = onOpenAiHub) { Text("AI") }
                        TextButton(onClick = { focusMode = true }) { Text("专注") }
                        TextButton(onClick = {
                            val view = bodyRef ?: return@TextButton
                            val selStart = view.selectionStart.coerceAtLeast(0)
                            val selEnd = view.selectionEnd.coerceAtLeast(selStart)
                            if (selEnd - selStart < 2) return@TextButton
                            val text = view.text?.toString()?.substring(selStart, selEnd) ?: return@TextButton
                            annotationDraft = Triple(selStart, selEnd, text)
                        }) { Text("批注") }
                    }
                )
            }
        }
    ) { inner ->
        Column(modifier = Modifier.fillMaxSize().padding(inner)) {
            ChapterBody(
                key = state.chapterId,
                initialText = state.text,
                onTextChanged = onTextChanged,
                modifier = Modifier.weight(1f),
                onBodyCreated = { view -> bodyRef = view },
                pendingSelection = pendingSelection
            )
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "${charCount(state.text)} 字",
                        style = MaterialTheme.typography.bodySmall
                    )
                    if (dailyGoal > 0) {
                        Text(
                            text = "今日 $todayCount / $dailyGoal（${com.storyweave.app.domain.DailyProgress.percent(todayCount, dailyGoal)}%）",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
                when (saveState) {
                    SaveState.SAVED -> Text("已保存至本机", style = MaterialTheme.typography.bodySmall)
                    SaveState.PENDING -> Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(modifier = Modifier.padding(end = 6.dp), strokeWidth = 2.dp)
                        Text("保存中…", style = MaterialTheme.typography.bodySmall)
                    }
                    SaveState.FAILED -> Text(
                        "保存失败，请勿退出并重试",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        }
        if (annotationDraft != null) {
            val (start, end, text) = annotationDraft!!
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { annotationDraft = null },
                title = { androidx.compose.material3.Text("选段批注") },
                text = {
                    androidx.compose.foundation.layout.Column {
                        androidx.compose.material3.Text(
                            "「${if (text.length > 40) text.take(40) + "…" else text}」",
                            style = MaterialTheme.typography.bodySmall
                        )
                        androidx.compose.material3.OutlinedTextField(
                            value = annotationNote,
                            onValueChange = { annotationNote = it },
                            label = { androidx.compose.material3.Text("批注只作辅助，不会修改正文") },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                },
                confirmButton = {
                    TextButton(onClick = {
                        onAddAnnotation(start, end, text, annotationNote.trim())
                        annotationNote = ""
                        annotationDraft = null
                    }) { androidx.compose.material3.Text("保存批注") }
                },
                dismissButton = { TextButton(onClick = { annotationDraft = null }) { androidx.compose.material3.Text("取消") } }
            )
        }

        if (showContext) {
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { showContext = false },
                title = { Text("本章创作上下文") },
                text = {
                    Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                        Text("当前提及的人物", style = MaterialTheme.typography.titleSmall)
                        if (contextPeople.isEmpty()) Text(
                            "本章暂未提及已建立档案的人物。",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(vertical = 4.dp)
                        ) else for (p in contextPeople) {
                            Text("· ${p.name} —— ${p.detail}", style = MaterialTheme.typography.bodySmall)
                        }
                        Text(
                            "本章相关线索",
                            style = MaterialTheme.typography.titleSmall,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                        if (contextPlots.isEmpty()) Text(
                            "本章暂无关联伏笔。",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(vertical = 4.dp)
                        ) else for (p in contextPlots) {
                            Text("· ${p.name}（${p.detail}）", style = MaterialTheme.typography.bodySmall)
                        }
                        Text(
                            "本章批注 ${chapterAnnotations.size} 条",
                            style = MaterialTheme.typography.titleSmall,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                        for (a in chapterAnnotations.take(5)) {
                            val note = (a["note"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: ""
                            Text("· $note", style = MaterialTheme.typography.bodySmall, maxLines = 1)
                        }
                    }
                },
                confirmButton = { TextButton(onClick = { showContext = false }) { Text("关闭") } }
            )
        }
    }
}

@Composable
private fun ChapterBody(
    key: String,
    initialText: String,
    onTextChanged: (String) -> Unit,
    modifier: Modifier = Modifier,
    onBodyCreated: (android.widget.EditText) -> Unit = {},
    pendingSelection: Pair<String, IntRange>? = null
) {
    val context = LocalContext.current
    val latestOnChanged by rememberUpdatedState(onTextChanged)

    AndroidView(
        modifier = modifier.fillMaxSize(),
        factory = { ctx ->
            android.widget.EditText(ctx).apply {
                setText(initialText)
                setSelection(initialText.length)
                // Some OEM ROMs centre multiline text vertically; be explicit.
                gravity = android.view.Gravity.TOP or android.view.Gravity.START
                minLines = 1
                maxLines = Int.MAX_VALUE
                inputType = InputType.TYPE_CLASS_TEXT or
                    InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                    InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
                // Landscape tablets otherwise enter the IME fullscreen extract
                // mode, which edits the text inside a box in the middle of the
                // screen. Both flags are the standard fix for writing apps.
                imeOptions = android.view.inputmethod.EditorInfo.IME_FLAG_NO_EXTRACT_UI or
                    android.view.inputmethod.EditorInfo.IME_FLAG_NO_FULLSCREEN
                background = null
                textSize = 17f
                setLineSpacing(0f, 1.6f)
                setPadding(48, 32, 48, 32)
                addTextChangedListener(object : TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
                    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
                    override fun afterTextChanged(s: Editable?) {
                        val text = s?.toString() ?: return
                        // Intermediate IME candidates must not reach the model: the
                        // composing span is present until the candidate is confirmed.
                        if (isComposing(s)) return
                        latestOnChanged(text)
                    }
                })
            }
        },
        update = { view ->
            if (view.tag != key) {
                view.tag = key
                if (view.text?.toString() != initialText) {
                    view.setText(initialText)
                    view.setSelection(initialText.length)
                }
            }
            // 跳转选中：AI 深查/批注定位到引文位置。
            val pending = pendingSelection
            if (pending != null && view.tag == key) {
                val textLen = view.text?.length ?: 0
                val start = pending.second.first
                val endInclusive = pending.second.last
                if (start in 0 until textLen) {
                    view.setSelection(start, (endInclusive + 1).coerceAtMost(textLen))
                }
            }
        }
    )
}

/**
 * True while the IME is composing a candidate (pinyin, handwriting, …).
 *
 * Uses the public BaseInputConnection composing-span accessors; the composing
 * span exists exactly while the user has not confirmed the candidate yet.
 */
internal fun isComposing(editable: Editable?): Boolean {
    editable ?: return false
    val start = android.view.inputmethod.BaseInputConnection.getComposingSpanStart(editable)
    val end = android.view.inputmethod.BaseInputConnection.getComposingSpanEnd(editable)
    return start >= 0 && end > start
}

/** Whitespace-insensitive code point count, matching the Web build's counter. */
internal fun charCount(text: String): Int {
    var total = 0
    for (ch in text) {
        if (ch.isWhitespace()) continue
        total++
    }
    return total
}
