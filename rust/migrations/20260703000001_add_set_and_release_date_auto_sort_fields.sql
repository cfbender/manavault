-- Generated from priv/repo/migrations/20260703000001_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "collection_auto_sort_rules" ADD COLUMN "set_operator" TEXT DEFAULT 'in' NOT NULL;

ALTER TABLE "collection_auto_sort_rules" ADD COLUMN "set_codes" TEXT DEFAULT '[]' NOT NULL;

ALTER TABLE "collection_auto_sort_rules" ADD COLUMN "release_date_operator" TEXT DEFAULT 'after' NOT NULL;

ALTER TABLE "collection_auto_sort_rules" ADD COLUMN "release_date" TEXT;

