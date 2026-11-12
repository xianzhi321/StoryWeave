package com.storyweave.app.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.storyweave.app.core.migration.MigrationLedger
import com.storyweave.app.ui.p1.ContentsScreen
import com.storyweave.app.ui.p1.EditorScreen
import com.storyweave.app.ui.p1.ShelfScreen
import com.storyweave.app.ui.p1.WritingViewModel
import com.storyweave.app.ui.p2.CharactersScreen
import com.storyweave.app.ui.p2.WorldScreen
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import com.storyweave.app.ui.p3.AuditScreen
import com.storyweave.app.ui.p3.PlotBoardScreen
import com.storyweave.app.ui.p3.TimelineScreen
import com.storyweave.app.ui.p4.AiHubScreen
import com.storyweave.app.ui.p4.AiAssistScreen
import com.storyweave.app.ui.p4.AiSettingsScreen
import com.storyweave.app.ui.p4.SkillsScreen
import com.storyweave.app.ui.p2.TermsScreen
import com.storyweave.app.ui.p6.ChapterTrashScreen
import com.storyweave.app.ui.p6.AnnotationsScreen
import com.storyweave.app.ui.p6.SceneCardsScreen
import com.storyweave.app.ui.p6.HistoryScreen
import com.storyweave.app.ui.p6.ReaderScreen
import com.storyweave.app.ui.p6.SearchScreen
import com.storyweave.app.ui.p5.SettingsScreen
import com.storyweave.app.ui.MigrationScreen

/**
 * P1 navigation: shelf → contents → editor, plus the P0 ledger screen.
 *
 * Deliberately a small state machine instead of Navigation-Compose: three
 * destinations with one back stack entry each does not justify a nav graph yet.
 */
private sealed interface Destination {
    data object Shelf : Destination
    data class Contents(val workId: String, val title: String) : Destination
    data object Editor : Destination
    data class Characters(val workId: String, val title: String) : Destination
    data class World(val workId: String, val title: String) : Destination
    data class Plots(val workId: String, val title: String) : Destination
    data class Timeline(val workId: String, val title: String) : Destination
    data class Audit(val workId: String, val title: String) : Destination
    data class Skills(val workId: String, val title: String) : Destination
    data class ChapterTrash(val workId: String, val title: String) : Destination
    data object Annotations : Destination
    data object Settings : Destination
    data object Ledger : Destination
    data object Terms : Destination
    data object SceneCards : Destination
    data object History : Destination
    data object Reader : Destination
    data object Search : Destination
    data object AiHub : Destination
    data object AiSettings : Destination
    data object AiAssist : Destination
}


@Composable
fun AppRoot(
    viewModel: WritingViewModel = viewModel()
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    var destination by remember { mutableStateOf<Destination>(Destination.Shelf) }
    var workTitle by remember { mutableStateOf("") }
    var currentWorkIdForSkills by remember { mutableStateOf("") }

    val works by viewModel.works.collectAsStateWithLifecycle()
    val chapters by viewModel.chapters.collectAsStateWithLifecycle()
    val editor by viewModel.current.collectAsStateWithLifecycle()
    val saveState by viewModel.saveState.collectAsStateWithLifecycle()
    val characters by viewModel.characters.collectAsStateWithLifecycle()
    val relations by viewModel.relations.collectAsStateWithLifecycle()
    val relationHistory by viewModel.relationHistory.collectAsStateWithLifecycle()
    val worldProfile by viewModel.worldProfile.collectAsStateWithLifecycle()
    val knowledgeCards by viewModel.knowledgeCards.collectAsStateWithLifecycle()
    var plots by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    var plotLinks by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    var timelineEvents by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    var auditLoading by remember { mutableStateOf(false) }
    val auditReport by viewModel.auditReport.collectAsStateWithLifecycle()
    val skills by viewModel.skills.collectAsStateWithLifecycle()
    val aiStatus by viewModel.aiStatus.collectAsStateWithLifecycle()
    val aiBusy by viewModel.aiBusy.collectAsStateWithLifecycle()
    val aiResult by viewModel.aiResult.collectAsStateWithLifecycle()
    val aiError by viewModel.aiError.collectAsStateWithLifecycle()
    val aiModels by viewModel.aiModels.collectAsStateWithLifecycle()
    val aiFindings by viewModel.aiFindings.collectAsStateWithLifecycle()
    val pendingSelection by viewModel.pendingSelection.collectAsStateWithLifecycle()
    val annotations by viewModel.annotations.collectAsStateWithLifecycle()
    val dailyGoal by viewModel.dailyGoal.collectAsStateWithLifecycle()
    val todayCount by viewModel.todayCount.collectAsStateWithLifecycle()
    val sceneCards by viewModel.sceneCardsState.collectAsStateWithLifecycle()
    val historyEntries by viewModel.historyEntries.collectAsStateWithLifecycle()
    val searchHits by viewModel.searchHits.collectAsStateWithLifecycle()
    val searchQuery by viewModel.searchQuery.collectAsStateWithLifecycle()
    val reader by viewModel.reader.collectAsStateWithLifecycle()
    var libraryBooksState by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    val plotsRaw by viewModel.plots.collectAsStateWithLifecycle()
    val libraryBooks = libraryBooksState
    val aiSettings by viewModel.aiSettings.collectAsStateWithLifecycle()
    val worldMaps by viewModel.worldMaps.collectAsStateWithLifecycle()
    val worldPlaces by viewModel.worldPlaces.collectAsStateWithLifecycle()
    val chapterTrash by viewModel.chapterTrash.collectAsStateWithLifecycle()
    var exportPendingText by remember { mutableStateOf<String?>(null) }
    var chapterExportText by remember { mutableStateOf<String?>(null) }
    var showSceneEditor by remember { mutableStateOf(false) }
    var historyChapterId by remember { mutableStateOf("") }
    var sceneDraft by remember { mutableStateOf<JsonObject?>(null) }
    var sceneTitle by remember { mutableStateOf("") }
    var sceneViewpoint by remember { mutableStateOf("") }
    var sceneStatus by remember { mutableStateOf("规划") }
    var scenePurpose by remember { mutableStateOf("") }
    var sceneNotes by remember { mutableStateOf("") }
    val chapterExportLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.CreateDocument("text/plain")
    ) { uri ->
        val pending = chapterExportText
        if (uri != null && pending != null) {
            context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use { it.write(pending) }
            chapterExportText = null
        }
    }
    val manuscriptLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            val raw = runCatching {
                context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
            }.getOrNull().orEmpty()
            if (raw.isNotBlank()) {
                val name = uri.lastPathSegment?.substringAfterLast('/') ?: "导入的小说"
                viewModel.importManuscript(name.substringBeforeLast('.'), raw) { id ->
                    workTitle = name.substringBeforeLast('.')
                    viewModel.openWork(id)
                    destination = Destination.Contents(id, workTitle)
                }
            }
        }
    }
    val bookLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            val raw = runCatching {
                context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
            }.getOrNull().orEmpty()
            if (raw.isNotBlank()) {
                val name = uri.lastPathSegment?.substringAfterLast('/') ?: "参考书"
                val type = if (name.endsWith(".md", true)) "markdown" else "txt"
                viewModel.importBook(currentWorkIdForSkills, name.substringBeforeLast('.'), type, raw)
                viewModel.loadLibrary(currentWorkIdForSkills) { loaded -> libraryBooksState = loaded }
            }
        }
    }
    val exportLauncherState = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.CreateDocument("text/plain")
    ) { uri ->
        val pending = exportPendingText
        if (uri != null && pending != null) {
            context.contentResolver.openOutputStream(uri)?.bufferedWriter()?.use { it.write(pending) }
            exportPendingText = null
        }
    }

    when (val current = destination) {
        Destination.Shelf -> ShelfScreen(
            works = works,
            onOpenWork = { id ->
                val title = works.firstOrNull { it.id == id }?.title ?: ""
                workTitle = title
                viewModel.openWork(id)
                destination = Destination.Contents(id, title)
            },
            onCreateWork = { title ->
                viewModel.createWork(title) { id ->
                    workTitle = title
                    viewModel.openWork(id)
                    destination = Destination.Contents(id, title)
                }
            },
            onDeleteWork = { id ->
                viewModel.deleteWork(id)
                viewModel.closeWork()
            },
            onOpenSettings = {
                viewModel.loadAiSettings()
                destination = Destination.Settings
            },
            onImportManuscript = { manuscriptLauncher.launch(arrayOf("text/plain", "*/*")) }
        )

        is Destination.Contents -> ContentsScreen(
            workTitle = current.title,
            chapters = chapters,
            onBack = {
                viewModel.closeWork()
                destination = Destination.Shelf
            },
            onOpenChapter = { chapterId ->
                viewModel.openChapter(current.workId, chapterId)
                destination = Destination.Editor
                viewModel.loadPlots(current.workId)
            },
            onCreateChapter = { viewModel.createChapter(current.workId) },
            onDeleteChapter = { chapterId -> viewModel.deleteChapter(current.workId, chapterId) },
            onOpenCharacters = {
                viewModel.observeCharacters(current.workId)
                viewModel.observeRelations(current.workId)
                viewModel.loadRelationHistory(current.workId)
                destination = Destination.Characters(current.workId, current.title)
            },
            onOpenWorld = {
                viewModel.loadWorldProfile(current.workId)
                viewModel.loadKnowledgeCards(current.workId)
                destination = Destination.World(current.workId, current.title)
            },
            onOpenPlots = {
                viewModel.loadCollection(current.workId, "plots") { plots = it }
                viewModel.loadCollection(current.workId, "plotChapterLinks") { plotLinks = it }
                destination = Destination.Plots(current.workId, current.title)
            },
            onOpenTimeline = {
                viewModel.loadCollection(current.workId, "timelineEvents") { timelineEvents = it }
                destination = Destination.Timeline(current.workId, current.title)
            },
            onOpenAudit = {
                viewModel.runAudit(current.workId)
                destination = Destination.Audit(current.workId, current.title)
            },
            onOpenSkills = {
                viewModel.loadSkills(current.workId)
                currentWorkIdForSkills = current.workId
                viewModel.loadLibrary(current.workId) { loaded -> libraryBooksState = loaded }
                destination = Destination.Skills(current.workId, current.title)
            },
            onOpenTerms = {
                viewModel.loadKnowledgeCards(current.workId)
                destination = Destination.Terms
            },
            onOpenSceneCards = {
                viewModel.loadSceneCards(current.workId)
                destination = Destination.SceneCards
            },
            onSnapshotChapter = { chapterId ->
                viewModel.takeSnapshot(current.workId, chapterId)
            },
            onOpenHistory = { chapterId ->
                historyChapterId = chapterId
                viewModel.loadHistory(current.workId, chapterId)
                destination = Destination.History
            },
            onOpenReader = {
                viewModel.prepareReader(current.workId)
                destination = Destination.Reader
            },
            onOpenSearch = { destination = Destination.Search },
            onOpenTrash = {
                viewModel.loadChapterTrash(current.workId)
                destination = Destination.ChapterTrash(current.workId, current.title)
            },
            onOpenAnnotations = {
                viewModel.loadAnnotations(current.workId)
                destination = Destination.Annotations
            },
            onExportBook = { markdown ->
                destination = Destination.Contents(current.workId, current.title)
                kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Main).launch {
                    val text = viewModel.bookText(current.workId, markdown)
                    exportPendingText = text
                    exportLauncherState.launch((if (markdown) ".md" else ".txt").let {
                        "StoryWeave-" + current.title + it
                    })
                }
            }
        )

        is Destination.Plots -> PlotBoardScreen(
            plots = plots,
            links = plotLinks,
            chapterTitles = chapters.associate { it.id to it.title },
            onBack = { destination = Destination.Contents(current.workId, current.title) },
            onSavePlots = { list ->
                viewModel.saveCollection(current.workId, "plots", list)
                plots = list
            },
            onSaveLinks = { list ->
                viewModel.saveCollection(current.workId, "plotChapterLinks", list)
                plotLinks = list
            }
        )

        is Destination.Timeline -> TimelineScreen(
            events = timelineEvents,
            chapterTitles = chapters.associate { it.id to it.title },
            onBack = { destination = Destination.Contents(current.workId, current.title) },
            onSave = { list ->
                viewModel.saveCollection(current.workId, "timelineEvents", list)
                timelineEvents = list
            }
        )

        is Destination.Audit -> AuditScreen(
            workTitle = current.title,
            report = auditReport,
            loading = auditLoading,
            aiAvailable = aiSettings.third.isNotBlank(),
            aiBusy = aiBusy,
            aiStatus = aiStatus,
            aiFindings = aiFindings,
            onBack = { destination = Destination.Contents(current.workId, current.title) },
            onRunAiAudit = { viewModel.runAiAudit(context, current.workId) },
            onJumpToFinding = { chapterId, quote, offset ->
                viewModel.requestSelectionJump(chapterId, quote, offset)
                viewModel.openChapter(current.workId, chapterId)
                destination = Destination.Editor
            }
        )

        is Destination.Skills -> SkillsScreen(
            skills = skills,
            onBack = { destination = Destination.Contents(current.workId, current.title) },
            onSaveAll = { list -> viewModel.saveSkills(current.workId, list) },
            onImport = { rows -> viewModel.importSkills(current.workId, rows) },
            onExport = { },
            statusMessage = aiStatus,
            aiBusy = aiBusy,
            onBulk = { ids, action -> viewModel.applySkillsBulk(current.workId, ids, action) }
        )

        Destination.History -> HistoryScreen(
            entries = historyEntries,
            onBack = { destination = Destination.Contents(currentWorkIdForSkills, workTitle) },
            onRestore = { viewModel.restoreSnapshot(currentWorkIdForSkills, historyChapterId, it) }
        )

        Destination.Reader -> {
            val open = editor
            val fromShelf = reader
            ReaderScreen(
                title = open?.title ?: fromShelf?.first ?: "",
                text = open?.text ?: fromShelf?.second ?: "",
                onBack = { destination = Destination.Contents(currentWorkIdForSkills, workTitle) }
            )
        }

        Destination.Search -> SearchScreen(
            query = searchQuery,
            hits = searchHits,
            onBack = { destination = Destination.Contents(currentWorkIdForSkills, workTitle) },
            onQuery = { q -> viewModel.searchAll(currentWorkIdForSkills, q) },
            onOpenChapter = { chapterId ->
                viewModel.openChapter(currentWorkIdForSkills, chapterId)
                destination = Destination.Editor
            }
        )

        Destination.SceneCards -> SceneCardsScreen(
            cards = sceneCards,
            chapterTitle = { chapterId ->
                viewModel.chapters.value.firstOrNull { it.id == chapterId }?.title ?: "未知章节"
            },
            onBack = { destination = Destination.Contents(currentWorkIdForSkills, workTitle) },
            onAdd = { sceneDraft = null; showSceneEditor = true },
            onEdit = { row -> sceneDraft = row; showSceneEditor = true },
            onDelete = { viewModel.deleteSceneCard(currentWorkIdForSkills, it) }
        )

        Destination.Annotations -> AnnotationsScreen(
            annotations = annotations,
            chapterTitle = { chapterId ->
                viewModel.chapters.value.firstOrNull { it.id == chapterId }?.title ?: "未知章节"
            },
            onBack = { destination = Destination.Contents(currentWorkIdForSkills, workTitle) },
            onDelete = { viewModel.deleteAnnotation(currentWorkIdForSkills, it) },
            onJump = { chapterId ->
                viewModel.openChapter(currentWorkIdForSkills, chapterId)
                destination = Destination.Editor
            }
        )



        is Destination.ChapterTrash -> ChapterTrashScreen(
            entries = chapterTrash,
            onBack = { destination = Destination.Contents(current.workId, current.title) },
            onRestore = { viewModel.restoreChapter(current.workId, it) },
            onPurge = { viewModel.purgeChapter(current.workId, it) }
        )

        Destination.Terms -> TermsScreen(
            cards = knowledgeCards,
            newId = { viewModel.newCardId() },
            onBack = { destination = Destination.Contents(currentWorkIdForSkills, workTitle) },
            onSaveAll = { list -> viewModel.saveKnowledgeCards(currentWorkIdForSkills, list) }
        )

        Destination.Settings -> SettingsScreen(
            onBack = { destination = Destination.Shelf },
            onOpenModelConnection = {
                viewModel.loadAiSettings()
                destination = Destination.AiSettings
            },
            onOpenLedger = { destination = Destination.Ledger },
            onOpenImportExport = { destination = Destination.Ledger }
        )

        Destination.Ledger -> MigrationScreen(entries = MigrationLedger.entries)

        Destination.AiHub -> AiHubScreen(
            workTitle = workTitle,
            chapterTitle = editor?.title ?: "",
            chapterText = editor?.text ?: "",
            characters = characters,
            readySkills = skills
                .filter { com.storyweave.app.ui.p4.skillString(it, "status") == "ready" }
                .map { com.storyweave.app.ui.p4.skillString(it, "title") to "" },
            cards = knowledgeCards,
            books = libraryBooks,
            booksOnImport = { bookLauncher.launch(arrayOf("text/plain", "*/*")) },
            booksOnDistill = { bookId -> viewModel.distillBook(context, currentWorkIdForSkills, bookId) },
            findings = aiFindings,
            onJumpToFinding = { chapterId, quote, offset ->
                viewModel.requestSelectionJump(chapterId, quote, offset)
                viewModel.openChapter(currentWorkIdForSkills, chapterId)
                destination = Destination.Editor
            },
            models = aiModels,
            endpoint = aiSettings.first,
            model = aiSettings.third,
            keySaved = aiSettings.second.isNotEmpty(),
            configured = aiSettings.third.isNotBlank(),
            busy = aiBusy,
            status = aiStatus,
            result = aiResult,
            error = aiError,
            onBack = { destination = Destination.Editor },
            onGenerate = { task, instructions, skillTitle ->
                val state = editor
                if (state != null) {
                    viewModel.generate(
                        context, state.workId, state.chapterId, state.text,
                        workTitle, characters, skills, knowledgeCards,
                        task, instructions, skillTitle
                    )
                }
            },
            onAdopt = { draft -> viewModel.adoptDraft(draft) },
            onRunAudit = { viewModel.runAiAudit(context, currentWorkIdForSkills) },
            onRehearse = { aId, bId, prompt ->
                viewModel.rehearse(context, currentWorkIdForSkills, aId, bId, prompt)
            },
            onPullModels = { endpoint, key -> viewModel.pullModels(context, endpoint, key) },
            onTest = { endpoint, key, model -> viewModel.testConnection(context, endpoint, key, model) },
            onSaveSettings = { endpoint, key, model ->
                viewModel.saveAiSettings(endpoint, key, model, key != null)
            }
        )

        Destination.AiSettings -> AiSettingsScreen(
            initialEndpoint = aiSettings.first,
            savedKeyPresent = aiSettings.second.isNotEmpty(),
            initialModel = aiSettings.third,
            status = aiStatus,
            busy = aiBusy,
            models = aiModels,
            onBack = { destination = Destination.Skills(currentWorkIdForSkills, workTitle) },
            onPullModels = { endpoint, key -> viewModel.pullModels(context, endpoint, key) },
            onTest = { endpoint, key, model -> viewModel.testConnection(context, endpoint, key, model) },
            onSave = { endpoint, key, model ->
                viewModel.saveAiSettings(endpoint, key, model, key != null)
            }
        )

        Destination.AiAssist -> AiAssistScreen(
            workTitle = workTitle,
            chapterTitle = editor?.title ?: "",
            chapterText = editor?.text ?: "",
            characters = characters,
            readySkills = skills
                .filter { com.storyweave.app.ui.p4.skillString(it, "status") == "ready" }
                .map { com.storyweave.app.ui.p4.skillString(it, "title") to "" },
            cards = knowledgeCards,
            configured = aiSettings.third.isNotBlank(),
            busy = aiBusy,
            result = aiResult,
            error = aiError,
            onBack = { destination = Destination.Skills(currentWorkIdForSkills, workTitle) },
            onGenerate = { task, instructions, skillTitle ->
                val state = editor
                if (state != null) {
                    viewModel.generate(
                        context, state.workId, state.chapterId, state.text,
                        workTitle, characters, skills, knowledgeCards,
                        task, instructions, skillTitle
                    )
                }
            },
            onAdopt = { draft -> viewModel.adoptDraft(draft) }
        )

        is Destination.World -> WorldScreen(
            initial = worldProfile,
            cards = knowledgeCards,
            newCardId = { viewModel.newCardId() },
            onBack = { destination = Destination.Contents(current.workId, current.title) },
            onSave = { profile -> viewModel.saveWorldProfile(current.workId, profile) },
            onSaveCards = { list -> viewModel.saveKnowledgeCards(current.workId, list) }
        )

        is Destination.Characters -> CharactersScreen(
            characters = characters,
            relations = relations,
            relationHistory = relationHistory,
            chapters = chapters,
            onBack = { destination = Destination.Contents(current.workId, current.title) },
            onSave = { entity -> viewModel.saveCharacter(current.workId, entity) },
            onDelete = { entity -> viewModel.deleteCharacterCascade(current.workId, entity.id) },
            onSaveRelation = { entity -> viewModel.saveRelation(current.workId, entity) },
            onDeleteRelation = { entity -> viewModel.deleteRelation(current.workId, entity.id) },
            onRecordChange = { relation, chapterId, type, trust, cause ->
                viewModel.recordRelationChange(current.workId, relation, chapterId, type, trust, cause)
            }
        )

        Destination.Editor -> {
            val state = editor
            if (state == null) {
                // Chapter closed or deleted underneath us: fall back to the contents.
                destination = Destination.Contents(workId = "", title = workTitle)
            } else {
                EditorScreen(
                    state = state,
                    saveState = saveState,
                    onTextChanged = { text ->
                        val prevLen = editor?.text?.length ?: 0
                        viewModel.onTextChanged(text)
                        val workId = currentWorkIdForSkills
                        if (text.length > prevLen && workId.isNotBlank()) {
                            viewModel.bumpToday(workId, text.length - prevLen)
                        }
                    },
                    onTitleChanged = viewModel::onTitleChanged,
                    onBack = {
                        viewModel.flush()
                        destination = Destination.Contents(state.workId, workTitle)
                    },
                    onFlush = viewModel::flush,
                    todayCount = todayCount,
                    dailyGoal = dailyGoal,
                    onSetGoal = { raw -> viewModel.setDailyGoal(currentWorkIdForSkills, raw) },
                    onOpenAiHub = {
                        viewModel.loadAiSettings()
                        viewModel.loadLibrary(currentWorkIdForSkills) { loaded -> libraryBooksState = loaded }
                        destination = Destination.AiHub
                    },
                    onExportChapter = {
                        val state = editor ?: return@EditorScreen
                        chapterExportText = state.title + "\n\n" + state.text
                        chapterExportLauncher.launch("StoryWeave-" + state.title + ".txt")
                    },
                    onAddAnnotation = { start, end, text, note ->
                        val state = editor ?: return@EditorScreen
                        viewModel.addAnnotation(state.workId, state.chapterId, start, end, text, note)
                    },
                    onPrevChapter = {
                        val state = editor ?: return@EditorScreen
                        val chapters = viewModel.chapters.value
                        val pos = chapters.indexOfFirst { it.id == state.chapterId }
                        if (pos > 0) viewModel.openChapter(state.workId, chapters[pos - 1].id)
                    },
                    onNextChapter = {
                        val state = editor ?: return@EditorScreen
                        val chapters = viewModel.chapters.value
                        val pos = chapters.indexOfFirst { it.id == state.chapterId }
                        if (pos >= 0 && pos + 1 < chapters.size) {
                            viewModel.openChapter(state.workId, chapters[pos + 1].id)
                        }
                    },
                    contextPeople = com.storyweave.app.domain.WritingContext.mentionedCharacters(
                        editor?.text ?: "",
                        characters.map { com.storyweave.app.data.json.PeopleJson.encodeCharacter(it) }
                    ),
                    contextPlots = com.storyweave.app.domain.WritingContext.relevantPlots(
                        editor?.chapterId ?: "", editor?.text ?: "", plotsRaw
                    ),
                    chapterAnnotations = annotations.filter {
                        (it["chapterId"] as? kotlinx.serialization.json.JsonPrimitive)?.content ==
                            (editor?.chapterId ?: "")
                    },
                    pendingSelection = pendingSelection?.takeIf {
                        it.first == (editor?.chapterId ?: "")
                    }
                )
                if (pendingSelection != null) {
                    viewModel.consumeSelectionJump()
                }
            } // Editor branch block
        } // when
    }
        if (showSceneEditor) {
            val draft = sceneDraft
            AlertDialog(
                onDismissRequest = { showSceneEditor = false },
                title = { Text(if (draft == null) "新增场景卡" else "编辑场景卡") },
                text = {
                    Column {
                        OutlinedTextField(
                            value = sceneTitle, onValueChange = { sceneTitle = it },
                            label = { Text("场景标题") }, singleLine = true
                        )
                        OutlinedTextField(
                            value = sceneViewpoint, onValueChange = { sceneViewpoint = it },
                            label = { Text("视角人物") }, singleLine = true
                        )
                        OutlinedTextField(
                            value = sceneStatus, onValueChange = { sceneStatus = it },
                            label = { Text("状态（规划/进行/完成）") }, singleLine = true
                        )
                        OutlinedTextField(
                            value = scenePurpose, onValueChange = { scenePurpose = it },
                            label = { Text("本章目的") }
                        )
                        OutlinedTextField(
                            value = sceneNotes, onValueChange = { sceneNotes = it },
                            label = { Text("重要动作、障碍与伏笔") }
                        )
                    }
                },
                confirmButton = {
                    TextButton(onClick = {
                        if (sceneTitle.isNotBlank()) {
                            viewModel.saveSceneCard(
                                currentWorkIdForSkills,
                                viewModel.chapters.value.firstOrNull()?.id ?: "",
                                draft, sceneTitle.trim(), sceneViewpoint.trim(),
                                sceneStatus.trim(), scenePurpose.trim(), sceneNotes.trim()
                            )
                        }
                        showSceneEditor = false
                    }) { Text("保存") }
                },
                dismissButton = { TextButton(onClick = { showSceneEditor = false }) { Text("取消") } }
            )
        }
    }