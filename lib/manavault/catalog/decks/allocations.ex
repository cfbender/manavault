defmodule Manavault.Catalog.Decks.Allocations do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{
    Collection,
    CollectionItem,
    Deck,
    DeckAllocation,
    DeckCard,
    Location,
    Util
  }

  alias Manavault.Catalog.Decks.{AllocationItems, AllocationStatus, Preloads}
  alias Manavault.Repo

  def allocate_collection_item_to_deck_card(deck_card_id, collection_item_id, quantity \\ 1) do
    quantity = Util.parse_quantity(quantity)

    Repo.transaction(fn ->
      deck_card =
        DeckCard |> Repo.get!(deck_card_id) |> Repo.preload([:deck, :preferred_printing])

      item = Collection.get_collection_item!(collection_item_id)

      with :ok <- validate_collection_item_matches_deck_card(item, deck_card),
           :ok <- validate_deck_card_allocation_room(deck_card, item, quantity) do
        source_location_id = item.location_id
        allocated_item = AllocationItems.move_to_deck!(item, quantity)

        allocation =
          Repo.one(
            from allocation in DeckAllocation,
              where:
                allocation.deck_card_id == ^deck_card.id and
                  allocation.collection_item_id == ^allocated_item.id,
              limit: 1
          )

        attrs = %{
          "deck_card_id" => deck_card.id,
          "collection_item_id" => allocated_item.id,
          "source_location_id" => source_location_id,
          "quantity" => quantity
        }

        result =
          case allocation do
            nil ->
              %DeckAllocation{}
              |> DeckAllocation.changeset(attrs)
              |> Repo.insert()

            %DeckAllocation{} = allocation ->
              allocation
              |> DeckAllocation.changeset(%{"quantity" => allocation.quantity + quantity})
              |> Repo.update()
          end

        case result do
          {:ok, allocation} -> allocation
          {:error, changeset} -> Repo.rollback(changeset)
        end
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  def deallocate_collection_item_from_deck_card(deck_card_id, collection_item_id, quantity \\ 1) do
    quantity = Util.parse_quantity(quantity)

    Repo.transaction(fn ->
      allocation =
        Repo.one(
          from allocation in DeckAllocation,
            where:
              allocation.deck_card_id == ^deck_card_id and
                allocation.collection_item_id == ^collection_item_id,
            limit: 1
        )

      case allocation do
        nil ->
          Repo.rollback(:allocation_not_found)

        %DeckAllocation{quantity: allocation_quantity} when allocation_quantity <= quantity ->
          allocation = Repo.preload(allocation, :collection_item)

          AllocationItems.restore_from_deck!(
            allocation.collection_item,
            allocation_quantity,
            allocation.source_location_id
          )

          case Repo.delete(allocation) do
            {:ok, _allocation} -> allocation
            {:error, changeset} -> Repo.rollback(changeset)
          end

        %DeckAllocation{} = allocation ->
          allocation = Repo.preload(allocation, :collection_item)

          AllocationItems.restore_from_deck!(
            allocation.collection_item,
            quantity,
            allocation.source_location_id
          )

          case allocation
               |> DeckAllocation.changeset(%{"quantity" => allocation.quantity - quantity})
               |> Repo.update() do
            {:ok, updated_allocation} -> updated_allocation
            {:error, changeset} -> Repo.rollback(changeset)
          end
      end
    end)
  end

  def allocate_proxy_to_deck_card(deck_card_id, quantity \\ 1) do
    quantity = Util.parse_quantity(quantity)

    Repo.transaction(fn ->
      deck_card =
        DeckCard
        |> Repo.get!(deck_card_id)
        |> Repo.preload([:deck, :preferred_printing, card: []])

      with :ok <- validate_positive_allocation_quantity(quantity),
           :ok <- validate_deck_card_proxy_allocation_room(deck_card, quantity) do
        deck_card
        |> put_deck_card_proxy_quantity((deck_card.proxy_quantity || 0) + quantity)
        |> case do
          {:ok, deck_card} -> deck_card
          {:error, changeset} -> Repo.rollback(changeset)
        end
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  def deallocate_proxy_from_deck_card(deck_card_id, quantity \\ 1) do
    quantity = Util.parse_quantity(quantity)

    Repo.transaction(fn ->
      deck_card = Repo.get!(DeckCard, deck_card_id)
      proxy_quantity = deck_card.proxy_quantity || 0

      with :ok <- validate_positive_allocation_quantity(quantity),
           :ok <- validate_deck_card_proxy_deallocation(deck_card, quantity) do
        next_quantity = max(proxy_quantity - quantity, 0)

        deck_card
        |> put_deck_card_proxy_quantity(next_quantity)
        |> case do
          {:ok, deck_card} -> deck_card
          {:error, changeset} -> Repo.rollback(changeset)
        end
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  def bulk_allocate_deck(%Deck{} = deck, mode)
      when mode in [:exact_printings, :matching_printings] do
    with {:ok, preview} <- preview_bulk_allocate_deck(deck, mode) do
      result =
        Enum.reduce(preview.entries, %{allocated: 0, cards: MapSet.new(), skipped: 0}, fn entry,
                                                                                          counts ->
          case allocate_collection_item_to_deck_card(
                 entry.deck_card.id,
                 entry.item.id,
                 entry.quantity
               ) do
            {:ok, _allocation} ->
              counts
              |> update_in([:allocated], &(&1 + entry.quantity))
              |> update_in([:cards], &MapSet.put(&1, entry.deck_card.id))

            {:error, _reason} ->
              update_in(counts, [:skipped], &(&1 + 1))
          end
        end)

      {:ok,
       %{allocated: result.allocated, cards: MapSet.size(result.cards), skipped: result.skipped}}
    end
  end

  def bulk_allocate_deck(%Deck{} = deck, mode) when is_binary(mode) do
    case mode do
      "exact_printings" -> bulk_allocate_deck(deck, :exact_printings)
      "matching_printings" -> bulk_allocate_deck(deck, :matching_printings)
      _other -> {:error, :invalid_allocation_mode}
    end
  end

  def preview_bulk_allocate_deck(%Deck{} = deck, mode)
      when mode in [:exact_printings, :matching_printings] do
    deck = Repo.preload(deck, Preloads.deck_preloads(), force: true)

    preview =
      deck.deck_cards
      |> Enum.reduce(%{allocated: 0, cards: MapSet.new(), skipped: 0, entries: []}, fn deck_card,
                                                                                       preview ->
        entries = bulk_allocate_deck_card_preview(deck_card, mode)

        if entries == [] do
          update_in(preview, [:skipped], &(&1 + 1))
        else
          allocated = Enum.reduce(entries, 0, &(&1.quantity + &2))

          preview
          |> update_in([:allocated], &(&1 + allocated))
          |> update_in([:cards], &MapSet.put(&1, deck_card.id))
          |> update_in([:entries], &(&1 ++ entries))
        end
      end)

    {:ok, %{preview | cards: MapSet.size(preview.cards)} |> Map.put(:mode, mode)}
  end

  def preview_bulk_allocate_deck(%Deck{} = deck, mode) when is_binary(mode) do
    case mode do
      "exact_printings" -> preview_bulk_allocate_deck(deck, :exact_printings)
      "matching_printings" -> preview_bulk_allocate_deck(deck, :matching_printings)
      _other -> {:error, :invalid_allocation_mode}
    end
  end

  defp validate_collection_item_matches_deck_card(
         %CollectionItem{} = item,
         %DeckCard{} = deck_card
       ) do
    item = Repo.preload(item, [:printing, :location_assoc])

    cond do
      match?(%Location{kind: "list"}, item.location_assoc) -> {:error, :allocation_list_location}
      item.printing.oracle_id != deck_card.oracle_id -> {:error, :allocation_card_mismatch}
      item.finish != deck_card.finish -> {:error, :allocation_finish_mismatch}
      true -> :ok
    end
  end

  defp validate_deck_card_allocation_room(
         %DeckCard{} = deck_card,
         %CollectionItem{} = item,
         quantity
       ) do
    status = AllocationStatus.deck_card_allocation_status(deck_card)
    candidate = Enum.find(status.candidates, &(&1.item.id == item.id))

    cond do
      is_nil(candidate) ->
        {:error, :allocation_card_mismatch}

      candidate.available < quantity ->
        {:error, :not_enough_available}

      status.allocated + quantity > status.required ->
        {:error, :deck_card_already_allocated}

      true ->
        :ok
    end
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

  defp bulk_allocate_deck_card_preview(%DeckCard{} = deck_card, mode) do
    status = AllocationStatus.deck_card_allocation_status(deck_card)
    needed = max(status.required - status.allocated, 0)

    status.candidates
    |> Enum.filter(&bulk_allocation_candidate?(&1, deck_card, mode))
    |> Enum.reduce_while({0, []}, fn candidate, {allocated, entries} ->
      remaining = needed - allocated

      if remaining <= 0 do
        {:halt, {allocated, entries}}
      else
        quantity = min(remaining, candidate.available)

        entry = %{
          deck_card: deck_card,
          item: candidate.item,
          quantity: quantity,
          exact?: candidate.item.scryfall_id == deck_card.preferred_printing_id
        }

        {:cont, {allocated + quantity, entries ++ [entry]}}
      end
    end)
    |> elem(1)
  end

  defp bulk_allocation_candidate?(%{available: available}, _deck_card, _mode)
       when available <= 0,
       do: false

  defp bulk_allocation_candidate?(%{item: item}, %DeckCard{} = deck_card, :exact_printings) do
    is_binary(deck_card.preferred_printing_id) and
      item.scryfall_id == deck_card.preferred_printing_id
  end

  defp bulk_allocation_candidate?(_candidate, _deck_card, :matching_printings), do: true
end
