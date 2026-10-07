-- Migration 20260103000000 (create_locations).

CREATE TABLE "locations" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "kind" TEXT DEFAULT 'box' NOT NULL, "description" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE UNIQUE INDEX "locations_name_index" ON "locations" ("name");

