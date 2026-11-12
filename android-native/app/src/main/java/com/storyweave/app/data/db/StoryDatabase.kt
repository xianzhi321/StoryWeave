package com.storyweave.app.data.db

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        WorkEntity::class,
        ChapterEntity::class,
        CollectionRowEntity::class,
        DocumentMetaEntity::class,
        CharacterEntity::class,
        RelationEntity::class
    ],
    version = 3,
    exportSchema = true
)
abstract class StoryDatabase : RoomDatabase() {
    abstract fun storyDao(): StoryDao

    companion object {
        /**
         * v1 → v2: people tables introduced in P2. The CREATE statements must
         * match Room's generated schema exactly (verified against
         * StoryDatabase_Impl) or the version check fails again.
         */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `characters` (`id` TEXT NOT NULL, `projectId` TEXT NOT NULL, " +
                        "`name` TEXT NOT NULL, `role` TEXT NOT NULL, `personality` TEXT NOT NULL, `goal` TEXT NOT NULL, " +
                        "`knowledge` TEXT NOT NULL, `secret` TEXT NOT NULL, `created` TEXT NOT NULL, " +
                        "`extrasJson` TEXT NOT NULL, `position` INTEGER NOT NULL, PRIMARY KEY(`id`))"
                )
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `relations` (`id` TEXT NOT NULL, `projectId` TEXT NOT NULL, " +
                        "`a` TEXT NOT NULL, `b` TEXT NOT NULL, `type` TEXT NOT NULL, `detail` TEXT NOT NULL, " +
                        "`privateRelation` INTEGER NOT NULL, `extrasJson` TEXT NOT NULL, " +
                        "`position` INTEGER NOT NULL, PRIMARY KEY(`id`))"
                )
            }
        }

        /**
         * v2 → v3: modeledKeysJson keeps the set of modelled keys that existed
         * in the source JSON so empty-string fields survive a round trip.
         * Existing rows default to "[]" (= legacy encoder behaviour).
         */
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `characters` ADD COLUMN `modeledKeysJson` TEXT NOT NULL DEFAULT '[]'")
                db.execSQL("ALTER TABLE `relations` ADD COLUMN `modeledKeysJson` TEXT NOT NULL DEFAULT '[]'")
            }
        }

        val ALL_MIGRATIONS = arrayOf(MIGRATION_1_2, MIGRATION_2_3)
    }
}
