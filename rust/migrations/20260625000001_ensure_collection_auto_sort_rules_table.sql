-- Generated from priv/repo/migrations/20260625000001_*.exs by rust/scripts/dump-migrations.py.

CREATE TABLE IF NOT EXISTS collection_auto_sort_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL,
  target_location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  color_mode TEXT NOT NULL DEFAULT 'any',
  colors TEXT NOT NULL DEFAULT '[]',
  type_line_includes TEXT NOT NULL DEFAULT '[]',
  type_line_excludes TEXT NOT NULL DEFAULT '[]',
  rarities TEXT NOT NULL DEFAULT '[]',
  min_price_cents INTEGER,
  max_price_cents INTEGER,
  inserted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS collection_auto_sort_rules_enabled_priority_index ON collection_auto_sort_rules (enabled, priority);

CREATE INDEX IF NOT EXISTS collection_auto_sort_rules_target_location_id_index ON collection_auto_sort_rules (target_location_id);

