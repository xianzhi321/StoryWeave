package com.storyweave.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import com.storyweave.app.ui.AppRoot

/**
 * Native shell entry point.
 *
 * P0 shows the migration ledger and the JSON backup bridge only. Every feature
 * that is not ported yet must stay visible with an explicit status, per the
 * project charter.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme {
                AppRoot()
            }
        }
    }
}
