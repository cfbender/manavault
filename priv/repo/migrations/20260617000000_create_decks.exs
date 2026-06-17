defmodule Manavault.Repo.Migrations.CreateDecks do
  use Ecto.Migration

  def change do
    create table(:decks) do
      add :name, :string, null: false
      add :format, :string, null: false, default: "commander"
      add :status, :string, null: false, default: "brewing"

      timestamps(type: :utc_datetime)
    end

    create index(:decks, [:name])
    create index(:decks, [:format])
    create index(:decks, [:status])

    create table(:deck_cards) do
      add :deck_id, references(:decks, on_delete: :delete_all), null: false

      add :oracle_id,
          references(:scryfall_cards, column: :oracle_id, type: :string, on_delete: :restrict),
          null: false

      add :preferred_printing_id,
          references(:scryfall_printings,
            column: :scryfall_id,
            type: :string,
            on_delete: :nilify_all
          )

      add :quantity, :integer, null: false, default: 1
      add :zone, :string, null: false, default: "mainboard"

      timestamps(type: :utc_datetime)
    end

    create index(:deck_cards, [:deck_id])
    create index(:deck_cards, [:oracle_id])
    create index(:deck_cards, [:preferred_printing_id])
    create unique_index(:deck_cards, [:deck_id, :oracle_id, :zone])
  end
end
