package com.storyweave.app.data

import android.content.Context
import androidx.room.Room
import com.storyweave.app.data.db.StoryDatabase
import com.storyweave.app.data.db.StoryRepository

/**
 * Minimal service locator. P0 keeps dependency wiring explicit instead of
 * pulling in an DI framework; the graph is three objects deep.
 */
object Graph {

    @Volatile
    private var database: StoryDatabase? = null

    fun database(context: Context): StoryDatabase =
        database ?: synchronized(this) {
            database ?: Room.databaseBuilder(
                context.applicationContext,
                StoryDatabase::class.java,
                "storyweave.db"
            )
                .addMigrations(*com.storyweave.app.data.db.StoryDatabase.ALL_MIGRATIONS)
                .build().also { database = it }
        }

    fun repository(context: Context): StoryRepository =
        StoryRepository(database(context).storyDao())
}
