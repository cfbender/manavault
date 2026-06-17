defmodule Manavault.Catalog.DeckAllocation do
  use Ecto.Schema

  import Ecto.Changeset

  schema "deck_allocations" do
    field :quantity, :integer, default: 1

    belongs_to :deck_card, Manavault.Catalog.DeckCard
    belongs_to :collection_item, Manavault.Catalog.CollectionItem
    belongs_to :source_location, Manavault.Catalog.Location

    timestamps(type: :utc_datetime)
  end

  def changeset(deck_allocation, attrs) do
    deck_allocation
    |> cast(attrs, [:deck_card_id, :collection_item_id, :source_location_id, :quantity])
    |> validate_required([:deck_card_id, :collection_item_id, :quantity])
    |> validate_number(:quantity, greater_than: 0)
    |> foreign_key_constraint(:deck_card_id)
    |> foreign_key_constraint(:collection_item_id)
    |> foreign_key_constraint(:source_location_id)
    |> unique_constraint([:deck_card_id, :collection_item_id])
  end
end
