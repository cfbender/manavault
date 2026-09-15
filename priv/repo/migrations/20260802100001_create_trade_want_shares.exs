defmodule Manavault.Repo.Migrations.CreateTradeWantShares do
  use Ecto.Migration

  def change do
    create table(:trade_want_shares) do
      add :token, :string, null: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:trade_want_shares, [:token])
  end
end
