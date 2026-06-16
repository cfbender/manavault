defmodule Manavault.Repo.Migrations.CreateScanSessions do
  use Ecto.Migration

  def change do
    create table(:scan_sessions) do
      add :name, :string, null: false
      add :default_condition, :string, null: false, default: "near_mint"
      add :default_language, :string, null: false, default: "en"
      add :default_finish, :string, null: false, default: "nonfoil"
      add :default_location_id, references(:locations, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

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
  end
end
