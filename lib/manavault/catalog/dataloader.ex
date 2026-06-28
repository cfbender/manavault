defmodule Manavault.Catalog.Dataloader do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, CollectionItem, DeckAllocation, DeckCard, Location, Printing}
  alias Manavault.Repo

  def data do
    Dataloader.Ecto.new(Repo, query: &query/2, run_batch: &run_batch/5)
  end

  def run_batch(Card, _query, :printings_with_owned_count, cards, repo_opts) do
    oracle_ids = Enum.map(cards, & &1.oracle_id)
    owned_counts = printing_owned_counts(oracle_ids, repo_opts)

    printings_by_oracle_id =
      Printing
      |> query(%{})
      |> where([printing], printing.oracle_id in ^oracle_ids)
      |> Repo.all(repo_opts)
      |> Enum.map(&%{&1 | owned_count: Map.get(owned_counts, &1.scryfall_id, 0)})
      |> Enum.group_by(& &1.oracle_id)

    Enum.map(cards, &Map.get(printings_by_oracle_id, &1.oracle_id, []))
  end

  def run_batch(Location, _query, :value_summary, locations, repo_opts) do
    summaries = location_value_summaries(locations, repo_opts)
    Enum.map(locations, &Map.get(summaries, &1.id, empty_value_summary()))
  end

  def run_batch(Printing, _query, :owned_count, printings, repo_opts) do
    owned_counts = printings |> Enum.map(& &1.oracle_id) |> printing_owned_counts(repo_opts)
    Enum.map(printings, &Map.get(owned_counts, &1.scryfall_id, 0))
  end

  def run_batch(CollectionItem, _query, :total_owned_copies, items, repo_opts) do
    oracle_ids_by_scryfall_id = collection_item_oracle_ids(items, repo_opts)

    owned_counts =
      oracle_ids_by_scryfall_id
      |> Map.values()
      |> Enum.reject(&is_nil/1)
      |> oracle_owned_counts(repo_opts)

    Enum.map(items, fn item ->
      Map.get(owned_counts, Map.get(oracle_ids_by_scryfall_id, item.scryfall_id), 0)
    end)
  end

  def run_batch(queryable, query, col, inputs, repo_opts) do
    Dataloader.Ecto.run_batch(Repo, queryable, query, col, inputs, repo_opts)
  end

  def query(DeckCard, _params) do
    from(deck_card in DeckCard,
      join: card in assoc(deck_card, :card),
      left_join: preferred_printing in assoc(deck_card, :preferred_printing),
      order_by: [
        asc: deck_card.zone,
        asc: card.name,
        asc: deck_card.id
      ],
      preload: [
        card: card,
        preferred_printing: preferred_printing
      ]
    )
  end

  def query(Printing, _params) do
    from(printing in Printing,
      order_by: [desc: printing.released_at, asc: printing.set_code]
    )
  end

  def query(queryable, _params), do: queryable

  defmacrop price_value_fragment(item, printing) do
    quote do
      fragment(
        """
        CAST(COALESCE(NULLIF(
          CASE ?
            WHEN 'foil' THEN COALESCE(json_extract(?, '$.usd_foil'), json_extract(?, '$.usd'))
            WHEN 'etched' THEN COALESCE(json_extract(?, '$.usd_etched'), json_extract(?, '$.usd_foil'), json_extract(?, '$.usd'))
            ELSE COALESCE(json_extract(?, '$.usd'), json_extract(?, '$.usd_foil'), json_extract(?, '$.usd_etched'))
          END,
          ''
        ), '0') AS REAL)
        """,
        unquote(item).finish,
        unquote(printing).prices,
        unquote(printing).prices,
        unquote(printing).prices,
        unquote(printing).prices,
        unquote(printing).prices,
        unquote(printing).prices,
        unquote(printing).prices,
        unquote(printing).prices
      )
    end
  end

  defmacrop price_cents_fragment(item, printing) do
    quote do
      fragment(
        "CAST(round(? * 100) AS INTEGER)",
        price_value_fragment(unquote(item), unquote(printing))
      )
    end
  end

  defmacrop current_total_cents_fragment(item, printing) do
    quote do
      fragment(
        "COALESCE(SUM(? * COALESCE(?, 0)), 0)",
        unquote(item).quantity,
        price_cents_fragment(unquote(item), unquote(printing))
      )
    end
  end

  defmacrop purchase_total_cents_fragment(item, printing) do
    quote do
      fragment(
        "COALESCE(SUM(? * COALESCE(?, ?, 0)), 0)",
        unquote(item).quantity,
        unquote(item).purchase_price_cents,
        price_cents_fragment(unquote(item), unquote(printing))
      )
    end
  end

  defp printing_owned_counts(oracle_ids, repo_opts) do
    oracle_ids = Enum.uniq(oracle_ids)

    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:left, [item, _printing], location in assoc(item, :location_assoc))
    |> where([_item, printing, _location], printing.oracle_id in ^oracle_ids)
    |> where([_item, _printing, location], is_nil(location.id) or location.kind != "list")
    |> group_by([item, _printing, _location], item.scryfall_id)
    |> select([item, _printing, _location], {item.scryfall_id, coalesce(sum(item.quantity), 0)})
    |> Repo.all(repo_opts)
    |> Map.new()
  end

  defp oracle_owned_counts(oracle_ids, repo_opts) do
    oracle_ids = Enum.uniq(oracle_ids)

    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:left, [item, _printing], location in assoc(item, :location_assoc))
    |> where([_item, printing, _location], printing.oracle_id in ^oracle_ids)
    |> where([_item, _printing, location], is_nil(location.id) or location.kind != "list")
    |> group_by([_item, printing, _location], printing.oracle_id)
    |> select([item, printing, _location], {printing.oracle_id, coalesce(sum(item.quantity), 0)})
    |> Repo.all(repo_opts)
    |> Map.new()
  end

  defp collection_item_oracle_ids(items, repo_opts) do
    preloaded =
      items
      |> Enum.filter(fn item -> match?(%CollectionItem{printing: %Printing{}}, item) end)
      |> Map.new(fn %{scryfall_id: scryfall_id, printing: %{oracle_id: oracle_id}} ->
        {scryfall_id, oracle_id}
      end)

    missing_scryfall_ids =
      items
      |> Enum.map(& &1.scryfall_id)
      |> Enum.reject(&Map.has_key?(preloaded, &1))
      |> Enum.uniq()

    queried =
      Printing
      |> where([printing], printing.scryfall_id in ^missing_scryfall_ids)
      |> select([printing], {printing.scryfall_id, printing.oracle_id})
      |> Repo.all(repo_opts)
      |> Map.new()

    Map.merge(queried, preloaded)
  end

  defp location_value_summaries(locations, repo_opts) do
    location_ids = locations |> Enum.map(& &1.id) |> Enum.uniq()
    allocated_item_ids = from allocation in DeckAllocation, select: allocation.collection_item_id

    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> where([item], item.location_id in ^location_ids)
    |> where([item], item.id not in subquery(allocated_item_ids))
    |> group_by([item], item.location_id)
    |> select([item, printing], %{
      location_id: item.location_id,
      item_count: coalesce(sum(item.quantity), 0),
      total_price_cents: current_total_cents_fragment(item, printing),
      purchase_price_cents: purchase_total_cents_fragment(item, printing)
    })
    |> Repo.all(repo_opts)
    |> Map.new(fn summary -> {summary.location_id, normalize_value_summary(summary)} end)
  end

  defp normalize_value_summary(summary) do
    %{
      item_count: integer_or_zero(summary.item_count),
      total_price_cents: integer_or_zero(summary.total_price_cents),
      purchase_price_cents: integer_or_zero(summary.purchase_price_cents)
    }
  end

  defp empty_value_summary do
    %{item_count: 0, total_price_cents: 0, purchase_price_cents: 0}
  end

  defp integer_or_zero(nil), do: 0
  defp integer_or_zero(value) when is_integer(value), do: value
  defp integer_or_zero(value) when is_float(value), do: round(value)
end
