defmodule Manavault.Repo.Migrations.DropScannerTables do
  use Ecto.Migration

  def up do
    drop_if_exists table(:scan_items)
    drop_if_exists table(:scan_sessions)
    drop_if_exists table(:scan_candidates)
    drop_if_exists table(:scryfall_printing_art_hashes)
  end

  def down do
    :ok
  end
end
