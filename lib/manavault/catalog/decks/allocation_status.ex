defmodule Manavault.Catalog.Decks.AllocationStatus do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, CollectionItem, Deck, DeckAllocation, DeckCard}
  alias Manavault.Catalog.Decks.Preloads
  alias Manavault.Repo

  # Physical allocations make a collection item unavailable regardless of deck status.
  # Deck status still controls higher-level reserve policy, but one physical copy cannot be pulled twice.

  def deck_allocation_status(%Deck{} = deck) do
    deck
    |> Repo.preload(Preloads.deck_preloads(), force: true)
    |> Map.fetch!(:deck_cards)
    |> put_deck_card_allocation_statuses()
    |> Map.new(fn deck_card ->
      {deck_card.id, deck_card.allocation_status}
    end)
  end

  def deck_card_allocation_status(%DeckCard{} = deck_card) do
    deck_card = load_deck_card_for_allocation_status(deck_card)

    deck_card_allocation_status(
      deck_card,
      deck_card_collection_candidates(deck_card),
      current_allocation_counts(deck_card.id),
      other_reserving_allocation_counts(deck_card)
    )
  end

  def put_deck_card_allocation_statuses([]), do: []

  def put_deck_card_allocation_statuses(deck_cards) when is_list(deck_cards) do
    statuses_by_id = deck_card_allocation_statuses(deck_cards)

    Enum.map(deck_cards, fn
      %DeckCard{id: id} = deck_card when is_integer(id) ->
        %{deck_card | allocation_status: Map.fetch!(statuses_by_id, id)}

      %DeckCard{} = deck_card ->
        %{deck_card | allocation_status: deck_card_allocation_status(deck_card)}
    end)
  end

  defp deck_card_allocation_statuses(deck_cards) do
    persisted_cards = Enum.filter(deck_cards, &is_integer(&1.id))
    deck_card_ids = Enum.map(persisted_cards, & &1.id)
    keys = persisted_cards |> Enum.map(&deck_card_allocation_key/1) |> Enum.uniq()
    candidates_by_key = deck_card_collection_candidates_by_key(keys)
    {current_allocations_by_card_id, reserving_allocations_by_key} =
      allocation_counts_by_card_id_and_key(deck_card_ids, keys)

    Map.new(persisted_cards, fn deck_card ->
      key = deck_card_allocation_key(deck_card)
      current_allocations = Map.get(current_allocations_by_card_id, deck_card.id, %{})

      other_allocations =
        reserving_allocations_by_key
        |> Map.get(key, [])
        |> other_allocation_counts(deck_card.id)

      candidates =
        candidates_by_key
        |> Map.get(key, [])
        |> sort_candidates_for_deck_card(deck_card)

      {deck_card.id,
       deck_card_allocation_status(deck_card, candidates, current_allocations, other_allocations)}
    end)
  end

  defp deck_card_allocation_status(
         %DeckCard{} = deck_card,
         candidates,
         current_allocations,
         other_allocations
       ) do
    owned = Enum.reduce(candidates, 0, &(&1.quantity + &2))
    proxy_allocated = deck_card.proxy_quantity || 0
    physical_allocated = current_allocations |> Map.values() |> Enum.sum()
    allocated = allocation_allocated(deck_card, physical_allocated, proxy_allocated)
    allocated_elsewhere = other_allocations |> Map.values() |> Enum.sum()

    available =
      Enum.reduce(candidates, 0, fn item, total ->
        current = Map.get(current_allocations, item.id, 0)
        elsewhere = Map.get(other_allocations, item.id, 0)
        total + max(item.quantity - current - elsewhere, 0)
      end)

    missing = allocation_missing(deck_card, allocated, available)

    %{
      state: allocation_state(deck_card, allocated, available, owned),
      required: deck_card.quantity,
      owned: owned,
      allocated: allocated,
      proxy_allocated: proxy_allocated,
      available: available,
      allocated_elsewhere: allocated_elsewhere,
      missing: missing,
      candidates:
        Enum.map(candidates, fn item ->
          current = Map.get(current_allocations, item.id, 0)
          elsewhere = Map.get(other_allocations, item.id, 0)

          %{
            item: item,
            allocated: current,
            allocated_elsewhere: elsewhere,
            available: max(item.quantity - current - elsewhere, 0)
          }
        end)
    }
  end

  defp load_deck_card_for_allocation_status(%DeckCard{id: nil} = deck_card) do
    Repo.preload(deck_card, [:deck, :preferred_printing, card: [], deck_allocations: []])
  end

  defp load_deck_card_for_allocation_status(%DeckCard{id: id}) do
    DeckCard
    |> Repo.get!(id)
    |> Repo.preload([:deck, :preferred_printing, card: [], deck_allocations: []])
  end

  defp deck_card_collection_candidates(%DeckCard{} = deck_card) do
    preferred_printing_id = deck_card.preferred_printing_id
    oracle_id = deck_card.oracle_id

    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:inner, [_item, printing], card in assoc(printing, :card))
    |> join(:left, [item, _printing, _card], location in assoc(item, :location_assoc))
    |> where(
      [_item, printing, _card, _location],
      printing.oracle_id == ^oracle_id
    )
    |> where([_item, _printing, _card, location], is_nil(location.id) or location.kind != "list")
    |> preload([_item, printing, card, location],
      printing: {printing, card: card},
      location_assoc: location
    )
    |> order_by([item, printing, card, _location],
      desc: fragment("? = ?", item.scryfall_id, ^preferred_printing_id),
      asc: card.name,
      asc: printing.set_code,
      asc: printing.collector_number,
      asc: item.id
    )
    |> Repo.all()
  end

  defp deck_card_collection_candidates_by_key([]), do: %{}

  defp deck_card_collection_candidates_by_key(oracle_ids) do
    oracle_ids = Enum.uniq(oracle_ids)

    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:inner, [_item, printing], card in assoc(printing, :card))
    |> join(:left, [item, _printing, _card], location in assoc(item, :location_assoc))
    |> where(
      [_item, printing, _card, _location],
      printing.oracle_id in ^oracle_ids
    )
    |> where([_item, _printing, _card, location], is_nil(location.id) or location.kind != "list")
    |> preload([_item, printing, card, location],
      printing: {printing, card: card},
      location_assoc: location
    )
    |> order_by([item, printing, card, _location],
      asc: card.name,
      asc: printing.set_code,
      asc: printing.collector_number,
      asc: item.id
    )
    |> Repo.all()
    |> Enum.group_by(fn item -> item.printing.oracle_id end)
  end

  defp sort_candidates_for_deck_card(candidates, %DeckCard{} = deck_card) do
    Enum.sort_by(candidates, fn item ->
      {
        if(item.scryfall_id == deck_card.preferred_printing_id, do: 0, else: 1),
        item.printing.card.name,
        item.printing.set_code || "",
        item.printing.collector_number || "",
        item.id
      }
    end)
  end

  defp deck_card_allocation_key(%DeckCard{} = deck_card) do
    deck_card.oracle_id
  end

  defp current_allocation_counts(deck_card_id) do
    DeckAllocation
    |> where([allocation], allocation.deck_card_id == ^deck_card_id)
    |> group_by([allocation], allocation.collection_item_id)
    |> select([allocation], {allocation.collection_item_id, sum(allocation.quantity)})
    |> Repo.all()
    |> Map.new()
  end

  defp allocation_counts_by_card_id_and_key([], _oracle_ids), do: {%{}, %{}}

  defp allocation_counts_by_card_id_and_key(deck_card_ids, oracle_ids) do
    deck_card_id_set = MapSet.new(deck_card_ids)
    oracle_ids = Enum.uniq(oracle_ids)

    allocations =
      DeckAllocation
      |> join(:inner, [allocation], allocated_card in assoc(allocation, :deck_card))
      |> where(
        [_allocation, allocated_card],
        allocated_card.id in ^deck_card_ids or allocated_card.oracle_id in ^oracle_ids
      )
      |> group_by(
        [allocation, allocated_card],
        [
          allocated_card.id,
          allocated_card.oracle_id,
          allocation.collection_item_id
        ]
      )
      |> select(
        [allocation, allocated_card],
        {
          allocated_card.id,
          allocated_card.oracle_id,
          allocation.collection_item_id,
          sum(allocation.quantity)
        }
      )
      |> Repo.all()

    current_allocations_by_card_id =
      Enum.reduce(allocations, %{}, fn {deck_card_id, _oracle_id, collection_item_id, quantity},
                                       acc ->
        if MapSet.member?(deck_card_id_set, deck_card_id) do
          Map.update(acc, deck_card_id, %{collection_item_id => quantity}, fn counts ->
            Map.put(counts, collection_item_id, quantity)
          end)
        else
          acc
        end
      end)

    reserving_allocations_by_key =
      allocations
      |> Enum.reject(fn {_deck_card_id, oracle_id, _collection_item_id, _quantity} ->
        is_nil(oracle_id)
      end)
      |> Enum.group_by(fn {_deck_card_id, oracle_id, _collection_item_id, _quantity} ->
        oracle_id
      end)

    {current_allocations_by_card_id, reserving_allocations_by_key}
  end

  defp other_allocation_counts(reserving_allocations, deck_card_id) do
    reserving_allocations
    |> Enum.reject(fn {reserving_deck_card_id, _oracle_id, _collection_item_id, _quantity} ->
      reserving_deck_card_id == deck_card_id
    end)
    |> Enum.reduce(%{}, fn {_reserving_deck_card_id, _oracle_id, collection_item_id, quantity},
                           acc ->
      Map.update(acc, collection_item_id, quantity, &(&1 + quantity))
    end)
  end

  defp allocation_allocated(%DeckCard{} = deck_card, physical_allocated, proxy_allocated) do
    if is_basic_land?(deck_card) do
      deck_card.quantity
    else
      physical_allocated + proxy_allocated
    end
  end

  defp allocation_missing(%DeckCard{} = deck_card, allocated, available) do
    if is_basic_land?(deck_card) do
      0
    else
      max(deck_card.quantity - allocated - available, 0)
    end
  end

  defp allocation_state(%DeckCard{} = deck_card, allocated, available, owned) do
    cond do
      is_basic_land?(deck_card) -> :basic_land
      allocated >= deck_card.quantity -> :allocated
      allocated + available >= deck_card.quantity -> :available
      allocated > 0 or owned > 0 -> :partial
      true -> :missing
    end
  end

  defp is_basic_land?(%DeckCard{card: %Card{type_line: type_line}}) when is_binary(type_line) do
    String.contains?(type_line, "Basic Land")
  end

  defp is_basic_land?(_deck_card), do: false
end
