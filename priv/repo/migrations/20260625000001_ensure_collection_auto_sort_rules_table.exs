defmodule Manavault.Repo.Migrations.EnsureCollectionAutoSortRulesTable do
  use Ecto.Migration

  def up do
    execute("""
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
    )
    """)

    execute(
      "CREATE INDEX IF NOT EXISTS collection_auto_sort_rules_enabled_priority_index ON collection_auto_sort_rules (enabled, priority)"
    )

    execute(
      "CREATE INDEX IF NOT EXISTS collection_auto_sort_rules_target_location_id_index ON collection_auto_sort_rules (target_location_id)"
    )
  end

  def down do
    drop_if_exists table(:collection_auto_sort_rules)
  end
end
