defmodule Manavault.Repo.Migrations.AddForTradeToCollectionItems do
  use Ecto.Migration

  def change do
    alter table(:collection_items) do
      add :for_trade, :boolean, null: false, default: false
    end

    create index(:collection_items, [:for_trade])
  end
end
