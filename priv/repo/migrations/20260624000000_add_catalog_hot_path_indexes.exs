defmodule Manavault.Repo.Migrations.AddCatalogHotPathIndexes do
  use Ecto.Migration

  def change do
    execute(
      """
      CREATE INDEX scryfall_printings_oracle_release_set_collector_index
      ON scryfall_printings (oracle_id, released_at DESC, set_code ASC, collector_number ASC)
      """,
      "DROP INDEX scryfall_printings_oracle_release_set_collector_index"
    )

    create index(:collection_items, [:scryfall_id, :finish])
    create index(:deck_cards, [:oracle_id, :finish])
  end
end
