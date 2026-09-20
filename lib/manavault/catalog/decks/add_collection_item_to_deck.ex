defmodule Manavault.Catalog.Decks.AddCollectionItemToDeck do
  @moduledoc false

  alias Manavault.Catalog.{CollectionItem, Deck}
  alias Manavault.Catalog.Decks.{AddCardToDeck, DeckCardAllocation, FetchDeckRecords}
  alias Manavault.Repo

  def run(%Deck{} = deck, %CollectionItem{} = item, zone \\ "mainboard") do
    Repo.transact(fn ->
      item = Repo.preload(item, printing: :card)

      attrs = %{
        "oracle_id" => item.printing.card.oracle_id,
        "preferred_printing_id" => item.scryfall_id,
        "finish" => item.finish,
        "quantity" => 1,
        "zone" => zone
      }

      with {:ok, deck_card} <- AddCardToDeck.run(deck, attrs),
           {:ok, _allocation} <-
             DeckCardAllocation.allocate_collection_item_to_deck_card(deck_card.id, item.id, 1) do
        {:ok, FetchDeckRecords.preload_deck_card(deck_card)}
      end
    end)
  end
end
