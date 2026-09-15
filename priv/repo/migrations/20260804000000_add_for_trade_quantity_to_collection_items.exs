defmodule Manavault.Repo.Migrations.AddForTradeQuantityToCollectionItems do
  use Ecto.Migration

  def up do
    alter table(:collection_items) do
      add :for_trade_quantity, :integer, null: false, default: 0
    end

    execute("""
    UPDATE collection_items
    SET for_trade_quantity = quantity
    WHERE for_trade = 1
    """)
  end

  def down do
    alter table(:collection_items) do
      remove :for_trade_quantity
    end
  end
end
