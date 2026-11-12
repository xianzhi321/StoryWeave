package com.storyweave.app.domain

/**
 * 导入小说拆章，参考成熟写作软件（纯纯写作/作家助手）的 TXT 导入做法：
 * 按「第X章/第X回/第X节/Chapter N」等标题切分，标题前的卷首内容单独作为
 * 第一章（楔子/序），识别不到章节标题时整本作为一章，绝不丢字。
 */
object ManuscriptSplitter {

    data class Chapter(val title: String, val text: String)

    private val HEADING = Regex(
        """^\s*(?:第\s*[0-9一二三四五六七八九十百千零两]+\s*[章节回部卷篇集]\s*[^\n]{0,40}|Chapter\s+\d+[^\n]{0,40}|CHAPTER\s+\d+[^\n]{0,40})\s*$""",
        RegexOption.MULTILINE
    )

    /** 切分结果：列表非空，text 与原文逐字拼接可还原（除标题行本身）。 */
    fun split(raw: String, defaultTitle: String = "正文"): List<Chapter> {
        val text = raw.replace("\r\n", "\n").replace('\r', '\n')
        if (text.isBlank()) return listOf(Chapter(defaultTitle, ""))
        val matches = HEADING.findAll(text).toList()
        if (matches.isEmpty()) return listOf(Chapter(defaultTitle, text.trim()))
        val chapters = mutableListOf<Chapter>()
        // 卷首（第一个标题之前）非空则作为一章（序/楔子）。
        val preamble = text.substring(0, matches.first().range.first).trim()
        if (preamble.isNotEmpty()) {
            chapters += Chapter("楔子 · 卷首", preamble)
        }
        for ((index, match) in matches.withIndex()) {
            val bodyStart = match.range.last + 1
            val end = matches.getOrNull(index + 1)?.range?.first ?: text.length
            val body = text.substring(bodyStart.coerceAtMost(text.length), end).trim()
            chapters += Chapter(match.value.trim(), body)
        }
        return chapters
    }
}
