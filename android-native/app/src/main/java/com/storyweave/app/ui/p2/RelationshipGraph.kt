package com.storyweave.app.ui.p2

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.storyweave.app.data.db.CharacterEntity
import com.storyweave.app.data.db.RelationEntity
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Relationship graph, matching the Web build's layout rule:
 * people sit on a circle ordered by position, edges are coloured by relation
 * type, private relations are dashed.
 *
 * Differences from the Web version, stated on purpose:
 *  - drawn with Compose Canvas instead of inline SVG;
 *  - node labels use the first three characters, same as `short(name, 3)`;
 *  - capped at 20 nodes like the original (`ps.slice(0, 20)`).
 */
private const val MAX_NODES = 20

/** Edge colour rules copied from the Web build's regex tests. */
internal fun edgeColor(type: String): Color {
    val hostile = Regex("敌|疑|冲突|背叛")
    val warm = Regex("亲|友|盟|信任")
    return when {
        hostile.containsMatchIn(type) -> Color(0xFFC17B87)
        warm.containsMatchIn(type) -> Color(0xFFB58B69)
        else -> Color(0xFF8881AC)
    }
}

private val nodeColors = listOf(
    Color(0xFFA483A7), Color(0xFFB68D62), Color(0xFF679A91),
    Color(0xFFBF7E8B), Color(0xFF7E91B4)
)

@Composable
fun RelationshipGraph(
    characters: List<CharacterEntity>,
    relations: List<RelationEntity>,
    modifier: Modifier = Modifier
) {
    if (characters.isEmpty()) {
        Box(modifier = modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
            Text(
                "添加人物后，这里会形成可视化关系网。",
                style = MaterialTheme.typography.bodySmall
            )
        }
        return
    }

    val nodes = characters.take(MAX_NODES)
    val textMeasurer = rememberTextMeasurer()

    Box(modifier = modifier.fillMaxWidth().height(280.dp)) {
        Canvas(modifier = Modifier.fillMaxSize().padding(8.dp)) {
            val n = nodes.size
            val cx = size.width / 2f
            val cy = size.height / 2f
            val radius = if (n < 5) size.minDimension * 0.30f else size.minDimension * 0.37f
            val nodeRadius = size.minDimension * 0.075f

            val points = nodes.mapIndexed { index, person ->
                val angle = index * 2.0 * PI / n
                Offset(
                    x = cx + (sin(angle) * radius).toFloat(),
                    y = cy - (cos(angle) * radius).toFloat()
                )
            }
            val indexOf = nodes.withIndex().associate { (i, p) -> p.id to i }

            // Edges first so nodes paint on top.
            for (relation in relations) {
                val aIndex = indexOf[relation.a] ?: continue
                val bIndex = indexOf[relation.b] ?: continue
                if (aIndex == bIndex) continue
                val color = edgeColor(relation.type)
                drawLine(
                    color = color.copy(alpha = 0.65f),
                    start = points[aIndex],
                    end = points[bIndex],
                    strokeWidth = 2.4f,
                    pathEffect = if (relation.privateRelation) {
                        PathEffect.dashPathEffect(floatArrayOf(12f, 8f))
                    } else null
                )
            }

            // Nodes.
            for ((index, point) in points.withIndex()) {
                drawCircle(
                    color = nodeColors[index % nodeColors.size],
                    radius = nodeRadius,
                    center = point
                )
                drawCircle(
                    color = Color.White,
                    radius = nodeRadius,
                    center = point,
                    style = Stroke(width = 3f)
                )
            }

            // Labels last, measured centrally so text stays put.
            for ((index, point) in points.withIndex()) {
                val label = nodes[index].name.take(3)
                val laid = textMeasurer.measure(
                    text = AnnotatedString(label),
                    style = TextStyle(fontSize = 12.sp, color = Color.White)
                )
                drawText(
                    textLayoutResult = laid,
                    topLeft = Offset(
                        point.x - laid.size.width / 2f,
                        point.y - laid.size.height / 2f
                    )
                )
            }
        }
    }
}
