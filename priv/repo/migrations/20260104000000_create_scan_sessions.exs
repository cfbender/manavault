defmodule Manavault.Repo.Migrations.CreateScanSessions do
  use Ecto.Migration

  def change do
    create table(:scan_sessions) do
      add :name, :string, null: false
      add :status, :string, null: false, default: "open"
      add :default_condition, :string, null: false, default: "near_mint"
      add :default_language, :string, null: false, default: "en"
      add :default_finish, :string, null: false, default: "nonfoil"
      add :default_location_id, references(:locations, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create index(:scan_sessions, [:status])
    create index(:scan_sessions, [:default_location_id])

    create table(:scan_items) do
      add :scan_session_id, references(:scan_sessions, on_delete: :delete_all), null: false
      add :image_path, :text
      add :status, :string, null: false, default: "pending"

      add :accepted_printing_id,
          references(:scryfall_printings,
            column: :scryfall_id,
            type: :string,
            on_delete: :nilify_all
          )

      add :quantity, :integer, null: false, default: 1
      add :condition, :string, null: false, default: "near_mint"
      add :language, :string, null: false, default: "en"
      add :finish, :string, null: false, default: "nonfoil"
      add :location_id, references(:locations, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create index(:scan_items, [:scan_session_id])
    create index(:scan_items, [:status])
    create index(:scan_items, [:accepted_printing_id])
    create index(:scan_items, [:location_id])

    create table(:scan_candidates) do
      add :scan_item_id, references(:scan_items, on_delete: :delete_all), null: false

      add :printing_id,
          references(:scryfall_printings,
            column: :scryfall_id,
            type: :string,
            on_delete: :nilify_all
          )

      add :oracle_id,
          references(:scryfall_cards,
            column: :oracle_id,
            type: :string,
            on_delete: :nilify_all
          )

      add :source, :string, null: false
      add :confidence, :float
      add :rank, :integer, null: false, default: 1
      add :evidence, :text, null: false, default: "{}"

      timestamps(type: :utc_datetime)
    end

    create index(:scan_candidates, [:scan_item_id])
    create index(:scan_candidates, [:printing_id])
    create index(:scan_candidates, [:oracle_id])
    create index(:scan_candidates, [:source])
    create index(:scan_candidates, [:scan_item_id, :rank])
  end
end
