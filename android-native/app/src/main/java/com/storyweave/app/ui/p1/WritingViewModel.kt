package com.storyweave.app.ui.p1

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.storyweave.app.data.Graph
import com.storyweave.app.data.db.ChapterSummary
import com.storyweave.app.data.db.CharacterEntity
import com.storyweave.app.data.db.KnowledgeCard
import com.storyweave.app.data.db.RelationEvent
import com.storyweave.app.domain.AuditReport
import com.storyweave.app.domain.ContinuityAudit
import com.storyweave.app.domain.PlotLink
import com.storyweave.app.domain.PlotRef
import com.storyweave.app.domain.RelationRef
import com.storyweave.app.domain.TimelineRef
import com.storyweave.app.data.json.JsonLossless
import com.storyweave.app.data.json.PeopleJson
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import com.storyweave.app.data.ai.AiClient
import com.storyweave.app.data.ai.AiRules
import com.storyweave.app.data.ai.ModelEntry
import com.storyweave.app.domain.DailyProgress
import android.content.Context
import com.storyweave.app.data.db.RelationEntity
import com.storyweave.app.data.db.StoryRepository
import com.storyweave.app.data.db.WorkSummary
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * P1 state holder for the writing loop: shelf → contents → editor.
 *
 * Save semantics mirror the Web build deliberately:
 *  - typing schedules a debounced write (270 ms there, same value here);
 *  - leaving the editor or backgrounding the app flushes immediately;
 *  - the editor never blocks on I/O, it only observes `saveState`.
 */
class WritingViewModel(application: Application) : AndroidViewModel(application) {

    private val repository: StoryRepository = Graph.repository(application)

    private val _works = MutableStateFlow<List<WorkSummary>>(emptyList())
    val works: StateFlow<List<WorkSummary>> = _works.asStateFlow()

    private val _chapters = MutableStateFlow<List<ChapterSummary>>(emptyList())
    val chapters: StateFlow<List<ChapterSummary>> = _chapters.asStateFlow()

    private val _current = MutableStateFlow<EditorState?>(null)
    val current: StateFlow<EditorState?> = _current.asStateFlow()

    private val _characters = MutableStateFlow<List<CharacterEntity>>(emptyList())
    val characters: StateFlow<List<CharacterEntity>> = _characters.asStateFlow()

    private val _relations = MutableStateFlow<List<RelationEntity>>(emptyList())
    val relations: StateFlow<List<RelationEntity>> = _relations.asStateFlow()

    private val _saveState = MutableStateFlow(SaveState.SAVED)
    val saveState: StateFlow<SaveState> = _saveState.asStateFlow()

    private var pendingText: String? = null
    private var pendingWorkId: String? = null
    private var pendingChapterId: String? = null
    private var scheduled: Job? = null
    private var observeJob: Job? = null
    private var peopleJob: Job? = null
    private var relationJob: Job? = null

    init {
        viewModelScope.launch {
            repository.observeWorks()
                .catch { _works.value = emptyList() }
                .collect { _works.value = it }
        }
    }

    fun openWork(workId: String) {
        observeJob?.cancel()
        observeJob = viewModelScope.launch {
            repository.observeChapters(workId)
                .catch { _chapters.value = emptyList() }
                .collect { _chapters.value = it }
        }
    }

    fun closeWork() {
        observeJob?.cancel()
        observeJob = null
        peopleJob?.cancel()
        peopleJob = null
        relationJob?.cancel()
        relationJob = null
        _chapters.value = emptyList()
        _characters.value = emptyList()
        _relations.value = emptyList()
    }

    fun observeCharacters(workId: String) {
        peopleJob?.cancel()
        peopleJob = viewModelScope.launch {
            repository.observeCharacters(workId)
                .catch { _characters.value = emptyList() }
                .collect { _characters.value = it }
        }
    }

    fun observeRelations(workId: String) {
        relationJob?.cancel()
        relationJob = viewModelScope.launch {
            repository.observeRelations(workId)
                .catch { _relations.value = emptyList() }
                .collect { _relations.value = it }
        }
    }

    private val _worldProfile = MutableStateFlow<Map<String, String>>(emptyMap())
    val worldProfile: StateFlow<Map<String, String>> = _worldProfile.asStateFlow()

    fun loadWorldProfile(workId: String) {
        viewModelScope.launch { _worldProfile.value = repository.loadWorldProfile(workId) }
    }

    private val _knowledgeCards = MutableStateFlow<List<KnowledgeCard>>(emptyList())
    val knowledgeCards: StateFlow<List<KnowledgeCard>> = _knowledgeCards.asStateFlow()

    fun loadKnowledgeCards(workId: String) {
        viewModelScope.launch { _knowledgeCards.value = repository.loadKnowledgeCards(workId) }
    }

    fun saveKnowledgeCards(workId: String, cards: List<KnowledgeCard>) {
        viewModelScope.launch {
            repository.saveKnowledgeCards(workId, cards)
            _knowledgeCards.value = repository.loadKnowledgeCards(workId)
        }
    }

    fun newCardId(): String = repository.newCardId()

    // ---- P4: skills & cloud AI -----------------------------------------

    private val _skills = MutableStateFlow<List<JsonObject>>(emptyList())
    val skills: StateFlow<List<JsonObject>> = _skills.asStateFlow()

    fun loadSkills(workId: String) {
        viewModelScope.launch {
            // Skills are a shared top-level collection in the Web build, but the
            // native P4 scopes them to the work to keep deletion predictable.
            _skills.value = repository.loadCollection("skills")
                .filter { JsonLossless.string(it["projectId"]) == workId }
        }
    }

    fun saveSkills(workId: String, rows: List<JsonObject>) {
        viewModelScope.launch {
            val others = repository.loadCollection("skills")
                .filter { JsonLossless.string(it["projectId"]) != workId }
            repository.saveCollection("skills", others + rows)
            _skills.value = repository.loadCollection("skills")
                .filter { JsonLossless.string(it["projectId"]) == workId }
        }
    }

    fun importSkills(workId: String, incoming: List<JsonObject>) {
        fun str(row: JsonObject, key: String): String = JsonLossless.string(row[key]).orEmpty()
        viewModelScope.launch {
            // Keep local rows; append imported ones with fresh ids on conflict.
            val existing = repository.loadCollection("skills")
            val existingIds = existing.mapNotNull { JsonLossless.string(it["id"]) }.toSet()
            val tagged = incoming.map { row ->
                buildJsonObject {
                    for ((key, value) in row) put(key, value)
                    if (str(row, "projectId").isNotEmpty() && str(row, "projectId") != workId) put("projectId", workId)
                    else if (str(row, "projectId").isEmpty()) put("projectId", workId)
                    if (str(row, "id").isEmpty() || str(row, "id") in existingIds
                    ) put("id", repository.newCardId())
                }
            }
            repository.saveCollection("skills", existing + tagged)
            _skills.value = repository.loadCollection("skills")
                .filter { JsonLossless.string(it["projectId"]) == workId }
        }
    }

    // ---- P6 四: 参考书库与蒸馏 -----------------------------------------

    fun importBook(workId: String, title: String, type: String, text: String) {
        viewModelScope.launch {
            val row = buildJsonObject {
                put("id", JsonLossless.primitive(repository.newCardId()))
                put("projectId", JsonLossless.primitive(workId))
                put("title", JsonLossless.primitive(title))
                put("type", JsonLossless.primitive(type))
                put("text", JsonLossless.primitive(text))
                put("created", JsonLossless.primitive(repository.nowIso()))
            }
            val others = repository.loadCollection("library")
                .filter { JsonLossless.string(it["projectId"]) != workId }
            repository.saveCollection("library", others + row)
        }
    }

    /** 导入小说：TXT 按「第X章」拆章，成功后回调新作品 id。 */
    fun importManuscript(title: String, raw: String, onDone: (String) -> Unit) {
        viewModelScope.launch {
            val id = repository.importManuscript(title, raw)
            onDone(id)
        }
    }

    fun loadLibrary(workId: String, onLoaded: (List<JsonObject>) -> Unit) {
        viewModelScope.launch {
            onLoaded(
                repository.loadCollection("library")
                    .filter { JsonLossless.string(it["projectId"]) == workId }
            )
        }
    }

    /**
     * 云端 AI 蒸馏：平衡抽样（开头/中段/后段）→ 模型 → 候选技能（待审核）。
     * 结果逐条存入 skills 集合，状态 candidate，等作者审核。
     */
    fun distillBook(context: Context, workId: String, bookId: String) {
        viewModelScope.launch {
            _aiBusy.value = true
            _aiStatus.value = "蒸馏中：正在抽样发送…"
            try {
                val books = repository.loadCollection("library")
                val book = books.firstOrNull {
                    JsonLossless.string(it["id"]) == bookId &&
                        JsonLossless.string(it["projectId"]) == workId
                } ?: throw IllegalStateException("参考书不存在")
                val document = repository.load()
                val settings = (document.extras["settings"] as? JsonObject) ?: JsonObject(emptyMap())
                val endpoint = JsonLossless.string(settings["endpoint"]) ?: "https://api.openai.com/v1"
                val model = JsonLossless.string(settings["model"]) ?: ""
                if (model.isBlank()) throw IllegalStateException("请先在设置里选择模型 ID")
                val base = AiRules.baseAddress(endpoint)
                val key = savedKeyFor(base, context)
                val title = JsonLossless.string(book["title"]) ?: ""
                val text = JsonLossless.string(book["text"]) ?: ""
                val sample = com.storyweave.app.domain.Distill.balancedSamples(text, 14000)
                val system = "你是文学技法分析师。仅总结抽象的可复用写作技巧，不复制原句，不复刻独特表达。" +
                    "必须返回纯 JSON：{\"skills\":[{\"title\":\"...\",\"category\":\"...\",\"description\":\"...\",\"rules\":[\"...\"],\"evidence\":\"...\"}]}，最多5条。"
                val reply = aiClient(context).chat(
                    base, key, model, system,
                    "参考书名：" + title + "\n平衡抽样内容（开头、中段、后段）：\n" + sample + "\n\n请依据可观察的文本具体表现提取技能，避免套话。",
                    2300, "distillation"
                )
                val candidates = com.storyweave.app.domain.Distill.parseSkills(reply)
                val existing = repository.loadCollection("skills")
                    .filter { JsonLossless.string(it["projectId"]) != workId }
                val rows = candidates.map { candidate ->
                    buildJsonObject {
                        put("id", JsonLossless.primitive(repository.newCardId()))
                        put("projectId", JsonLossless.primitive(workId))
                        put("title", JsonLossless.primitive(candidate.title))
                        put("category", JsonLossless.primitive(candidate.category))
                        put("description", JsonLossless.primitive(candidate.description))
                        put("rules", kotlinx.serialization.json.JsonArray(
                            candidate.rules.map { JsonLossless.primitive(it) }
                        ))
                        put("source", JsonLossless.primitive(title))
                        put("evidence", JsonLossless.primitive(candidate.evidence))
                        put("status", JsonLossless.primitive("candidate"))
                        put("created", JsonLossless.primitive(repository.nowIso()))
                    }
                }
                repository.saveCollection("skills", existing + rows)
                _skills.value = repository.loadCollection("skills")
                    .filter { JsonLossless.string(it["projectId"]) == workId }
                _aiStatus.value = "蒸馏完成：${rows.size} 条候选技能已保存，请逐项审核"
            } catch (error: Throwable) {
                _aiStatus.value = "蒸馏失败：" + (error.message ?: error::class.java.simpleName)
            } finally {
                _aiBusy.value = false
            }
        }
    }

    /** 批量操作：审核通过或删除选中的技能。 */
    fun applySkillsBulk(workId: String, ids: Set<String>, action: String) {
        viewModelScope.launch {
            val current = repository.loadCollection("skills")
            val untouched = current.filterNot {
                JsonLossless.string(it["projectId"]) == workId &&
                    JsonLossless.string(it["id"]) in ids
            }
            val kept = when (action) {
                "approve" -> current.filter {
                    JsonLossless.string(it["projectId"]) == workId &&
                        JsonLossless.string(it["id"]) in ids
                }.map { row ->
                    buildJsonObject {
                        for ((key, value) in row) put(key, value)
                        put("status", JsonLossless.primitive("ready"))
                    }
                }
                else -> emptyList()
            }
            repository.saveCollection("skills", untouched + kept)
            _skills.value = repository.loadCollection("skills")
                .filter { JsonLossless.string(it["projectId"]) == workId }
        }
    }

    private val _aiStatus = MutableStateFlow("")
    val aiStatus: StateFlow<String> = _aiStatus.asStateFlow()

    private val _aiBusy = MutableStateFlow(false)
    val aiBusy: StateFlow<Boolean> = _aiBusy.asStateFlow()

    private val _aiResult = MutableStateFlow<String?>(null)
    val aiResult: StateFlow<String?> = _aiResult.asStateFlow()

    private val _aiError = MutableStateFlow<String?>(null)
    val aiError: StateFlow<String?> = _aiError.asStateFlow()

    private val _aiModels = MutableStateFlow<List<ModelEntry>>(emptyList())
    val aiModels: StateFlow<List<ModelEntry>> = _aiModels.asStateFlow()

    private val _aiSettings = MutableStateFlow(Triple("https://api.openai.com/v1", "", ""))
    val aiSettings: StateFlow<Triple<String, String, String>> = _aiSettings.asStateFlow()

    private var aiContextKey: String? = null

    fun aiClient(context: Context): AiClient = AiClient(context)

    /** Endpoint/model live in `document.settings`; the key never does. */
    fun loadAiSettings() {
        viewModelScope.launch {
            val document = repository.load()
            _aiSettings.value = Triple(
                (document.extras["settings"] as? JsonObject)?.let { JsonLossless.string(it["endpoint"]) } ?: "https://api.openai.com/v1",
                "",
                (document.extras["settings"] as? JsonObject)?.let { JsonLossless.string(it["model"]) } ?: ""
            )
        }
    }

    fun saveAiSettings(endpoint: String, key: String?, model: String, keySaved: Boolean) {
        viewModelScope.launch {
            val document = repository.load()
            val settings = (document.extras["settings"] as? JsonObject) ?: JsonObject(emptyMap())
            val next = LinkedHashMap<String, kotlinx.serialization.json.JsonElement>()
            for ((key2, value) in settings) next[key2] = value
            next["endpoint"] = JsonLossless.primitive(endpoint)
            next["model"] = JsonLossless.primitive(model)
            val patched = document.copy(
                extras = JsonObject(document.extras + ("settings" to JsonObject(next)))
            )
            repository.save(patched)
            _aiSettings.value = Triple(endpoint, "", model)
            _aiStatus.value = if (keySaved) "云端配置已保存（密钥存于系统密钥库）" else "云端配置已保存"
        }
    }

    fun pullModels(context: Context, endpoint: String, keyInput: String) {
        viewModelScope.launch {
            _aiBusy.value = true
            _aiStatus.value = ""
            try {
                val base = AiRules.baseAddress(endpoint)
                val key = keyInput.takeIf { it.isNotEmpty() }?.let { AiRules.validatedKey(it) } ?: savedKeyFor(base, context)
                _aiModels.value = aiClient(context).listModels(base, key)
                _aiStatus.value = "拉取到 ${_aiModels.value.size} 个模型"
            } catch (error: Throwable) {
                _aiStatus.value = "拉取失败：" + (error.message ?: error::class.java.simpleName)
            } finally {
                _aiBusy.value = false
            }
        }
    }

    fun testConnection(context: Context, endpoint: String, keyInput: String, model: String) {
        viewModelScope.launch {
            _aiBusy.value = true
            _aiStatus.value = ""
            try {
                val base = AiRules.baseAddress(endpoint)
                val key = keyInput.takeIf { it.isNotEmpty() }?.let { AiRules.validatedKey(it) } ?: savedKeyFor(base, context)
                val reply = aiClient(context).chat(base, key, model, "You are a test.", "回复一个字：好", 16, "probe")
                _aiStatus.value = if (reply.isNotBlank()) "连接成功，模型已响应" else "连接成功但没有正文"
            } catch (error: Throwable) {
                _aiStatus.value = "测试失败：" + (error.message ?: error::class.java.simpleName)
            } finally {
                _aiBusy.value = false
            }
        }
    }

    private fun savedKeyFor(base: String, context: Context): String = aiClient(context).savedKey(base)

    fun generate(
        context: Context,
        workId: String,
        chapterId: String,
        chapterText: String,
        workTitle: String,
        characters: List<CharacterEntity>,
        skills: List<JsonObject>,
        cards: List<KnowledgeCard>,
        task: String,
        instructions: String,
        skillTitle: String?
    ) {
        viewModelScope.launch {
            _aiBusy.value = true
            _aiError.value = null
            _aiResult.value = null
            try {
                val document = repository.load()
                val settings = (document.extras["settings"] as? JsonObject) ?: JsonObject(emptyMap())
                val endpoint = JsonLossless.string(settings["endpoint"]) ?: "https://api.openai.com/v1"
                val model = JsonLossless.string(settings["model"]) ?: ""
                val base = AiRules.baseAddress(endpoint)
                val key = savedKeyFor(base, context)
                if (model.isBlank()) throw IllegalStateException("请先在设置里选择模型 ID")
                val readySkills = skills.filter { JsonLossless.string(it["status"]) == "ready" }
                val chosen = readySkills.filter { skillTitle == null || JsonLossless.string(it["title"]) == skillTitle }
                val system = "你是专业中文小说写作协作者，尊重作者设定，避免解释性空话；仅输出原创内容，不仿写具体作品原文。"
                val contextParts = buildList {
                    add("作品：$workTitle")
                    characters.firstOrNull()?.let { add("人物设定：${it.name}：${it.role}") }
                    if (chosen.isNotEmpty()) {
                        add("写作技能：" + chosen.joinToString("；") { skill ->
                            JsonLossless.string(skill["title"]) + "：" + JsonLossless.string(skill["description"])
                        })
                    }
                    if (chapterText.isNotBlank()) add("当前章节末尾：\n" + chapterText.takeLast(3000))
                    if (instructions.isNotBlank()) add("额外要求：$instructions")
                }
                val taskText = when (task) {
                    "polish" -> "请针对当前章节提出具体润色版本，保留原故事事实。"
                    "review" -> "请指出可定位的逻辑和人设问题，提供修改建议，不必重写整个章节。"
                    "outline" -> "请提供 3 条不同的后续剧情发展方向，说明人物动机。"
                    else -> "请基于当前情节续写 300-500 字原创小说正文。"
                }
                val reply = aiClient(context).chat(
                    base, key, model, system,
                    contextParts.joinToString("\n") + "\n任务：" + taskText,
                    1200, "writing"
                )
                _aiResult.value = reply
            } catch (error: Throwable) {
                _aiError.value = error.message ?: error::class.java.simpleName
            } finally {
                _aiBusy.value = false
            }
        }
    }

    /** Adoption is explicit: the draft is appended via the normal save path. */
    fun adoptDraft(text: String) {
        val editor = _current.value ?: return
        val appended = editor.text.trimEnd() + "\n\n" + text.trim()
        onTextChanged(appended)
        _aiResult.value = null
    }

    /**
     * AI 推演：选两个角色 + 要求，生成 500 字内候选场景（Web 版 openScene 语义）。
     * 人物只能基于自己知道的信息行动；候选只展示，绝不写正文、不改档案。
     */
    fun rehearse(
        context: Context,
        workId: String,
        charAId: String,
        charBId: String,
        prompt: String
    ) {
        viewModelScope.launch {
            _aiBusy.value = true
            _aiError.value = null
            _aiResult.value = null
            try {
                val characters = repository.observeCharacters(workId).first()
                val a = characters.firstOrNull { it.id == charAId }
                    ?: throw IllegalStateException("请先选择角色甲")
                val b = characters.firstOrNull { it.id == charBId }
                    ?: throw IllegalStateException("请先选择角色乙")
                val document = repository.load()
                val work = document.projects.firstOrNull { it.id == workId }
                val settings = (document.extras["settings"] as? JsonObject) ?: JsonObject(emptyMap())
                val endpoint = JsonLossless.string(settings["endpoint"]) ?: "https://api.openai.com/v1"
                val model = JsonLossless.string(settings["model"]) ?: ""
                if (model.isBlank()) throw IllegalStateException("请先在「设置」页选择模型 ID")
                val base = AiRules.baseAddress(endpoint)
                val key = savedKeyFor(base, context)
                fun personJson(c: com.storyweave.app.data.db.CharacterEntity) =
                    buildJsonObject {
                        put("name", JsonLossless.primitive(c.name))
                        put("identity", JsonLossless.primitive(c.role))
                        put("personality", JsonLossless.primitive(c.personality))
                        put("goal", JsonLossless.primitive(c.goal))
                        put("knowledge", JsonLossless.primitive(c.knowledge))
                        put("secret", JsonLossless.primitive(c.secret))
                    }.toString()
                val system = "你是小说场景推演导演。遵守角色信息边界和性格动机，只输出候选场景，不改变正式设定。内容需自然具体，避免抽象说教。"
                val user = "世界背景：${work?.summary.orEmpty()}\n" +
                    "角色甲：${personJson(a)}\n角色乙：${personJson(b)}\n" +
                    "要求：$prompt\n请写一个500字以内的原创场景，人物只能基于自己知道的信息行动，最后列出每人的认知变化（作为候选）。"
                val reply = aiClient(context).chat(base, key, model, system, user, 1900, "writing")
                _aiResult.value = reply
            } catch (error: Throwable) {
                _aiError.value = error.message ?: error::class.java.simpleName
            } finally {
                _aiBusy.value = false
            }
        }
    }

    // ---- P5: atlas ------------------------------------------------------

    private val _worldMaps = MutableStateFlow<List<JsonObject>>(emptyList())
    val worldMaps: StateFlow<List<JsonObject>> = _worldMaps.asStateFlow()

    private val _worldPlaces = MutableStateFlow<List<JsonObject>>(emptyList())
    val worldPlaces: StateFlow<List<JsonObject>> = _worldPlaces.asStateFlow()

    fun loadAtlas(workId: String) {
        viewModelScope.launch {
            _worldMaps.value = repository.loadCollection("worldMaps")
                .filter { JsonLossless.string(it["projectId"]) == workId }
            _worldPlaces.value = repository.loadCollection("worldPlaces")
                .filter { JsonLossless.string(it["projectId"]) == workId }
        }
    }

    fun savePlaces(workId: String, rows: List<JsonObject>) {
        viewModelScope.launch {
            val others = repository.loadCollection("worldPlaces")
                .filter { JsonLossless.string(it["projectId"]) != workId }
            repository.saveCollection("worldPlaces", others + rows)
            _worldPlaces.value = repository.loadCollection("worldPlaces")
                .filter { JsonLossless.string(it["projectId"]) == workId }
        }
    }

    // ---- P3: continuity audit ------------------------------------------

    private val _auditReport = MutableStateFlow<AuditReport?>(null)
    val auditReport: StateFlow<AuditReport?> = _auditReport.asStateFlow()

    /** Runs the rule audit over the current work's data. */
    fun runAudit(workId: String) {
        viewModelScope.launch {
            val document = repository.load()
            val work = document.projects.firstOrNull { it.id == workId } ?: return@launch
            val chapters = work.chapters
            val chapterOrder = chapters.map { it.id }
            val chapterTitles = chapters.associate { it.id to it.title }
            val workOf: (JsonObject) -> Boolean = { obj ->
                JsonLossless.string(obj["projectId"]) == workId
            }
            val plots = (document.collections["plots"] ?: JsonArray(emptyList()))
                .mapNotNull { it as? JsonObject }
                .filter { workOf(it) }
                .mapNotNull { obj ->
                    val id = JsonLossless.string(obj["id"]) ?: return@mapNotNull null
                    PlotRef(id, JsonLossless.string(obj["title"]) ?: "")
                }
            val links = (document.collections["plotChapterLinks"] ?: JsonArray(emptyList()))
                .mapNotNull { it as? JsonObject }
                .filter { workOf(it) }
                .mapNotNull { obj ->
                    val id = JsonLossless.string(obj["id"]) ?: return@mapNotNull null
                    PlotLink(
                        id = id,
                        plotId = JsonLossless.string(obj["plotId"]) ?: "",
                        chapterId = JsonLossless.string(obj["chapterId"]) ?: "",
                        stage = JsonLossless.string(obj["stage"]) ?: "",
                        allowNonlinear = JsonLossless.bool(obj["allowNonlinear"])
                    )
                }
            val relations = document.collections["relations"] ?: JsonArray(emptyList())
            val relationEntities = PeopleJson.decodeRelations(relations).filter { it.projectId == workId }
            val relationRefs = relationEntities.map { RelationRef(it.id, it.type) }
            val history = (document.collections["relationshipHistory"] ?: JsonArray(emptyList()))
                .mapNotNull { it as? JsonObject }
                .filter { workOf(it) }
                .mapNotNull { obj ->
                    val id = JsonLossless.string(obj["id"]) ?: return@mapNotNull null
                    com.storyweave.app.data.db.RelationEvent(
                        id = id,
                        relationId = JsonLossless.string(obj["relationId"]) ?: "",
                        chapterId = JsonLossless.string(obj["chapterId"]) ?: "",
                        beforeType = JsonLossless.string(obj["beforeType"]) ?: "",
                        beforeTrust = JsonLossless.int(obj["beforeTrust"]),
                        afterType = JsonLossless.string(obj["afterType"]) ?: "",
                        afterTrust = JsonLossless.int(obj["afterTrust"]),
                        cause = JsonLossless.string(obj["cause"]) ?: "",
                        created = JsonLossless.string(obj["created"]) ?: ""
                    )
                }
            val timeline = (document.collections["timelineEvents"] ?: JsonArray(emptyList()))
                .mapNotNull { it as? JsonObject }
                .filter { workOf(it) }
                .mapNotNull { obj ->
                    val id = JsonLossless.string(obj["id"]) ?: return@mapNotNull null
                    TimelineRef(
                        id = id,
                        title = JsonLossless.string(obj["title"]) ?: "",
                        chapterId = JsonLossless.string(obj["chapterId"]) ?: "",
                        storyDate = JsonLossless.string(obj["storyDate"]) ?: "",
                        isFlashback = JsonLossless.bool(obj["isFlashback"])
                    )
                }
            _auditReport.value = ContinuityAudit.audit(
                chapterOrder, chapterTitles, plots, links, relationRefs, history, timeline
            )
        }
    }

    private val _aiFindings = MutableStateFlow<List<com.storyweave.app.domain.AiAudit.Finding>>(emptyList())
    val aiFindings: StateFlow<List<com.storyweave.app.domain.AiAudit.Finding>> = _aiFindings.asStateFlow()

    /**
     * AI 深查：把选中章节与资料发给模型，逐字证据校验后只保留有效发现。
     * 生成结果存入 `auditFindings` 集合（Web 兼容），作者确认制。
     */
    fun runAiAudit(context: Context, workId: String) {
        viewModelScope.launch {
            _aiBusy.value = true
            _aiStatus.value = "AI 深查中…"
            try {
                val document = repository.load()
                val work = document.projects.firstOrNull { it.id == workId } ?: return@launch
                val chapters = work.chapters.take(5)
                val selectedIds = chapters.map { it.id }
                val settings = (document.extras["settings"] as? JsonObject) ?: JsonObject(emptyMap())
                val endpoint = JsonLossless.string(settings["endpoint"]) ?: "https://api.openai.com/v1"
                val model = JsonLossless.string(settings["model"]) ?: ""
                if (model.isBlank()) throw IllegalStateException("请先在设置里选择模型 ID")
                val base = AiRules.baseAddress(endpoint)
                val key = savedKeyFor(base, context)
                val characters = PeopleJson.decodeCharacters(document.collections["characters"] ?: JsonArray(emptyList()))
                    .filter { it.projectId == workId }
                    .map { Triple(it.id, it.name, it.role) }
                val plots = (document.collections["plots"] ?: JsonArray(emptyList()))
                    .mapNotNull { it as? JsonObject }
                    .filter { JsonLossless.string(it["projectId"]) == workId }
                val timeline = (document.collections["timelineEvents"] ?: JsonArray(emptyList()))
                    .mapNotNull { it as? JsonObject }
                    .filter { JsonLossless.string(it["projectId"]) == workId }
                val history = (document.collections["relationshipHistory"] ?: JsonArray(emptyList()))
                    .mapNotNull { it as? JsonObject }
                    .filter { JsonLossless.string(it["projectId"]) == workId }
                val payload = com.storyweave.app.domain.AiAudit.buildPayload(
                    workTitle = work.title, genre = work.genre, summary = work.summary,
                    chapters = chapters.map { com.storyweave.app.domain.AiAudit.ChapterRef(it.id, it.title, it.text) },
                    characters = characters,
                    plotThreads = plots.map { row ->
                        Triple(
                            JsonLossless.string(row["id"]).orEmpty(),
                            JsonLossless.string(row["title"]).orEmpty(),
                            JsonLossless.string(row["type"]).orEmpty()
                        )
                    },
                    timeline = timeline.map { row ->
                        com.storyweave.app.domain.AiAudit.Quadruple(
                            JsonLossless.string(row["title"]).orEmpty(),
                            JsonLossless.string(row["storyDate"]).orEmpty(),
                            JsonLossless.string(row["chapterId"]).orEmpty(),
                            JsonLossless.bool(row["isFlashback"])
                        )
                    },
                    relationshipChanges = history.map { row ->
                        com.storyweave.app.domain.AiAudit.Quadruple(
                            JsonLossless.string(row["chapterId"]).orEmpty(),
                            JsonLossless.string(row["afterType"]).orEmpty(),
                            JsonLossless.string(row["afterTrust"]).orEmpty(),
                            JsonLossless.string(row["cause"]).orEmpty()
                        )
                    }
                )
                val system = "你是中文小说连续性审查助手。只输出 JSON：{\"findings\":[{chapterId,severity(critical|warning|notice|info),title,detail,suggestion,quote}]}。" +
                    "quote 必须逐字摘自对应章节正文（8-120 字），用于定位；不确定的不要编造。最多 15 条。"
                val reply = aiClient(context).chat(
                    base, key, model, system,
                    payload.toString(), 3000, "audit"
                )
                val parsed = com.storyweave.app.domain.AiAudit.parseFindings(reply, chapters.map {
                    com.storyweave.app.domain.AiAudit.ChapterRef(it.id, it.title, it.text)
                }, selectedIds)
                // 存档到 auditFindings 集合（原样 JSON 行，Web 兼容）。
                val rows = parsed.valid.map { finding ->
                    buildJsonObject {
                        put("id", JsonLossless.primitive(finding.id))
                        put("projectId", JsonLossless.primitive(workId))
                        put("chapterId", JsonLossless.primitive(finding.chapterId))
                        put("severity", JsonLossless.primitive(finding.severity))
                        put("title", JsonLossless.primitive(finding.title))
                        put("detail", JsonLossless.primitive(finding.detail))
                        put("suggestion", JsonLossless.primitive(finding.suggestion))
                        put("quote", JsonLossless.primitive(finding.quote))
                        put("offset", JsonLossless.primitive(finding.offset))
                        put("status", JsonLossless.primitive("pending"))
                        put("created", JsonLossless.primitive(finding.created))
                        put("source", JsonLossless.primitive("ai"))
                    }
                }
                val others = repository.loadCollection("auditFindings")
                    .filter { JsonLossless.string(it["projectId"]) != workId }
                repository.saveCollection("auditFindings", others + rows)
                _aiFindings.value = parsed.valid
                _aiStatus.value = "AI 深查完成：${parsed.valid.size} 条有效，${parsed.rejectedCount} 条因证据不足被拒"
            } catch (error: Throwable) {
                _aiStatus.value = "AI 深查失败：" + (error.message ?: error::class.java.simpleName)
            } finally {
                _aiBusy.value = false
            }
        }
    }

    /** Generic collection access for the plot board / timeline / cards. */
    fun loadCollection(workId: String, name: String, onLoaded: (List<JsonObject>) -> Unit) {
        viewModelScope.launch {
            val rows = repository.loadCollection(name)
                .filter { JsonLossless.string(it["projectId"]) == workId }
            onLoaded(rows)
        }
    }

    fun saveCollection(workId: String, name: String, rows: List<JsonObject>, onSaved: () -> Unit = {}) {
        viewModelScope.launch {
            val others = repository.loadCollection(name)
                .filter { JsonLossless.string(it["projectId"]) != workId }
            repository.saveCollection(name, others + rows)
            onSaved()
        }
    }

    fun saveWorldProfile(workId: String, profile: Map<String, String>) {
        viewModelScope.launch {
            repository.saveWorldProfile(workId, profile)
            _worldProfile.value = repository.loadWorldProfile(workId)
        }
    }

    private val _relationHistory = MutableStateFlow<List<RelationEvent>>(emptyList())
    val relationHistory: StateFlow<List<RelationEvent>> = _relationHistory.asStateFlow()

    fun loadRelationHistory(workId: String) {
        viewModelScope.launch { _relationHistory.value = repository.loadRelationHistory(workId) }
    }

    fun recordRelationChange(
        workId: String,
        relation: RelationEntity,
        chapterId: String,
        afterType: String,
        afterTrust: Int,
        cause: String
    ) {
        viewModelScope.launch {
            runCatching {
                repository.appendRelationEvent(workId, relation, chapterId, afterType, afterTrust, cause)
            }
            _relationHistory.value = repository.loadRelationHistory(workId)
        }
    }

    fun saveRelation(workId: String, entity: RelationEntity) {
        viewModelScope.launch { repository.upsertRelation(workId, entity) }
    }

    fun deleteRelation(workId: String, relationId: String) {
        viewModelScope.launch { repository.deleteRelation(workId, relationId) }
    }

    fun saveCharacter(workId: String, entity: CharacterEntity) {
        viewModelScope.launch { repository.upsertCharacter(workId, entity) }
    }

    fun deleteCharacter(workId: String, characterId: String) {
        viewModelScope.launch { repository.deleteCharacter(workId, characterId) }
    }

    fun createWork(title: String, onCreated: (String) -> Unit) {
        viewModelScope.launch {
            val id = repository.createWork(title)
            onCreated(id)
        }
    }

    fun deleteWork(workId: String) {
        viewModelScope.launch { repository.deleteWork(workId) }
    }

    fun createChapter(workId: String) {
        viewModelScope.launch { repository.createChapter(workId, "") }
    }

    fun deleteChapter(workId: String, chapterId: String) {
        viewModelScope.launch {
            repository.moveChapterToTrash(workId, chapterId)
            if (_current.value?.chapterId == chapterId) _current.value = null
            _chapterTrash.value = repository.loadChapterTrash(workId)
        }
    }

    // ---- P6 三: annotations（选段批注）---------------------------------

    // ---- P6 九: 场景卡 / 每日目标 / 章节导出 ----------------------------

    val sceneCardsState: StateFlow<List<JsonObject>> get() = _sceneCards.asStateFlow()
    private val _sceneCards = MutableStateFlow<List<JsonObject>>(emptyList())

    fun loadSceneCards(workId: String) {
        viewModelScope.launch {
            _sceneCards.value = repository.loadCollection("sceneCards")
                .filter { JsonLossless.string(it["projectId"]) == workId }
        }
    }

    fun saveSceneCard(workId: String, chapterId: String, row: JsonObject?, title: String,
                      viewpoint: String, status: String, purpose: String, notes: String) {
        viewModelScope.launch {
            val next = buildJsonObject {
                if (row != null) for ((key, value) in row) put(key, value)
                put("id", JsonLossless.primitive(row?.let { JsonLossless.string(it["id"]) } ?: repository.newCardId()))
                put("projectId", JsonLossless.primitive(workId))
                put("chapterId", JsonLossless.primitive(chapterId))
                put("title", JsonLossless.primitive(title))
                put("viewpoint", JsonLossless.primitive(viewpoint))
                put("status", JsonLossless.primitive(status))
                put("purpose", JsonLossless.primitive(purpose))
                put("notes", JsonLossless.primitive(notes))
                put("updated", JsonLossless.primitive(repository.nowIso()))
                if (row == null) put("created", JsonLossless.primitive(repository.nowIso()))
            }
            val others = repository.loadCollection("sceneCards").filterNot {
                JsonLossless.string(it["projectId"]) == workId &&
                    JsonLossless.string(it["id"]) == JsonLossless.string(next["id"])
            }
            repository.saveCollection("sceneCards", others + next)
            _sceneCards.value = repository.loadCollection("sceneCards")
                .filter { JsonLossless.string(it["projectId"]) == workId }
        }
    }

    fun deleteSceneCard(workId: String, cardId: String) {
        viewModelScope.launch {
            val others = repository.loadCollection("sceneCards").filterNot {
                JsonLossless.string(it["projectId"]) == workId &&
                    JsonLossless.string(it["id"]) == cardId
            }
            repository.saveCollection("sceneCards", others)
            _sceneCards.value = repository.loadCollection("sceneCards")
                .filter { JsonLossless.string(it["projectId"]) == workId }
        }
    }

    private val _dailyGoal = MutableStateFlow(DailyProgress.DEFAULT_GOAL)
    val dailyGoal: StateFlow<Int> = _dailyGoal.asStateFlow()

    private val _todayCount = MutableStateFlow(0)
    val todayCount: StateFlow<Int> = _todayCount.asStateFlow()

    /** 从 work extras 读取 dailyGoal / writingToday（Web 版同构）。 */
    fun loadDailyProgress(workId: String) {
        viewModelScope.launch {
            val work = repository.work(workId) ?: return@launch
            val extras = JsonLossless.workExtras(work)
            _dailyGoal.value = DailyProgress.clampedGoal(JsonLossless.int(extras["dailyGoal"], DailyProgress.DEFAULT_GOAL))
            val wt = extras["writingToday"] as? JsonObject
            val date = wt?.let { JsonLossless.string(it["date"]) }.orEmpty()
            val count = wt?.let { JsonLossless.int(it["count"], 0) } ?: 0
            _todayCount.value = DailyProgress.todayCount(date, count)
        }
    }

    fun setDailyGoal(workId: String, raw: Int) {
        viewModelScope.launch {
            val goal = DailyProgress.clampedGoal(raw)
            repository.patchWorkExtras(workId) { extras ->
                LinkedHashMap(extras).apply { put("dailyGoal", JsonLossless.primitive(goal)) }
            }
            _dailyGoal.value = goal
        }
    }

    /** 编辑器字数变化时累加今日计数（只加不减，跨日归零——Web 版 updateToday 语义）。 */
    fun bumpToday(workId: String, delta: Int) {
        viewModelScope.launch {
            if (delta <= 0) return@launch
            val work = repository.work(workId) ?: return@launch
            val extras = JsonLossless.workExtras(work)
            val wt = extras["writingToday"] as? JsonObject
            val storedDate = wt?.let { JsonLossless.string(it["date"]) }.orEmpty()
            val storedCount = wt?.let { JsonLossless.int(it["count"], 0) } ?: 0
            val (date, count) = DailyProgress.add(storedDate, storedCount, delta)
            val today = _todayCount.value
            repository.patchWorkExtras(workId) { e ->
                LinkedHashMap(e).apply {
                    put("writingToday", buildJsonObject {
                        put("date", JsonLossless.primitive(date))
                        put("count", JsonLossless.primitive(count))
                    })
                }
            }
            _todayCount.value = DailyProgress.todayCount(date, count) + (if (date == DailyProgress.today()) today else 0).coerceAtMost(0) + (count - DailyProgress.todayCount(date, count)).coerceAtLeast(0)
            _todayCount.value = count
        }
    }

    // ---- P6 十: 快照 / 历史 / 全文查找 ---------------------------------

    private val _reader = MutableStateFlow<Pair<String, String>?>(null)
    val reader: StateFlow<Pair<String, String>?> = _reader.asStateFlow()

    fun prepareReader(workId: String) {
        viewModelScope.launch {
            val first = repository.chaptersOf(workId).firstOrNull()
            _reader.value = first?.let { it.title to it.text }
        }
    }

    private val _historyEntries = MutableStateFlow<List<com.storyweave.app.domain.ChapterHistory.Entry>>(emptyList())
    val historyEntries: StateFlow<List<com.storyweave.app.domain.ChapterHistory.Entry>> = _historyEntries.asStateFlow()

    private val _searchHits = MutableStateFlow<List<com.storyweave.app.domain.GlobalSearch.Hit>>(emptyList())
    val searchHits: StateFlow<List<com.storyweave.app.domain.GlobalSearch.Hit>> = _searchHits.asStateFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    /** 手动快照：chapter.history.unshift({id,at,title,text})，上限 30。 */
    fun takeSnapshot(workId: String, chapterId: String) {
        viewModelScope.launch {
            val chapter = repository.chapter(workId, chapterId) ?: return@launch
            val history = com.storyweave.app.domain.ChapterHistory.decode(historyJson(chapter))
            val next = com.storyweave.app.domain.ChapterHistory.push(
                history,
                com.storyweave.app.domain.ChapterHistory.Entry(
                    id = repository.newCardId(), at = repository.nowIso(),
                    title = chapter.title, text = chapter.text
                )
            )
            repository.writeChapterHistory(workId, chapter, next)
            _historyEntries.value = next
        }
    }

    fun loadHistory(workId: String, chapterId: String) {
        viewModelScope.launch {
            val chapter = repository.chapter(workId, chapterId) ?: return@launch
            _historyEntries.value = com.storyweave.app.domain.ChapterHistory.decode(historyJson(chapter))
        }
    }

    fun restoreSnapshot(workId: String, chapterId: String, entryId: String) {
        viewModelScope.launch {
            val chapter = repository.chapter(workId, chapterId) ?: return@launch
            val history = com.storyweave.app.domain.ChapterHistory.decode(historyJson(chapter))
            val entry = history.firstOrNull { it.id == entryId } ?: return@launch
            repository.restoreChapterText(workId, chapterId, entry.title, entry.text)
            // 恢复后正文打开即见（走编辑器当前状态刷新）。
            if (_current.value?.chapterId == chapterId) {
                openChapter(workId, chapterId)
            }
        }
    }

    private fun historyJson(chapter: com.storyweave.app.data.db.ChapterEntity): String {
        val extras = JsonLossless.workChapterExtras(chapter)
        return extras["history"]?.toString() ?: "[]"
    }

    /** 全文检索：章节标题/正文 + 人物名 + 编年事件标题。 */
    fun searchAll(workId: String, query: String) {
        viewModelScope.launch {
            _searchQuery.value = query
            val chapterRows = repository.chaptersOf(workId)
            val characterRows = repository.observeCharacters(workId).first()
            val eventRows = repository.loadCollection("timelineEvents")
                .filter { JsonLossless.string(it["projectId"]) == workId }
            _searchHits.value = com.storyweave.app.domain.GlobalSearch.search(
                query,
                chapters = chapterRows.map { it.id to it.title },
                chapterTexts = chapterRows.associate { it.id to it.text },
                characters = characterRows.map { it.id to it.name },
                events = eventRows.map { row ->
                    JsonLossless.string(row["id"]).orEmpty() to (JsonLossless.string(row["title"]) ?: "")
                }
            )
        }
    }

    private val _plots = MutableStateFlow<List<JsonObject>>(emptyList())
    val plots: StateFlow<List<JsonObject>> = _plots.asStateFlow()

    fun loadPlots(workId: String) {
        viewModelScope.launch {
            _plots.value = repository.loadCollection("plots")
                .filter { JsonLossless.string(it["projectId"]) == workId }
        }
    }

    private val _annotations = MutableStateFlow<List<JsonObject>>(emptyList())
    val annotations: StateFlow<List<JsonObject>> = _annotations.asStateFlow()

    fun loadAnnotations(workId: String) {
        viewModelScope.launch {
            _annotations.value = repository.loadCollection("annotations")
                .filter { JsonLossless.string(it["projectId"]) == workId }
        }
    }

    fun addAnnotation(workId: String, chapterId: String, start: Int, end: Int, selectedText: String, note: String) {
        viewModelScope.launch {
            val row = buildJsonObject {
                put("id", JsonLossless.primitive(repository.newCardId()))
                put("projectId", JsonLossless.primitive(workId))
                put("chapterId", JsonLossless.primitive(chapterId))
                put("text", JsonLossless.primitive(selectedText.take(700)))
                put("start", JsonLossless.primitive(start))
                put("end", JsonLossless.primitive(end))
                put("note", JsonLossless.primitive(note))
                put("created", JsonLossless.primitive(repository.nowIso()))
            }
            val others = repository.loadCollection("annotations")
                .filter { JsonLossless.string(it["projectId"]) != workId }
            repository.saveCollection("annotations", others + row)
            _annotations.value = repository.loadCollection("annotations")
                .filter { JsonLossless.string(it["projectId"]) == workId }
        }
    }

    fun deleteAnnotation(workId: String, annotationId: String) {
        viewModelScope.launch {
            val others = repository.loadCollection("annotations").filterNot {
                JsonLossless.string(it["projectId"]) == workId &&
                    JsonLossless.string(it["id"]) == annotationId
            }
            repository.saveCollection("annotations", others)
            _annotations.value = repository.loadCollection("annotations")
                .filter { JsonLossless.string(it["projectId"]) == workId }
        }
    }

    /** 一次性的跳转选中（AI 深查证据 → 编辑器定位），应用后清除。 */
    private val _pendingSelection = MutableStateFlow<Pair<String, IntRange>?>(null)
    val pendingSelection: StateFlow<Pair<String, IntRange>?> = _pendingSelection.asStateFlow()

    fun requestSelectionJump(chapterId: String, quote: String, offset: Int) {
        viewModelScope.launch {
            _pendingSelection.value = chapterId to (offset until (offset + quote.length.coerceAtLeast(1)))
        }
    }

    fun consumeSelectionJump() {
        _pendingSelection.value = null
    }

    // ---- P6: chapter trash state ---------------------------------------

    private val _chapterTrash = MutableStateFlow<List<com.storyweave.app.data.db.TrashEntry>>(emptyList())
    val chapterTrash: StateFlow<List<com.storyweave.app.data.db.TrashEntry>> = _chapterTrash.asStateFlow()

    fun loadChapterTrash(workId: String) {
        viewModelScope.launch { _chapterTrash.value = repository.loadChapterTrash(workId) }
    }

    fun restoreChapter(workId: String, chapterId: String) {
        viewModelScope.launch {
            repository.restoreChapterFromTrash(workId, chapterId)
            _chapterTrash.value = repository.loadChapterTrash(workId)
        }
    }

    fun purgeChapter(workId: String, chapterId: String) {
        viewModelScope.launch {
            repository.purgeChapterFromTrash(workId, chapterId)
            _chapterTrash.value = repository.loadChapterTrash(workId)
        }
    }

    fun deleteCharacterCascade(workId: String, characterId: String) {
        viewModelScope.launch {
            repository.deleteCharacterCascade(workId, characterId)
            // Relations may be gone; refresh both flows.
            _characters.value = repository.observeCharacters(workId)
                .catch { _characters.value = emptyList() }
                .first()
            observeRelations(workId)
        }
    }

    suspend fun bookText(workId: String, markdown: Boolean): String =
        repository.exportBookText(workId, markdown)

    fun openChapter(workId: String, chapterId: String) {
        viewModelScope.launch {
            val chapters = repository.chaptersOf(workId)
            val chapter = chapters.firstOrNull { it.id == chapterId } ?: return@launch
            _current.value = EditorState(
                workId = workId,
                chapterId = chapter.id,
                title = chapter.title,
                text = chapter.text
            )
            _saveState.value = SaveState.SAVED
        }
    }

    /** Called on every keystroke. Debounced, exactly like the Web editor. */
    fun onTextChanged(text: String) {
        val editor = _current.value ?: return
        if (editor.text == text) return
        _current.value = editor.copy(text = text)
        pendingText = text
        pendingWorkId = editor.workId
        pendingChapterId = editor.chapterId
        _saveState.value = SaveState.PENDING
        scheduled?.cancel()
        scheduled = viewModelScope.launch {
            delay(DEBOUNCE_MS)
            flushInternal()
        }
    }

    fun onTitleChanged(title: String) {
        val editor = _current.value ?: return
        _current.value = editor.copy(title = title)
        pendingWorkId = editor.workId
        pendingChapterId = editor.chapterId
        pendingText = pendingText ?: editor.text
        _saveState.value = SaveState.PENDING
        scheduled?.cancel()
        scheduled = viewModelScope.launch {
            delay(DEBOUNCE_MS)
            flushInternal()
        }
    }

    /** Immediate write: leaving the editor, backgrounding, screen off. */
    fun flush() {
        scheduled?.cancel()
        viewModelScope.launch { flushInternal() }
    }

    private suspend fun flushInternal() {
        val workId = pendingWorkId ?: return
        val chapterId = pendingChapterId ?: return
        val text = pendingText ?: return
        val title = _current.value?.takeIf { it.chapterId == chapterId }?.title
        pendingText = null
        try {
            repository.updateChapterText(workId, chapterId, text)
            if (title != null) repository.renameChapter(workId, chapterId, title)
            _saveState.value = SaveState.SAVED
        } catch (error: Throwable) {
            _saveState.value = SaveState.FAILED
        }
    }

    override fun onCleared() {
        super.onCleared()
        scheduled?.cancel()
        observeJob?.cancel()
    }

    companion object {
        const val DEBOUNCE_MS = 270L
    }
}

data class EditorState(
    val workId: String,
    val chapterId: String,
    val title: String,
    val text: String
)

enum class SaveState { SAVED, PENDING, FAILED }
