defmodule Manavault.Repo.Migrations.DropCaseInsensitiveCardNameIndex do
  use Ecto.Migration

  # Exact card-name lookups now match against the indexed normalized_name
  # column (Manavault.Catalog.Search.CardsByName); nothing queries
  # `name COLLATE NOCASE` anymore, so the index only added write overhead.
  def up do
    execute("DROP INDEX IF EXISTS scryfall_cards_name_nocase_idx")
  end

  def down do
    execute("""
    CREATE INDEX IF NOT EXISTS scryfall_cards_name_nocase_idx
    ON scryfall_cards(name COLLATE NOCASE)
    """)
  end
end
