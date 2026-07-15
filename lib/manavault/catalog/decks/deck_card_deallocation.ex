defmodule Manavault.Catalog.Decks.DeckCardDeallocation do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.DeckCard
  alias Manavault.Catalog.Decks.{AllocationItems, EditGuard}
  alias Manavault.Repo

  def bulk_deallocate_deck_cards(deck_card_ids) when is_list(deck_card_ids) do
    deck_card_ids = Enum.uniq(deck_card_ids)

    Repo.transact(fn ->
      deck_cards = load_ordered_deck_cards(deck_card_ids)

      with :ok <- EditGuard.ensure_deck_cards_editable(deck_cards) do
        deck_cards =
          Enum.map(deck_cards, fn deck_card ->
            restore_allocations!(deck_card)
            clear_proxy!(deck_card)
          end)

        {:ok, Repo.preload(deck_cards, [:card, :preferred_printing], force: true)}
      end
    end)
  end

  defp load_ordered_deck_cards(deck_card_ids) do
    deck_cards_by_id =
      DeckCard
      |> where([deck_card], deck_card.id in ^deck_card_ids)
      |> Repo.all()
      |> Repo.preload([:deck, deck_allocations: [:collection_item]])
      |> Map.new(&{&1.id, &1})

    Enum.map(deck_card_ids, fn deck_card_id ->
      Map.get(deck_cards_by_id, deck_card_id) ||
        raise Ecto.NoResultsError, queryable: DeckCard
    end)
  end

  defp restore_allocations!(%DeckCard{deck_allocations: allocations} = deck_card) do
    Enum.each(allocations, fn allocation ->
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

    deck_card
  end

  defp clear_proxy!(%DeckCard{proxy_quantity: proxy_quantity} = deck_card)
       when proxy_quantity in [nil, 0],
       do: deck_card

  defp clear_proxy!(%DeckCard{} = deck_card) do
    case put_proxy_quantity(deck_card, 0) do
      {:ok, deck_card} -> deck_card
      {:error, changeset} -> Repo.rollback(changeset)
    end
  end

  defp put_proxy_quantity(%DeckCard{} = deck_card, proxy_quantity) do
    deck_card
    |> DeckCard.changeset(%{"proxy_quantity" => proxy_quantity})
    |> Repo.update()
  end
end
