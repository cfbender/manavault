-- Migration 20260703000001 (add_set_and_release_date_auto_sort_fields).

ALTER TABLE "collection_auto_sort_rules" ADD COLUMN "set_operator" TEXT DEFAULT 'in' NOT NULL;

ALTER TABLE "collection_auto_sort_rules" ADD COLUMN "set_codes" TEXT DEFAULT '[]' NOT NULL;

ALTER TABLE "collection_auto_sort_rules" ADD COLUMN "release_date_operator" TEXT DEFAULT 'after' NOT NULL;

ALTER TABLE "collection_auto_sort_rules" ADD COLUMN "release_date" TEXT;

