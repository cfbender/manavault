defmodule Manavault.Repo.Migrations.CreateTradeWants do
  use Ecto.Migration

  def change do
    create table(:trade_wants) do
      add :oracle_id,
          references(:scryfall_cards, column: :oracle_id, type: :string, on_delete: :delete_all),
          null: false

      add :quantity, :integer, null: false, default: 1

      timestamps(type: :utc_datetime)
    end

    create unique_index(:trade_wants, [:oracle_id])
  end
end
