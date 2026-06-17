defmodule Manavault.Repo.Migrations.CreateDeckAllocations do
  use Ecto.Migration

  def change do
    create table(:deck_allocations) do
      add :deck_card_id, references(:deck_cards, on_delete: :delete_all), null: false
      add :collection_item_id, references(:collection_items, on_delete: :delete_all), null: false
      add :quantity, :integer, null: false, default: 1

      timestamps(type: :utc_datetime)
    end

    create index(:deck_allocations, [:deck_card_id])
    create index(:deck_allocations, [:collection_item_id])
    create unique_index(:deck_allocations, [:deck_card_id, :collection_item_id])
  end
end
