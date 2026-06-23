defmodule Manavault.Catalog.CardCollection.ItemQueries.ValueSummary do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.CollectionItem
  alias Manavault.Catalog.DeckAllocation
  alias Manavault.Catalog.CardCollection.ItemQueries.Base
  alias Manavault.Repo

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

  def value_summary(filters \\ [])

  def value_summary([]) do
    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:left, [item, _printing], location in assoc(item, :location_assoc))
    |> where([_item, _printing, location], is_nil(location.id) or location.kind != "list")
    |> select([item, printing, _location], %{
      item_count: coalesce(sum(item.quantity), 0),
      total_price_cents: current_total_cents_fragment(item, printing),
      purchase_price_cents: purchase_total_cents_fragment(item, printing)
    })
    |> Repo.one()
    |> normalize_value_summary()
  end

  def value_summary(filters) when is_list(filters) do
    filters
    |> Base.base_query()
    |> select([item, printing, _card, _location], %{
      item_count: coalesce(sum(item.quantity), 0),
      total_price_cents: current_total_cents_fragment(item, printing),
      purchase_price_cents: purchase_total_cents_fragment(item, printing)
    })
    |> Repo.one()
    |> normalize_value_summary()
  end

  def location_summaries do
    allocated_item_ids = from allocation in DeckAllocation, select: allocation.collection_item_id

    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> where([item], item.id not in subquery(allocated_item_ids))
    |> group_by([item], item.location_id)
    |> select([item, printing], %{
      location_id: item.location_id,
      item_count: coalesce(sum(item.quantity), 0),
      total_price_cents: current_total_cents_fragment(item, printing),
      purchase_price_cents: purchase_total_cents_fragment(item, printing)
    })
    |> Repo.all()
    |> Map.new(fn summary -> {summary.location_id, normalize_value_summary(summary)} end)
  end

  defp normalize_value_summary(nil) do
    %{item_count: 0, total_price_cents: 0, purchase_price_cents: 0}
  end

  defp normalize_value_summary(summary) do
    %{
      summary
      | item_count: integer_or_zero(summary.item_count),
        total_price_cents: integer_or_zero(summary.total_price_cents),
        purchase_price_cents: integer_or_zero(summary.purchase_price_cents)
    }
  end

  defp integer_or_zero(nil), do: 0
  defp integer_or_zero(value) when is_integer(value), do: value
  defp integer_or_zero(value) when is_float(value), do: round(value)
end
