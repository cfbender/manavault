defmodule Manavault.Repo.Migrations.DropScryfallPrintingSearch do
  use Ecto.Migration

  # The FTS5 table was maintained on every Scryfall import (~100 MB for the
  # full catalog) but no query ever read it. Card and collection search run
  # against the covering indexes on scryfall_cards / scryfall_printings.

  def up do
    execute("DROP TABLE IF EXISTS scryfall_printing_search")
  end

  def down do
    execute("""
    CREATE VIRTUAL TABLE scryfall_printing_search USING fts5(
      scryfall_id UNINDEXED,
      name,
      compact_name,
      flavor_name,
      compact_flavor_name,
      flavor_text,
      compact_flavor_text,
      type_line,
      oracle_text,
      compact_oracle_text,
      set_code,
      collector_number
    )
    """)

    execute("""
    INSERT INTO scryfall_printing_search (
      scryfall_id,
      name,
      compact_name,
      flavor_name,
      compact_flavor_name,
      flavor_text,
      compact_flavor_text,
      type_line,
      oracle_text,
      compact_oracle_text,
      set_code,
      collector_number
    )
    SELECT
      p.scryfall_id,
      lower(c.name),
      lower(replace(replace(replace(replace(replace(replace(c.name, ' ', ''), ',', ''), '''', ''), '’', ''), '-', ''), '/', '')),
      lower(coalesce(p.flavor_name, '')),
      lower(replace(replace(replace(replace(replace(replace(coalesce(p.flavor_name, ''), ' ', ''), ',', ''), '''', ''), '’', ''), '-', ''), '/', '')),
      lower(coalesce(p.flavor_text, '')),
      lower(replace(replace(replace(replace(replace(replace(coalesce(p.flavor_text, ''), ' ', ''), ',', ''), '''', ''), '’', ''), '-', ''), '/', '')),
      lower(coalesce(c.type_line, '')),
      lower(coalesce(c.oracle_text, '')),
      lower(replace(replace(replace(replace(replace(replace(coalesce(c.oracle_text, ''), ' ', ''), ',', ''), '''', ''), '’', ''), '-', ''), '/', '')),
      lower(p.set_code),
      lower(p.collector_number)
    FROM scryfall_printings p
    JOIN scryfall_cards c ON c.oracle_id = p.oracle_id
    """)
  end
end
