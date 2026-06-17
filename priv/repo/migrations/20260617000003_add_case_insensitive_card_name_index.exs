defmodule Manavault.Repo.Migrations.AddCaseInsensitiveCardNameIndex do
  use Ecto.Migration

  def up do
    execute("""
    CREATE INDEX IF NOT EXISTS scryfall_cards_name_nocase_idx
    ON scryfall_cards(name COLLATE NOCASE)
    """)
  end

  def down do
    execute("DROP INDEX IF EXISTS scryfall_cards_name_nocase_idx")
  end
end
