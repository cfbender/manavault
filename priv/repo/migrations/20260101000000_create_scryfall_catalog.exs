defmodule Manavault.Repo.Migrations.CreateScryfallCatalog do
  use Ecto.Migration

  def change do
    create table(:scryfall_cards, primary_key: false) do
      add :oracle_id, :string, primary_key: true
      add :name, :string, null: false
      add :type_line, :text
      add :oracle_text, :text
      add :color_identity, :text, null: false, default: "[]"
      add :legalities, :text, null: false, default: "{}"

      timestamps(type: :utc_datetime)
    end

    create index(:scryfall_cards, [:name])
    create index(:scryfall_cards, [:oracle_id])

    create table(:scryfall_printings, primary_key: false) do
      add :scryfall_id, :string, primary_key: true

      add :oracle_id,
          references(:scryfall_cards, column: :oracle_id, type: :string, on_delete: :delete_all),
          null: false

      add :set_code, :string, null: false
      add :set_name, :string
      add :collector_number, :string, null: false
      add :lang, :string, null: false
      add :finishes, :text, null: false, default: "[]"
      add :image_uris, :text, null: false, default: "{}"
      add :prices, :text, null: false, default: "{}"
      add :released_at, :date

      timestamps(type: :utc_datetime)
    end

    create index(:scryfall_printings, [:oracle_id])
    create index(:scryfall_printings, [:set_code])
    create index(:scryfall_printings, [:collector_number])
    create index(:scryfall_printings, [:scryfall_id])
    create index(:scryfall_printings, [:set_code, :collector_number])

    create table(:scryfall_syncs) do
      add :status, :string, null: false
      add :bulk_type, :string, null: false
      add :bulk_uri, :text
      add :started_at, :utc_datetime, null: false
      add :completed_at, :utc_datetime
      add :cards_count, :integer, null: false, default: 0
      add :printings_count, :integer, null: false, default: 0
      add :error, :text

      timestamps(type: :utc_datetime)
    end

    create index(:scryfall_syncs, [:status])
    create index(:scryfall_syncs, [:bulk_type])
    create index(:scryfall_syncs, [:started_at])
  end
end
