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

    Repo.transact(fn ->
      deck_card =
        DeckCard |> Repo.get!(deck_card_id) |> Repo.preload([:deck, :preferred_printing])

      item = Collection.get_collection_item!(collection_item_id)

      with :ok <- validate_collection_item_matches_deck_card(item, deck_card),
           :ok <- validate_deck_card_allocation_room(deck_card, item, quantity),
           {:ok, deck_card} <- put_deck_card_allocation_printing(deck_card, item) do
        {:ok, insert_or_update_deck_allocation!(deck_card, item, quantity)}
      end
    end)
  end

  def bulk_add_collection_items_to_deck(deck_or_id, collection_item_ids, zone \\ "mainboard")

  def bulk_add_collection_items_to_deck(deck_or_id, [], _zone) do
    Repo.transact(fn ->
      load_deck!(deck_or_id)
      {:ok, []}
    end)
  end

  def bulk_add_collection_items_to_deck(deck_or_id, collection_item_ids, zone)
      when is_list(collection_item_ids) do
    with {:ok, item_ids} <- normalize_collection_item_ids(collection_item_ids) do
      Repo.transact(fn ->
        deck = load_deck!(deck_or_id)

        with {:ok, items} <- load_ordered_collection_items(item_ids),
             :ok <- validate_single_finish_per_card(items),
             {:ok, deck_cards_by_key} <- upsert_bulk_deck_cards(deck, items, zone),
             :ok <- validate_bulk_deck_card_allocation_room(items, deck_cards_by_key) do
          Enum.each(items, fn item ->
            unless basic_land_item?(item) do
              deck_card = Map.fetch!(deck_cards_by_key, collection_item_deck_card_key(item))
              insert_deck_allocation!(deck_card, item, 1)
            end
          end)

          deck_cards =
            deck_cards_by_key
            |> Map.values()
            |> Enum.sort_by(& &1.id)
            |> Repo.preload([:card, :preferred_printing], force: true)

          {:ok, deck_cards}
        end
      end)
    end
  end

  def deallocate_collection_item_from_deck_card(deck_card_id, collection_item_id, quantity \\ 1) do
    quantity = Util.parse_quantity(quantity)

    Repo.transact(fn ->
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
          {:error, :allocation_not_found}

        %DeckAllocation{quantity: allocation_quantity} when allocation_quantity <= quantity ->
          allocation = Repo.preload(allocation, :collection_item)

          AllocationItems.restore_from_deck!(
            allocation.collection_item,
            allocation_quantity,
            allocation.source_location_id
          )

          case Repo.delete(allocation) do
            {:ok, _allocation} -> {:ok, allocation}
            {:error, changeset} -> {:error, changeset}
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
            {:ok, updated_allocation} -> {:ok, updated_allocation}
            {:error, changeset} -> {:error, changeset}
          end
      end
    end)
  end

  def allocate_proxy_to_deck_card(deck_card_id, quantity \\ 1) do
    quantity = Util.parse_quantity(quantity)

    Repo.transact(fn ->
      deck_card =
        DeckCard
        |> Repo.get!(deck_card_id)
        |> Repo.preload([:deck, :preferred_printing, card: []])

      with :ok <- validate_positive_allocation_quantity(quantity),
           :ok <- validate_deck_card_proxy_allocation_room(deck_card, quantity),
           {:ok, deck_card} <-
             put_deck_card_proxy_quantity(deck_card, (deck_card.proxy_quantity || 0) + quantity) do
        {:ok, deck_card}
      end
    end)
  end

  def deallocate_proxy_from_deck_card(deck_card_id, quantity \\ 1) do
    quantity = Util.parse_quantity(quantity)

    Repo.transact(fn ->
      deck_card = Repo.get!(DeckCard, deck_card_id)
      proxy_quantity = deck_card.proxy_quantity || 0

      with :ok <- validate_positive_allocation_quantity(quantity),
           :ok <- validate_deck_card_proxy_deallocation(deck_card, quantity),
           {:ok, deck_card} <-
             put_deck_card_proxy_quantity(deck_card, max(proxy_quantity - quantity, 0)) do
        {:ok, deck_card}
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
        status = AllocationStatus.deck_card_allocation_status(deck_card)
        needed = max(status.required - status.allocated, 0)
        entries = bulk_allocate_deck_card_preview(deck_card, mode, status, needed)

        cond do
          needed == 0 ->
            preview

          entries == [] ->
            update_in(preview, [:skipped], &(&1 + 1))

          true ->
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

  defp load_deck!(%Deck{id: id}), do: Repo.get!(Deck, id)
  defp load_deck!(id), do: Repo.get!(Deck, id)

  defp normalize_collection_item_ids(collection_item_ids) do
    result =
      Enum.reduce_while(collection_item_ids, {:ok, []}, fn item_id, {:ok, item_ids} ->
        case normalize_collection_item_id(item_id) do
          {:ok, item_id} -> {:cont, {:ok, [item_id | item_ids]}}
          :error -> {:halt, {:error, :collection_item_not_found}}
        end
      end)

    case result do
      {:ok, item_ids} -> {:ok, item_ids |> Enum.reverse() |> Enum.uniq()}
      {:error, reason} -> {:error, reason}
    end
  end

  defp normalize_collection_item_id(item_id) when is_integer(item_id) and item_id > 0,
    do: {:ok, item_id}

  defp normalize_collection_item_id(item_id) when is_binary(item_id) do
    case Integer.parse(item_id) do
      {item_id, ""} when item_id > 0 -> {:ok, item_id}
      _invalid -> :error
    end
  end

  defp normalize_collection_item_id(_item_id), do: :error

  defp load_ordered_collection_items(item_ids) do
    items = load_collection_items(item_ids)

    with :ok <- validate_collection_items_loaded(items, item_ids) do
      items_by_id = Map.new(items, &{&1.id, &1})
      {:ok, Enum.map(item_ids, &Map.fetch!(items_by_id, &1))}
    end
  end

  defp load_collection_items(item_ids) do
    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:inner, [_item, printing], card in assoc(printing, :card))
    |> join(:left, [item, _printing, _card], location in assoc(item, :location_assoc))
    |> where([item, _printing, _card, _location], item.id in ^item_ids)
    |> preload([_item, printing, card, location],
      printing: {printing, card: card},
      location_assoc: location
    )
    |> Repo.all()
  end

  defp validate_collection_items_loaded(items, item_ids) do
    loaded_ids =
      items
      |> Enum.map(& &1.id)
      |> MapSet.new()

    if Enum.all?(item_ids, &MapSet.member?(loaded_ids, &1)) do
      :ok
    else
      {:error, :collection_item_not_found}
    end
  end

  defp validate_single_finish_per_card(items) do
    items
    |> Enum.group_by(fn item -> item.printing.oracle_id end)
    |> Enum.reduce_while(:ok, fn {_oracle_id, grouped_items}, :ok ->
      finish_count =
        grouped_items
        |> Enum.map(& &1.finish)
        |> Enum.uniq()
        |> length()

      if finish_count == 1 do
        {:cont, :ok}
      else
        {:halt, {:error, :allocation_finish_mismatch}}
      end
    end)
  end

  defp upsert_bulk_deck_cards(%Deck{id: deck_id}, items, zone) do
    existing_by_oracle_id = existing_bulk_deck_cards(deck_id, items, zone)

    items
    |> Enum.group_by(&collection_item_deck_card_key/1)
    |> Enum.reduce_while({:ok, %{}}, fn {{oracle_id, finish} = key, grouped_items},
                                        {:ok, deck_cards_by_key} ->
      result =
        case Map.get(existing_by_oracle_id, oracle_id) do
          nil ->
            insert_bulk_deck_card(deck_id, oracle_id, finish, grouped_items, zone)

          %DeckCard{finish: ^finish} = deck_card ->
            update_bulk_deck_card(deck_card, finish, grouped_items)

          %DeckCard{} ->
            {:error, :allocation_finish_mismatch}
        end

      case result do
        {:ok, deck_card} -> {:cont, {:ok, Map.put(deck_cards_by_key, key, deck_card)}}
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
  end

  defp existing_bulk_deck_cards(deck_id, items, zone) do
    oracle_ids =
      items
      |> Enum.map(fn item -> item.printing.oracle_id end)
      |> Enum.uniq()

    DeckCard
    |> where(
      [deck_card],
      deck_card.deck_id == ^deck_id and deck_card.zone == ^zone and
        deck_card.oracle_id in ^oracle_ids
    )
    |> Repo.all()
    |> Map.new(&{&1.oracle_id, &1})
  end

  defp insert_bulk_deck_card(deck_id, oracle_id, finish, grouped_items, zone) do
    attrs = %{
      "deck_id" => deck_id,
      "oracle_id" => oracle_id,
      "preferred_printing_id" => List.first(grouped_items).scryfall_id,
      "quantity" => length(grouped_items),
      "zone" => zone,
      "finish" => finish
    }

    %DeckCard{}
    |> DeckCard.changeset(attrs)
    |> Repo.insert()
  end

  defp update_bulk_deck_card(%DeckCard{} = deck_card, finish, grouped_items) do
    attrs = %{
      "quantity" => deck_card.quantity + length(grouped_items),
      "finish" => finish,
      "preferred_printing_id" => List.first(grouped_items).scryfall_id
    }

    deck_card
    |> DeckCard.changeset(attrs)
    |> Repo.update()
  end

  defp validate_bulk_deck_card_allocation_room(items, deck_cards_by_key) do
    allocatable_items = Enum.reject(items, &basic_land_item?/1)

    deck_cards_with_status =
      deck_cards_by_key
      |> Map.values()
      |> AllocationStatus.put_deck_card_allocation_statuses()

    statuses_by_id = Map.new(deck_cards_with_status, &{&1.id, &1.allocation_status})

    with :ok <-
           validate_bulk_deck_card_capacity(allocatable_items, deck_cards_by_key, statuses_by_id) do
      validate_bulk_collection_item_candidates(
        allocatable_items,
        deck_cards_by_key,
        statuses_by_id
      )
    end
  end

  defp validate_bulk_deck_card_capacity(items, deck_cards_by_key, statuses_by_id) do
    items
    |> Enum.reduce(%{}, fn item, counts ->
      deck_card = Map.fetch!(deck_cards_by_key, collection_item_deck_card_key(item))
      Map.update(counts, deck_card.id, 1, &(&1 + 1))
    end)
    |> Enum.reduce_while(:ok, fn {deck_card_id, quantity}, :ok ->
      status = Map.fetch!(statuses_by_id, deck_card_id)

      if status.allocated + quantity > status.required do
        {:halt, {:error, :deck_card_already_allocated}}
      else
        {:cont, :ok}
      end
    end)
  end

  defp validate_bulk_collection_item_candidates(items, deck_cards_by_key, statuses_by_id) do
    Enum.reduce_while(items, :ok, fn item, :ok ->
      deck_card = Map.fetch!(deck_cards_by_key, collection_item_deck_card_key(item))
      status = Map.fetch!(statuses_by_id, deck_card.id)
      candidate = Enum.find(status.candidates, &(&1.item.id == item.id))

      case validate_loaded_collection_item_matches_deck_card(item, deck_card) do
        :ok ->
          cond do
            is_nil(candidate) ->
              {:halt, {:error, :allocation_card_mismatch}}

            candidate.available < 1 ->
              {:halt, {:error, :not_enough_available}}

            true ->
              {:cont, :ok}
          end

        {:error, reason} ->
          {:halt, {:error, reason}}
      end
    end)
  end

  defp collection_item_deck_card_key(%CollectionItem{} = item) do
    {item.printing.oracle_id, item.finish}
  end

  defp basic_land_item?(%CollectionItem{printing: %{card: %{type_line: type_line}}})
       when is_binary(type_line) do
    String.contains?(type_line, "Basic Land")
  end

  defp basic_land_item?(_item), do: false

  defp insert_deck_allocation!(
         %DeckCard{} = deck_card,
         %CollectionItem{} = item,
         quantity
       ) do
    source_location_id = item.location_id
    allocated_item = AllocationItems.move_to_deck!(item, quantity)

    attrs = %{
      "deck_card_id" => deck_card.id,
      "collection_item_id" => allocated_item.id,
      "source_location_id" => source_location_id,
      "quantity" => quantity
    }

    case %DeckAllocation{}
         |> DeckAllocation.changeset(attrs)
         |> Repo.insert() do
      {:ok, allocation} -> allocation
      {:error, changeset} -> Repo.rollback(changeset)
    end
  end

  defp insert_or_update_deck_allocation!(
         %DeckCard{} = deck_card,
         %CollectionItem{} = item,
         quantity
       ) do
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
  end

  defp validate_collection_item_matches_deck_card(
         %CollectionItem{} = item,
         %DeckCard{} = deck_card
       ) do
    item =
      Repo.preload(item,
        printing: [:card],
        location_assoc: []
      )

    validate_loaded_collection_item_matches_deck_card(item, deck_card)
  end

  defp validate_loaded_collection_item_matches_deck_card(
         %CollectionItem{} = item,
         %DeckCard{} = deck_card
       ) do
    cond do
      match?(%Location{kind: "list"}, item.location_assoc) -> {:error, :allocation_list_location}
      item.printing.oracle_id != deck_card.oracle_id -> {:error, :allocation_card_mismatch}
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

  defp put_deck_card_allocation_printing(%DeckCard{} = deck_card, %CollectionItem{} = item) do
    deck_card
    |> DeckCard.changeset(%{"preferred_printing_id" => item.scryfall_id, "finish" => item.finish})
    |> Repo.update()
  end

  defp bulk_allocate_deck_card_preview(%DeckCard{} = deck_card, mode, status, needed) do
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
