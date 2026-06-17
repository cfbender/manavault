defmodule Manavault.Repo.Migrations.AddCoverScryfallIdToLocations do
  use Ecto.Migration

  def change do
    alter table(:locations) do
      add :cover_scryfall_id,
          references(:scryfall_printings,
            column: :scryfall_id,
            type: :string,
            on_delete: :nilify_all
          )
    end

    create index(:locations, [:cover_scryfall_id])
  end
end
