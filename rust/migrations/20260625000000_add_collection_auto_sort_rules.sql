-- Generated from priv/repo/migrations/20260625000000_*.exs by rust/scripts/dump-migrations.py.

CREATE TABLE "collection_auto_sort_rules" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "enabled" INTEGER DEFAULT true NOT NULL, "priority" INTEGER NOT NULL, "target_location_id" INTEGER NOT NULL CONSTRAINT "collection_auto_sort_rules_target_location_id_fkey" REFERENCES "locations"("id") ON DELETE CASCADE, "color_mode" TEXT DEFAULT 'any' NOT NULL, "colors" TEXT DEFAULT '[]' NOT NULL, "type_line_includes" TEXT DEFAULT '[]' NOT NULL, "type_line_excludes" TEXT DEFAULT '[]' NOT NULL, "rarities" TEXT DEFAULT '[]' NOT NULL, "min_price_cents" INTEGER, "max_price_cents" INTEGER, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE INDEX "collection_auto_sort_rules_enabled_priority_index" ON "collection_auto_sort_rules" ("enabled", "priority");

CREATE INDEX "collection_auto_sort_rules_target_location_id_index" ON "collection_auto_sort_rules" ("target_location_id");

