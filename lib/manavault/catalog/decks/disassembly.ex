defmodule Manavault.Catalog.Decks.Disassembly do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{
    CollectionItem,
    Deck,
    DeckAllocation,
    DeckCard,
    Location,
    Printing,
    Util
  }

  alias Manavault.Catalog.Decks.AllocationItems
  alias Manavault.Repo

  def preview_deck_disassembly(%Deck{} = deck) do
    {:ok, deck |> load_deck_for_disassembly!() |> disassembly_result(true)}
  end

  def disassemble_deck(%Deck{} = deck) do
    Repo.transact(fn ->
      deck = load_deck_for_disassembly!(deck)
      result = disassembly_result(deck, false)

      Enum.each(deck.deck_cards, fn deck_card ->
        Enum.each(deck_card.deck_allocations, fn allocation ->
          AllocationItems.restore_from_deck!(
            allocation.collection_item,
            allocation.quantity,
            allocation.source_location_id
          )

          delete_or_rollback!(allocation)
        end)

        delete_or_rollback!(deck_card)
      end)

      delete_or_rollback!(deck)

      {:ok, result}
    end)
  end

  defp load_deck_for_disassembly!(%Deck{id: id}) do
    Deck
    |> where([deck], deck.id == ^id)
    |> preload(deck_cards: ^deck_cards_query())
    |> Repo.one!()
  end

  defp deck_cards_query do
    from deck_card in DeckCard,
      join: card in assoc(deck_card, :card),
      order_by: [asc: card.name, asc: card.oracle_id, asc: deck_card.id],
      preload: [card: card, preferred_printing: [], deck_allocations: ^deck_allocations_query()]
  end

  defp deck_allocations_query do
    from allocation in DeckAllocation,
      order_by: [asc: allocation.id],
      preload: [collection_item: ^collection_items_query(), source_location: []]
  end

  defp collection_items_query do
    from item in CollectionItem,
      preload: [printing: :card]
  end

  defp disassembly_result(%Deck{} = deck, dry_run?) do
    moves = moves(deck)
    checked_count = checked_count(deck)
    moved_count = moved_count(moves)

    %{
      checked_count: checked_count,
      moved_count: moved_count,
      skipped_count: max(checked_count - moved_count, 0),
      dry_run: dry_run?,
      moves: moves
    }
  end

  defp checked_count(%Deck{deck_cards: deck_cards}) do
    Enum.reduce(deck_cards, 0, fn deck_card, total -> total + deck_card.quantity end)
  end

  defp moved_count(moves) do
    Enum.reduce(moves, 0, fn move, total -> total + move.quantity end)
  end

  defp moves(%Deck{} = deck) do
    for deck_card <- deck.deck_cards,
        allocation <- deck_card.deck_allocations do
      move(deck, deck_card, allocation)
    end
  end

  defp move(%Deck{} = deck, %DeckCard{} = deck_card, %DeckAllocation{} = allocation) do
    collection_item = allocation.collection_item

    %{
      collection_item_id: allocation.collection_item_id,
      card_name: deck_card.card.name,
      card_id: deck_card.card.oracle_id,
      image_url: image_url(collection_item.printing),
      quantity: allocation.quantity,
      finish: collection_item.finish,
      from_location_id: deck.id,
      from_location_name: deck.name || "Deck",
      to_location_id: allocation.source_location_id,
      to_location_name: location_name(allocation.source_location)
    }
  end

  defp image_url(%Printing{image_uris: image_uris}) do
    image_uris
    |> Util.decode_json(%{})
    |> image_url()
  end

  defp image_url(%{} = image_uris) do
    image_uris["normal"] || image_uris["large"] || image_uris["small"] || image_uris["png"]
  end

  defp image_url([first | _rest]), do: image_url(first)
  defp image_url(_image_uris), do: nil

  defp location_name(%Location{name: name}), do: name
  defp location_name(_location), do: "Unfiled"

  defp delete_or_rollback!(struct) do
    case Repo.delete(struct) do
      {:ok, deleted} -> deleted
      {:error, changeset} -> Repo.rollback(changeset)
    end
  end
end
