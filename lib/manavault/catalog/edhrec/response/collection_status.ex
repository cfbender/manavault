defmodule Manavault.Catalog.EDHRec.Response.CollectionStatus do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, CollectionItem, DeckAllocation, DeckCard}
  alias Manavault.Catalog.Decks.AllocationStatus
  alias Manavault.Repo

  # For a card that's already in the deck, reuse the canonical deck-card
  # allocation status and present it as "allocated" with its zone.
  def status(_local_card, %DeckCard{} = deck_card) do
    deck_card
    |> AllocationStatus.deck_card_allocation_status()
    |> Map.put(:state, :allocated)
    |> Map.put(:deck_zone, deck_card.zone)
    |> stringify_status()
  end

  def status(%Card{} = card, _deck_card) do
    card_status(
      card,
      collection_candidates(card.oracle_id),
      allocation_counts_for_oracle_id(card.oracle_id)
    )
  end

  def status(_local_card, _deck_card) do
    missing_status()
  end

  # Batched variant: same result as status/2 but reuses collection candidates and
  # allocation counts already fetched for the whole response (see
  # candidates_by_oracle_ids/1 and allocation_counts_by_oracle_ids/1), avoiding a
  # per-card pair of queries. The deck-card and missing branches ignore the
  # prefetched data.
  def status(_local_card, %DeckCard{} = deck_card, _prefetched) do
    status(nil, deck_card)
  end

  def status(%Card{} = card, _deck_card, prefetched) do
    %{candidates: candidates, allocations: allocations} =
      Map.get(prefetched, card.oracle_id, %{candidates: [], allocations: %{}})

    card_status(card, candidates, allocations)
  end

  def status(_local_card, _deck_card, _prefetched) do
    missing_status()
  end

  defp card_status(%Card{} = card, candidates, other_allocations) do
    owned = Enum.reduce(candidates, 0, &(&1.quantity + &2))

    allocated_elsewhere =
      other_allocations
      |> Map.values()
      |> Enum.sum()

    available =
      Enum.reduce(candidates, 0, fn item, total ->
        elsewhere = Map.get(other_allocations, item.id, 0)
        total + max(item.quantity - elsewhere, 0)
      end)

    allocated = if basic_land?(card), do: 1, else: 0

    %{
      state: collection_state(card, available, owned),
      required: 1,
      owned: owned,
      allocated: allocated,
      proxy_allocated: 0,
      available: available,
      allocated_elsewhere: allocated_elsewhere,
      missing: max(1 - allocated - available, 0),
      candidates:
        Enum.map(candidates, fn item ->
          elsewhere = Map.get(other_allocations, item.id, 0)

          %{
            item: item,
            allocated: 0,
            allocated_elsewhere: elsewhere,
            available: max(item.quantity - elsewhere, 0)
          }
        end)
    }
  end

  defp missing_status do
    %{
      state: "missing",
      required: 1,
      owned: 0,
      allocated: 0,
      proxy_allocated: 0,
      available: 0,
      allocated_elsewhere: 0,
      missing: 1,
      candidates: []
    }
  end

  defp collection_state(%Card{} = card, available, owned) do
    cond do
      basic_land?(card) -> "basic_land"
      available > 0 -> "available"
      owned > 0 -> "partial"
      true -> "missing"
    end
  end

  defp stringify_status(%{state: state} = status) do
    Map.put(status, :state, to_string(state))
  end

  # Prefetch collection candidates and allocation counts for many oracle_ids in
  # two queries (instead of a pair per card) and key them by oracle_id. Feed the
  # result to status/3. The per-oracle_id slices match what collection_candidates/1
  # and allocation_counts_for_oracle_id/1 return, so status/3 computes identically.
  def prefetch(oracle_ids) do
    oracle_ids = oracle_ids |> Enum.reject(&is_nil/1) |> Enum.uniq()

    if oracle_ids == [] do
      %{}
    else
      candidates_by_oracle = candidates_by_oracle_ids(oracle_ids)
      allocations_by_oracle = allocation_counts_by_oracle_ids(oracle_ids)

      Map.new(oracle_ids, fn oracle_id ->
        {oracle_id,
         %{
           candidates: Map.get(candidates_by_oracle, oracle_id, []),
           allocations: Map.get(allocations_by_oracle, oracle_id, %{})
         }}
      end)
    end
  end

  defp candidates_by_oracle_ids(oracle_ids) do
    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:inner, [_item, printing], card in assoc(printing, :card))
    |> join(:left, [item, _printing, _card], location in assoc(item, :location_assoc))
    |> where([_item, printing, _card, _location], printing.oracle_id in ^oracle_ids)
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
    |> Enum.group_by(& &1.printing.oracle_id)
  end

  defp allocation_counts_by_oracle_ids(oracle_ids) do
    DeckAllocation
    |> join(:inner, [allocation], allocated_card in assoc(allocation, :deck_card))
    |> join(:inner, [_allocation, allocated_card], deck in assoc(allocated_card, :deck))
    |> where(
      [allocation, allocated_card, deck],
      deck.status == "active" and allocated_card.oracle_id in ^oracle_ids
    )
    |> group_by(
      [allocation, allocated_card, _deck],
      [allocated_card.oracle_id, allocation.collection_item_id]
    )
    |> select(
      [allocation, allocated_card, _deck],
      {allocated_card.oracle_id, allocation.collection_item_id, sum(allocation.quantity)}
    )
    |> Repo.all()
    |> Enum.reduce(%{}, fn {oracle_id, item_id, quantity}, acc ->
      Map.update(acc, oracle_id, %{item_id => quantity}, &Map.put(&1, item_id, quantity))
    end)
  end

  # Collection copies of a card across any owned printing (used for cards not in
  # the deck; the in-deck path defers to AllocationStatus).
  defp collection_candidates(oracle_id) when is_binary(oracle_id) do
    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:inner, [_item, printing], card in assoc(printing, :card))
    |> join(:left, [item, _printing, _card], location in assoc(item, :location_assoc))
    |> where([_item, printing, _card, _location], printing.oracle_id == ^oracle_id)
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
  end

  defp collection_candidates(_oracle_id), do: []

  defp allocation_counts_for_oracle_id(oracle_id) do
    DeckAllocation
    |> join(:inner, [allocation], allocated_card in assoc(allocation, :deck_card))
    |> join(:inner, [_allocation, allocated_card], deck in assoc(allocated_card, :deck))
    |> where(
      [allocation, allocated_card, deck],
      deck.status == "active" and allocated_card.oracle_id == ^oracle_id
    )
    |> group_by([allocation, _allocated_card, _deck], allocation.collection_item_id)
    |> select(
      [allocation, _allocated_card, _deck],
      {allocation.collection_item_id, sum(allocation.quantity)}
    )
    |> Repo.all()
    |> Map.new()
  end

  defp basic_land?(%Card{type_line: type_line}) when is_binary(type_line) do
    String.contains?(type_line, "Basic Land")
  end

  defp basic_land?(_card), do: false
end
