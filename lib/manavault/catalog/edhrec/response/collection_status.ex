defmodule Manavault.Catalog.EDHRec.Response.CollectionStatus do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, CollectionItem, DeckAllocation, DeckCard}
  alias Manavault.Repo

  def status(_local_card, %DeckCard{} = deck_card) do
    deck_card
    |> deck_card_allocation_status()
    |> Map.put(:state, :allocated)
    |> stringify_status()
  end

  def status(%Card{} = card, _deck_card) do
    candidates = collection_candidates(card.oracle_id)
    other_allocations = allocation_counts_for_oracle_id(card.oracle_id)

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

  def status(_local_card, _deck_card) do
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

  defp deck_card_allocation_status(%DeckCard{} = deck_card) do
    deck_card = load_deck_card_for_allocation_status(deck_card)

    candidates = collection_candidates(deck_card.oracle_id, deck_card.finish)
    current_allocations = current_allocation_counts(deck_card.id)
    other_allocations = other_reserving_allocation_counts(deck_card)

    owned = Enum.reduce(candidates, 0, &(&1.quantity + &2))
    proxy_allocated = deck_card.proxy_quantity || 0
    physical_allocated = current_allocations |> Map.values() |> Enum.sum()
    allocated = deck_card_allocated(deck_card, physical_allocated, proxy_allocated)
    allocated_elsewhere = other_allocations |> Map.values() |> Enum.sum()

    available =
      Enum.reduce(candidates, 0, fn item, total ->
        current = Map.get(current_allocations, item.id, 0)
        elsewhere = Map.get(other_allocations, item.id, 0)
        total + max(item.quantity - current - elsewhere, 0)
      end)

    missing = deck_card_missing(deck_card, allocated, available)

    %{
      state: deck_card_state(deck_card, allocated, available, owned),
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

  defp deck_card_allocated(%DeckCard{} = deck_card, physical_allocated, proxy_allocated) do
    if basic_land?(deck_card.card) do
      deck_card.quantity
    else
      physical_allocated + proxy_allocated
    end
  end

  defp deck_card_missing(%DeckCard{} = deck_card, allocated, available) do
    if basic_land?(deck_card.card) do
      0
    else
      max(deck_card.quantity - allocated - available, 0)
    end
  end

  defp deck_card_state(%DeckCard{} = deck_card, allocated, available, owned) do
    cond do
      basic_land?(deck_card.card) -> :basic_land
      allocated >= deck_card.quantity -> :allocated
      allocated + available >= deck_card.quantity -> :available
      allocated > 0 or owned > 0 -> :partial
      true -> :missing
    end
  end

  defp collection_candidates(oracle_id, finish \\ nil)

  defp collection_candidates(oracle_id, finish) when is_binary(oracle_id) do
    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:inner, [_item, printing], card in assoc(printing, :card))
    |> join(:left, [item, _printing, _card], location in assoc(item, :location_assoc))
    |> where([_item, printing, _card, _location], printing.oracle_id == ^oracle_id)
    |> maybe_filter_finish(finish)
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

  defp collection_candidates(_oracle_id, _finish), do: []

  defp maybe_filter_finish(query, nil), do: query
  defp maybe_filter_finish(query, finish), do: where(query, [item], item.finish == ^finish)

  defp current_allocation_counts(deck_card_id) do
    DeckAllocation
    |> where([allocation], allocation.deck_card_id == ^deck_card_id)
    |> group_by([allocation], allocation.collection_item_id)
    |> select([allocation], {allocation.collection_item_id, sum(allocation.quantity)})
    |> Repo.all()
    |> Map.new()
  end

  defp other_reserving_allocation_counts(%DeckCard{} = deck_card) do
    DeckAllocation
    |> join(:inner, [allocation], allocated_card in assoc(allocation, :deck_card))
    |> where(
      [allocation, allocated_card],
      allocated_card.id != ^deck_card.id and allocated_card.oracle_id == ^deck_card.oracle_id and
        allocated_card.finish == ^deck_card.finish
    )
    |> group_by([allocation, _allocated_card], allocation.collection_item_id)
    |> select(
      [allocation, _allocated_card],
      {allocation.collection_item_id, sum(allocation.quantity)}
    )
    |> Repo.all()
    |> Map.new()
  end

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
