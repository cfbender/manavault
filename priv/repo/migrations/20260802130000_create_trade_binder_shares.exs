defmodule Manavault.Repo.Migrations.CreateTradeBinderShares do
  use Ecto.Migration

  def change do
    create table(:trade_binder_shares) do
      add :token, :string, null: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:trade_binder_shares, [:token])
  end
end
