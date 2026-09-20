defmodule Manavault.Catalog.Decks.ClearDeckCardAllocations do
  @moduledoc false

  alias Manavault.Catalog.DeckCard
  alias Manavault.Catalog.Decks.AllocationItems
  alias Manavault.Repo

  def run!(%DeckCard{} = deck_card) do
    deck_card
    |> Repo.preload([deck_allocations: [:collection_item]], force: true)
    |> Map.fetch!(:deck_allocations)
    |> Enum.each(fn allocation ->
      AllocationItems.restore_from_deck!(
        allocation.collection_item,
        allocation.quantity,
        allocation.source_location_id
      )

      case Repo.delete(allocation) do
        {:ok, _allocation} -> :ok
        {:error, changeset} -> Repo.rollback(changeset)
      end
    end)
  end
end
