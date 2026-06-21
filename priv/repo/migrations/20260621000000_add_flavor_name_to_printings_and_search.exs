defmodule Manavault.Repo.Migrations.AddFlavorNameToPrintingsAndSearch do
  use Ecto.Migration

  def up do
    alter table(:scryfall_printings) do
      add :flavor_name, :text
    end

    execute("DROP TABLE IF EXISTS scryfall_printing_search")

    execute("""
    CREATE VIRTUAL TABLE scryfall_printing_search USING fts5(
      scryfall_id UNINDEXED,
      name,
      compact_name,
      flavor_name,
      compact_flavor_name,
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
      lower(coalesce(c.type_line, '')),
      lower(coalesce(c.oracle_text, '')),
      lower(replace(replace(replace(replace(replace(replace(coalesce(c.oracle_text, ''), ' ', ''), ',', ''), '''', ''), '’', ''), '-', ''), '/', '')),
      lower(p.set_code),
      lower(p.collector_number)
    FROM scryfall_printings p
    JOIN scryfall_cards c ON c.oracle_id = p.oracle_id
    """)
  end

  def down do
    execute("DROP TABLE IF EXISTS scryfall_printing_search")

    execute("""
    CREATE VIRTUAL TABLE scryfall_printing_search USING fts5(
      scryfall_id UNINDEXED,
      name,
      compact_name,
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
      lower(coalesce(c.type_line, '')),
      lower(coalesce(c.oracle_text, '')),
      lower(replace(replace(replace(replace(replace(replace(coalesce(c.oracle_text, ''), ' ', ''), ',', ''), '''', ''), '’', ''), '-', ''), '/', '')),
      lower(p.set_code),
      lower(p.collector_number)
    FROM scryfall_printings p
    JOIN scryfall_cards c ON c.oracle_id = p.oracle_id
    """)

    alter table(:scryfall_printings) do
      remove :flavor_name
    end
  end
end
