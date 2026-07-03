defmodule Manavault.Catalog.CardCollection.ItemQueries do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.CardCollection.ItemQueries.{Base, ValueSummary}
  alias Manavault.Catalog.CollectionItem
  alias Manavault.Repo

  import Manavault.Catalog.PriceFragments, only: [price_value_fragment: 2]

  @default_sort %{field: "name", direction: "asc"}

  defdelegate value_summary(filters \\ []), to: ValueSummary
  defdelegate location_summaries(), to: ValueSummary

  def list_items(filters \\ [], opts \\ []) when is_list(filters) do
    limit = Keyword.get(opts, :limit, 100)
    offset = Keyword.get(opts, :offset, 0)
    sort = Keyword.get(opts, :sort, @default_sort)

    filters
    |> Base.base_query()
    |> preload([_item, printing, card, location],
      printing: {printing, card: card},
      location_assoc: location
    )
    |> apply_sort(sort)
    |> limit(^limit)
    |> offset(^offset)
    |> Repo.all()
  end

  def count_items(filters \\ [])

  def count_items([]) do
    CollectionItem
    |> join(:left, [item], location in assoc(item, :location_assoc))
    |> where([_item, location], is_nil(location.id) or location.kind != "list")
    |> select([item, _location], coalesce(sum(item.quantity), 0))
    |> Repo.one()
  end

  def count_items(filters) when is_list(filters) do
    filters
    |> Base.base_query()
    |> select([item, _printing, _card, _location], coalesce(sum(item.quantity), 0))
    |> Repo.one()
  end

  # Number of collection item rows (not summed quantities) matching the
  # filters. Pagination must use this: quantity sums overshoot the row count,
  # which keeps hasNextPage true past the last row and pages forever.
  def count_item_entries(filters \\ []) when is_list(filters) do
    filters
    |> Base.base_query()
    |> select([item, _printing, _card, _location], count(item.id))
    |> Repo.one()
  end

  def list_item_ids(filters \\ []) when is_list(filters) do
    filters
    |> Base.base_query()
    |> select([item, _printing, _card, _location], item.id)
    |> Repo.all()
  end

  def list_items_by_location(location_id, filters \\ [], opts \\ [])
      when is_list(filters) do
    filters
    |> Keyword.put(:location_id, to_string(location_id))
    |> list_items(opts)
  end

  defp apply_sort(query, sort) do
    %{field: field, direction: direction} = normalize_sort(sort)

    case {field, direction} do
      {"quantity", "desc"} ->
        order_by(query, [item, printing, card, _location],
          desc: item.quantity,
          asc: card.name,
          asc: printing.set_code,
          asc: printing.collector_number,
          asc: item.id
        )

      {"quantity", _direction} ->
        order_by(query, [item, printing, card, _location],
          asc: item.quantity,
          asc: card.name,
          asc: printing.set_code,
          asc: printing.collector_number,
          asc: item.id
        )

      {"set", "desc"} ->
        order_by(query, [item, printing, card, _location],
          desc: printing.set_name,
          desc: printing.set_code,
          asc: card.name,
          asc: printing.collector_number,
          asc: item.id
        )

      {"set", _direction} ->
        order_by(query, [item, printing, card, _location],
          asc: printing.set_name,
          asc: printing.set_code,
          asc: card.name,
          asc: printing.collector_number,
          asc: item.id
        )

      {"rarity", "desc"} ->
        order_by(query, [item, printing, card, _location],
          desc:
            fragment(
              "CASE ? WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3 WHEN 'mythic' THEN 4 ELSE 0 END",
              printing.rarity
            ),
          asc: card.name,
          asc: item.id
        )

      {"rarity", _direction} ->
        order_by(query, [item, printing, card, _location],
          asc:
            fragment(
              "CASE ? WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3 WHEN 'mythic' THEN 4 ELSE 0 END",
              printing.rarity
            ),
          asc: card.name,
          asc: item.id
        )

      {"price", "desc"} ->
        order_by(query, [item, printing, card, _location],
          desc: price_value_fragment(item, printing),
          asc: card.name,
          asc: item.id
        )

      {"price", _direction} ->
        order_by(query, [item, printing, card, _location],
          asc: price_value_fragment(item, printing),
          asc: card.name,
          asc: item.id
        )

      {"added", "desc"} ->
        order_by(query, [item, printing, card, _location],
          desc: item.inserted_at,
          asc: card.name,
          asc: printing.set_code,
          asc: printing.collector_number,
          asc: item.id
        )

      {"added", _direction} ->
        order_by(query, [item, printing, card, _location],
          asc: item.inserted_at,
          asc: card.name,
          asc: printing.set_code,
          asc: printing.collector_number,
          asc: item.id
        )

      {"name", "desc"} ->
        order_by(query, [item, printing, card, _location],
          desc: card.name,
          asc: printing.set_code,
          asc: printing.collector_number,
          asc: item.id
        )

      {_field, _direction} ->
        order_by(query, [item, printing, card, _location],
          asc: card.name,
          asc: printing.set_code,
          asc: printing.collector_number,
          asc: item.id
        )
    end
  end

  defp normalize_sort(sort) when is_map(sort) do
    %{
      field: sort |> Map.get(:field, Map.get(sort, "field")) |> normalize_sort_field(),
      direction:
        sort |> Map.get(:direction, Map.get(sort, "direction")) |> normalize_sort_direction()
    }
  end

  defp normalize_sort(sort) when is_list(sort), do: sort |> Enum.into(%{}) |> normalize_sort()
  defp normalize_sort(_sort), do: @default_sort

  defp normalize_sort_field(value) do
    value = value |> to_string() |> String.trim() |> String.downcase()

    if value in ["quantity", "name", "set", "rarity", "price", "added"] do
      value
    else
      @default_sort.field
    end
  end

  defp normalize_sort_direction(value) do
    value = value |> to_string() |> String.trim() |> String.downcase()

    if value in ["asc", "desc"] do
      value
    else
      @default_sort.direction
    end
  end
end
