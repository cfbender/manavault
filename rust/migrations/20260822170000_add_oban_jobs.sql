-- Migration 20260822170000 (add_oban_jobs).

CREATE TABLE IF NOT EXISTS "oban_jobs" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "state" TEXT DEFAULT 'available' NOT NULL, "queue" TEXT DEFAULT 'default' NOT NULL, "worker" TEXT NOT NULL, "args" JSON DEFAULT ('{}') NOT NULL, "meta" JSON DEFAULT ('{}') NOT NULL, "tags" JSON DEFAULT ('[]') NOT NULL, "errors" JSON DEFAULT ('[]') NOT NULL, "attempt" INTEGER DEFAULT 0 NOT NULL, "max_attempts" INTEGER DEFAULT 20 NOT NULL, "priority" INTEGER DEFAULT 0 NOT NULL, "inserted_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL, "scheduled_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL, "attempted_at" TEXT, "attempted_by" JSON DEFAULT ('[]') NOT NULL, "cancelled_at" TEXT, "completed_at" TEXT, "discarded_at" TEXT);

CREATE INDEX IF NOT EXISTS "oban_jobs_state_queue_priority_scheduled_at_id_index" ON "oban_jobs" ("state", "queue", "priority", "scheduled_at", "id");

