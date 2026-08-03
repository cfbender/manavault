defmodule Manavault.Trade.Matcher do
  @moduledoc """
  Matches resolved list entries (see `Manavault.Trade.EntryResolver`) against
  the local trade binder (`Manavault.Catalog.CollectionItem.for_trade`) and
  the want list (`Manavault.Trade.wants_by_oracle_ids/1`), grouped per oracle
  id.
  """

  import Ecto.Query

  alias Manavault.Catalog.{Card, CollectionItem, Printing}
  alias Manavault.Repo
  alias Manavault.Trade
  alias Manavault.Trade.ForTradeQuery

  @doc """
  Builds a `trade_match_result`-shaped map from resolved entries.
  """
  def match(source_name, %{entries: entries, unrecognized: unrecognized}) do
    known_entries = Enum.reject(entries, &is_nil(&1.oracle_id))
    aggregates = aggregate_by_oracle(known_entries)
    oracle_ids = Map.keys(aggregates)

    %{
      source_name: source_name,
      entry_count: length(entries),
      unrecognized: unrecognized,
      binder_matches: binder_matches(aggregates, oracle_ids),
      want_matches: want_matches(aggregates, oracle_ids)
    }
  end

  defp aggregate_by_oracle(entries) do
    Enum.reduce(entries, %{}, fn entry, aggregates ->
      Map.update(
        aggregates,
        entry.oracle_id,
        %{card_name: entry.name, quantity: entry.quantity},
        fn existing -> %{existing | quantity: existing.quantity + entry.quantity} end
      )
    end)
  end

  defp binder_matches(aggregates, oracle_ids) do
    items_by_oracle = for_trade_items_by_oracle(oracle_ids)

    aggregates
    |> Enum.filter(fn {oracle_id, _aggregate} -> Map.has_key?(items_by_oracle, oracle_id) end)
    |> Enum.map(fn {oracle_id, %{card_name: card_name, quantity: quantity}} ->
      %{
        card_name: card_name,
        oracle_id: oracle_id,
        their_quantity: quantity,
        items: Map.fetch!(items_by_oracle, oracle_id)
      }
    end)
    |> Enum.sort_by(& &1.card_name)
  end

  defp want_matches(aggregates, oracle_ids) do
    wants_by_oracle = oracle_ids |> Trade.wants_by_oracle_ids() |> Enum.group_by(& &1.oracle_id)

    aggregates
    |> Enum.flat_map(fn {oracle_id, %{card_name: card_name, quantity: quantity}} ->
      wants_by_oracle
      |> Map.get(oracle_id, [])
      |> Enum.map(
        &%{card_name: card_name, oracle_id: oracle_id, their_quantity: quantity, want: &1}
      )
    end)
    |> Enum.sort_by(& &1.card_name)
  end

  defp for_trade_items_by_oracle([]), do: %{}

  defp for_trade_items_by_oracle(oracle_ids) do
    ForTradeQuery.base_query()
    |> where([_item, _printing, card], card.oracle_id in ^oracle_ids)
    |> order_by([_item, printing, card],
      asc: card.name,
      asc: printing.set_code,
      asc: printing.collector_number
    )
    |> preload([_item, printing, card], printing: {printing, card: card})
    |> Repo.all()
    |> Enum.group_by(&printing_card_oracle_id/1)
  end

  defp printing_card_oracle_id(%CollectionItem{
         printing: %Printing{card: %Card{oracle_id: oracle_id}}
       }) do
    oracle_id
  end
end
