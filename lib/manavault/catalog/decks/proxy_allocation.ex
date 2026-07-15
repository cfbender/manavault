defmodule Manavault.Catalog.Decks.ProxyAllocation do
  @moduledoc false

  alias Manavault.Catalog.{DeckCard, Util}
  alias Manavault.Catalog.Decks.{AllocationStatus, EditGuard}
  alias Manavault.Repo

  def allocate_proxy_to_deck_card(deck_card_id, quantity \\ 1) do
    quantity = Util.parse_quantity(quantity)

    Repo.transact(fn ->
      deck_card =
        DeckCard
        |> Repo.get!(deck_card_id)
        |> Repo.preload([:deck, :preferred_printing, card: []])

      with :ok <- EditGuard.ensure_deck_card_editable(deck_card),
           :ok <- validate_positive_allocation_quantity(quantity),
           :ok <- validate_deck_card_proxy_allocation_room(deck_card, quantity) do
        put_deck_card_proxy_quantity(deck_card, (deck_card.proxy_quantity || 0) + quantity)
      end
    end)
  end

  def deallocate_proxy_from_deck_card(deck_card_id, quantity \\ 1) do
    quantity = Util.parse_quantity(quantity)

    Repo.transact(fn ->
      deck_card = DeckCard |> Repo.get!(deck_card_id) |> Repo.preload(:deck)
      proxy_quantity = deck_card.proxy_quantity || 0

      with :ok <- EditGuard.ensure_deck_card_editable(deck_card),
           :ok <- validate_positive_allocation_quantity(quantity),
           :ok <- validate_deck_card_proxy_deallocation(deck_card, quantity) do
        put_deck_card_proxy_quantity(deck_card, max(proxy_quantity - quantity, 0))
      end
    end)
  end

  defp validate_deck_card_proxy_allocation_room(%DeckCard{} = deck_card, quantity) do
    status = AllocationStatus.deck_card_allocation_status(deck_card)

    if status.allocated + quantity > status.required do
      {:error, :deck_card_already_allocated}
    else
      :ok
    end
  end

  defp validate_deck_card_proxy_deallocation(%DeckCard{} = deck_card, quantity) do
    proxy_quantity = deck_card.proxy_quantity || 0

    cond do
      proxy_quantity <= 0 -> {:error, :proxy_allocation_not_found}
      quantity > proxy_quantity -> {:error, :proxy_allocation_not_found}
      true -> :ok
    end
  end

  defp validate_positive_allocation_quantity(quantity) when quantity > 0, do: :ok

  defp validate_positive_allocation_quantity(_quantity),
    do: {:error, :invalid_allocation_quantity}

  defp put_deck_card_proxy_quantity(%DeckCard{} = deck_card, proxy_quantity) do
    deck_card
    |> DeckCard.changeset(%{"proxy_quantity" => proxy_quantity})
    |> Repo.update()
  end
end
