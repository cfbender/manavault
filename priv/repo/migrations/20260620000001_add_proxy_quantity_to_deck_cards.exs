defmodule Manavault.Repo.Migrations.AddProxyQuantityToDeckCards do
  use Ecto.Migration

  def change do
    alter table(:deck_cards) do
      add :proxy_quantity, :integer, null: false, default: 0
    end
  end
end
