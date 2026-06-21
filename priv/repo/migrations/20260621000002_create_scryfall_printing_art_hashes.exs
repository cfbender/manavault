defmodule Manavault.Repo.Migrations.CreateScryfallPrintingArtHashes do
  use Ecto.Migration

  def change do
    create table(:scryfall_printing_art_hashes, primary_key: false) do
      add :scryfall_id,
          references(:scryfall_printings,
            column: :scryfall_id,
            type: :string,
            on_delete: :delete_all
          ),
          primary_key: true

      add :hash, :string, null: false
      add :source_url, :text
      add :image_path, :text

      timestamps(type: :utc_datetime)
    end

    create index(:scryfall_printing_art_hashes, [:hash])
  end
end
