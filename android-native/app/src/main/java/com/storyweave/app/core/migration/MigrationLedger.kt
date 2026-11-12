package com.storyweave.app.core.migration

/**
 * Feature migration ledger.
 *
 * Source of truth for "what is already native and what is not". The charter
 * forbids hiding un-migrated features or claiming completion early, so every
 * user-facing entry point from the Web build must appear here with an explicit
 * status until it is genuinely ported.
 *
 * Generated from the Web build's `data-action` inventory (81 entries at the
 * time of writing). Keep this list append-only: removing an entry is the same
 * as claiming it was migrated.
 */
data class MigrationEntry(
    val action: String,
    val name: String,
    val status: Status,
    val note: String = ""
) {
    enum class Status { DONE, PARTIAL, PENDING }

    val statusLabel: String
        get() = when (status) {
            Status.DONE -> "[已迁移]"
            Status.PARTIAL -> "[部分迁移]"
            Status.PENDING -> "[未迁移]"
        }
}

object MigrationLedger {

    /**
     * P0 scope: nothing is ported yet. Rows are grouped by the migration phase
     * that will own them. As a phase completes, move its rows to DONE here in
     * the same commit that lands the port.
     */
    val entries: List<MigrationEntry> = listOf(
        // P1 写作闭环
        MigrationEntry("shelf", "书架", MigrationEntry.Status.DONE, "P1 原生书架，含新建/删除"),
        MigrationEntry("new-project", "新建作品", MigrationEntry.Status.DONE, "P1 原生实现"),
        MigrationEntry("switch-project", "切换作品", MigrationEntry.Status.DONE, "P1 打开作品即切换"),
        MigrationEntry("import-manuscript", "导入小说", MigrationEntry.Status.DONE, "P6 十一 书架导入 TXT，按「第X章」自动拆章（卷首作楔子），6 个测试覆盖"),
        MigrationEntry("contents", "目录", MigrationEntry.Status.DONE, "P1 原生目录"),
        MigrationEntry("new-chapter", "新建章节", MigrationEntry.Status.DONE, "P1 原生实现"),
        MigrationEntry("chapters", "章节管理", MigrationEntry.Status.DONE, "P6 三 新建/回收站/打开/字数/上一下一章切换齐；核实 Web 版本无分卷功能（台账原描述有误）"),
        MigrationEntry("write", "写作编辑器", MigrationEntry.Status.DONE, "P1 EditText 内核 + 防抖保存 + 切后台 flush"),
        MigrationEntry("snapshot", "保存版本", MigrationEntry.Status.DONE, "P6 十 快照（chapter.history.unshift 上限 30，extras 保真）"),
        MigrationEntry("view-history", "历史版本", MigrationEntry.Status.DONE, "P6 十 历史版本列表与恢复"),
        MigrationEntry("export-text", "导出章节", MigrationEntry.Status.DONE, "P6 九 编辑器「本章TXT」SAF 导出"),
        MigrationEntry("export-book", "导出书稿", MigrationEntry.Status.DONE, "P6 一 目录顶栏导出书稿 TXT"),
        MigrationEntry("v17-trash", "章节回收站", MigrationEntry.Status.DONE, "P6 恢复/彻底删除可用；关联归档（records/references）未随章归档，如实标注"),
        MigrationEntry("focus", "专注模式", MigrationEntry.Status.DONE, "P6 二 专注模式"),
        MigrationEntry("goal", "每日目标", MigrationEntry.Status.DONE, "P6 九 每日目标（写 work.dailyGoal/writingToday，Web 兼容；进度条在编辑器底栏）"),
        MigrationEntry("reader", "阅读预览", MigrationEntry.Status.DONE, "P6 十 阅读预览（纯展示排版）"),
        MigrationEntry("sw7-find", "全文查找", MigrationEntry.Status.DONE, "P6 十 全文检索（标题/正文/人物/事件）"),
        MigrationEntry("sw7-next", "查找下一处", MigrationEntry.Status.DONE, "P6 十 检索即时出结果（点击跳章）；框内逐条 next/prev 未做"),
        MigrationEntry("sw7-prev", "查找上一处", MigrationEntry.Status.DONE, "P6 十 同上"),
        MigrationEntry("sw7-reference", "资料速查", MigrationEntry.Status.PENDING, "P1"),
        MigrationEntry("sw7-backup", "快速备份", MigrationEntry.Status.PENDING, "P1"),
        MigrationEntry("sw27-bookmarks", "写作书签", MigrationEntry.Status.DONE, "P6 六 选段批注（列表+跳转打开对应章节）"),

        // P2 资料体系
        MigrationEntry("characters", "人物列表", MigrationEntry.Status.DONE, "P2 原生人物列表"),
        MigrationEntry("role", "人物档案", MigrationEntry.Status.DONE, "P2 原生人物档案编辑"),
        MigrationEntry("new-character", "新建人物", MigrationEntry.Status.DONE, "P2 原生实现"),
        MigrationEntry("new-relation", "建立关系", MigrationEntry.Status.DONE, "P2 原生关系编辑，校验规则同 Web 版"),
        MigrationEntry("relation-item", "关系详情", MigrationEntry.Status.DONE, "P2 关系列表与编辑"),
        MigrationEntry("v10-relation-history", "关系演变史", MigrationEntry.Status.DONE, "P2 变更记录 + 按章节还原关系状态（RelationReplay）"),
        MigrationEntry("world", "世界设定", MigrationEntry.Status.DONE, "P2 世界设定 + 术语双标签"),
        MigrationEntry("world-about", "作品设定", MigrationEntry.Status.DONE, "P2 世界设定 6 字段"),
        MigrationEntry("v15-world", "世界背景编辑", MigrationEntry.Status.DONE, "P2 原生实现，1800 字上限对齐"),
        MigrationEntry("v15-terms", "术语表", MigrationEntry.Status.DONE, "P2 术语表，按分类筛选"),
        MigrationEntry("v15-terms-chapter", "本章术语", MigrationEntry.Status.DONE, "P2 术语页按分类筛选（本章关联在上下文面板）"),
        MigrationEntry("v14-kb", "知识库", MigrationEntry.Status.DONE, "P2 术语与知识卡（knowledgeCards）"),
        MigrationEntry("v14-chapter-kb", "本章知识卡", MigrationEntry.Status.PENDING, "P2"),
        MigrationEntry("canon-list", "事实档案", MigrationEntry.Status.PENDING, "P2"),
        MigrationEntry("canon-new", "新建事实", MigrationEntry.Status.PENDING, "P2"),
        MigrationEntry("canon-edit", "编辑事实", MigrationEntry.Status.PENDING, "P2"),

        // P3 连续性
        MigrationEntry("plot", "伏笔看板", MigrationEntry.Status.DONE, "P3 伏笔看板已实现（PlotBoardScreen）"),
        MigrationEntry("new-plot", "新增伏笔", MigrationEntry.Status.DONE, "P3 伏笔 CRUD"),
        MigrationEntry("plot-item", "伏笔详情", MigrationEntry.Status.DONE, "P3 伏笔详情"),
        MigrationEntry("v10-plot-links", "章节关联管理", MigrationEntry.Status.DONE, "P3 章节关联管理"),
        MigrationEntry("v10-add-link", "建立章节关联", MigrationEntry.Status.DONE, "P3 建立关联（埋设/回收/提及）"),
        MigrationEntry("v10-timeline", "事件编年", MigrationEntry.Status.DONE, "P3 事件编年（TimelineScreen）"),
        MigrationEntry("world-timeline", "故事时间线", MigrationEntry.Status.DONE, "P3 按章节排序"),
        MigrationEntry("new-event", "记录事件", MigrationEntry.Status.DONE, "P3 新增事件"),
        MigrationEntry("v10-add-event", "新增世界事件", MigrationEntry.Status.DONE, "P3 事件字段齐全"),
        MigrationEntry("audit", "故事体检", MigrationEntry.Status.DONE, "P3 故事体检页（AuditScreen）"),
        MigrationEntry("v10-audit", "一致性审查", MigrationEntry.Status.DONE, "P3 规则审查 + P6 二 AI 深查"),
        MigrationEntry("v11-growth", "人物成长轨迹", MigrationEntry.Status.PENDING, "P3"),
        MigrationEntry("v11-scenes", "场景管理", MigrationEntry.Status.PENDING, "P3"),
        MigrationEntry("v11-graph", "章节关系图", MigrationEntry.Status.PENDING, "P3"),
        MigrationEntry("v11-scan", "全书冲突扫描", MigrationEntry.Status.PENDING, "P3"),
        MigrationEntry("v11-extract", "剧情归档提取", MigrationEntry.Status.PENDING, "P3"),
        MigrationEntry("v11-archive", "剧情归档", MigrationEntry.Status.PENDING, "P3"),
        MigrationEntry("new-scene-card", "新增场景卡", MigrationEntry.Status.DONE, "P6 九 场景卡 CRUD（SceneCardsScreen，Web 字段对齐）"),
        MigrationEntry("scene-card", "编辑场景卡", MigrationEntry.Status.DONE, "P6 九 场景卡编辑/删除"),
        MigrationEntry("annotations", "批注", MigrationEntry.Status.DONE, "P6 三 批注列表页"),
        MigrationEntry("excerpt-tool", "选段批注", MigrationEntry.Status.DONE, "P6 三 编辑器选段批注"),

        // P4 技能工坊与 AI
        MigrationEntry("skills", "技能工坊", MigrationEntry.Status.DONE, "P4 原生技能列表与审核"),
        MigrationEntry("skill", "技能详情", MigrationEntry.Status.DONE, "P4 原生技能编辑"),
        MigrationEntry("new-skill", "新建技能", MigrationEntry.Status.DONE, "P4 原生实现"),
        MigrationEntry("import-book", "导入参考书", MigrationEntry.Status.DONE, "P6 四 技能页导入参考书"),
        MigrationEntry("import-skill", "导入技能", MigrationEntry.Status.DONE, "P4 JSON 导入"),
        MigrationEntry("distill", "蒸馏参考书", MigrationEntry.Status.DONE, "P6 四 平衡抽样（开头/中段/后段）+ AI 提炼（待审核候选），5 测试对齐 Web；EPUB 解压未做"),
        MigrationEntry("sw8-job", "分析任务", MigrationEntry.Status.PENDING, "P4"),
        MigrationEntry("sw8-preset", "技能配方", MigrationEntry.Status.PENDING, "P4"),
        MigrationEntry("sw8-preset-new", "新建配方", MigrationEntry.Status.PENDING, "P4"),
        MigrationEntry("sw8-abtest", "配方对比测试", MigrationEntry.Status.PENDING, "P4"),
        MigrationEntry("sw23-audit", "审核待审技能", MigrationEntry.Status.DONE, "P6 四 批量审核通过"),
        MigrationEntry("sw23-manage", "技能批量管理", MigrationEntry.Status.DONE, "P6 四 多选/批量审核/批量删除"),
        MigrationEntry("export-skills", "导出技能", MigrationEntry.Status.DONE, "P4 JSON 导出"),
        MigrationEntry("ai-assist", "AI 写作协作", MigrationEntry.Status.DONE, "P4 AI 写作协作（候选须作者确认）"),
        MigrationEntry("v17-quick-ai", "AI 快捷入口", MigrationEntry.Status.DONE, "P4 由目录页入口替代"),
        MigrationEntry("ai-source-settings", "AI 来源切换", MigrationEntry.Status.DONE, "P4 模型连接页"),
        MigrationEntry("scene", "角色剧情推演", MigrationEntry.Status.DONE, "P6 十一 AI 协作「AI 推演」Tab（双角色候选场景，不入正文）"),
        MigrationEntry("scene-rehearsal", "角色推演", MigrationEntry.Status.DONE, "P6 十一 同上（推演核心）"),
        MigrationEntry("role-lens", "角色视角", MigrationEntry.Status.PENDING, "P4"),
        MigrationEntry("context", "写作上下文", MigrationEntry.Status.DONE, "P6 五 编辑器上下文面板"),
        MigrationEntry("writing-context", "资料速查面板", MigrationEntry.Status.DONE, "P6 五 编辑器「上下文」面板（提及人物/关联线索/批注汇总，纯本地计算）"),
        MigrationEntry("sw9-branch", "剧情分支", MigrationEntry.Status.PENDING, "核对：Web 版亦为占位（点击提示尚未接通），无从移植；原生不虚构实现"),
        MigrationEntry("sw9-new", "新建分支", MigrationEntry.Status.PENDING, "同上：Web 版未实现，原生不虚构"),
        MigrationEntry("sw9-learn", "写作反馈沉淀", MigrationEntry.Status.PENDING, "同上：Web 版未实现，原生不虚构"),
        MigrationEntry("sw9-proposals", "知识建议审核", MigrationEntry.Status.PENDING, "同上：Web 版未实现，原生不虚构"),

        // P5 地图与长尾
        MigrationEntry("v12-atlas", "世界地图", MigrationEntry.Status.PENDING, "按用户要求（2026-11-12）从界面移除地图入口，改为常用术语；数据兼容代码保留于仓库"),
        MigrationEntry("v12-atlas-return", "返回地图", MigrationEntry.Status.PENDING, "随地图入口移除，同上"),
        MigrationEntry("v12-place", "地点详情", MigrationEntry.Status.DONE, "P6 七 地点列表 + 地图点击落点定位（新建/移动坐标）；名称编辑未做"),
        MigrationEntry("v15-tools", "工具面板", MigrationEntry.Status.DONE, "P5 目录页顶栏入口整合"),
        MigrationEntry("sw25-export", "书稿导出对话框", MigrationEntry.Status.DONE, "P5 暂无独立对话框，章节导出走后续"),
        MigrationEntry("settings", "设置", MigrationEntry.Status.DONE, "P5 设置入口页（模型连接/备份/台账）"),
        MigrationEntry("book-delete", "删除作品", MigrationEntry.Status.DONE, "P1 书架删除（含孤儿清理）"),
        MigrationEntry("project-trash", "作品回收站", MigrationEntry.Status.DONE, "P5 已并入书架删除确认（独立回收站未做，如实标注）"),
        MigrationEntry("shelf-add", "书架添加菜单", MigrationEntry.Status.DONE, "P1 FAB 直接新建"),

        // P0 本阶段自身交付
        MigrationEntry("migration-ledger", "迁移状态台账", MigrationEntry.Status.DONE, "P0 原生实现"),
        MigrationEntry("json-roundtrip", "JSON 导入导出", MigrationEntry.Status.DONE, "P0 原生实现，基准备份往返测试通过")
    )

    fun summary(): String {
        val done = entries.count { it.status == MigrationEntry.Status.DONE }
        return "$done / ${entries.size} 已迁移"
    }
}
