defmodule Manavault.Catalog.CardCollection do
  @moduledoc """
  Query helpers for card collection rows.

  This keeps collection-card filtering, sorting, and pagination in one place so
  API/UI layers do not grow ad hoc Ecto query fragments.
  """

  import Ecto.Query

  alias Manavault.Catalog.CollectionItem
  alias Manavault.Repo

  @default_sort %{field: "name", direction: "asc"}

  def list_items(filters \\ [], opts \\ []) when is_list(filters) do
    limit = Keyword.get(opts, :limit, 100)
    offset = Keyword.get(opts, :offset, 0)
    sort = Keyword.get(opts, :sort, @default_sort)

    filters
    |> base_query()
    |> preload([_item, printing, card, location],
      printing: {printing, card: card},
      location_assoc: location
    )
    |> apply_sort(sort)
    |> limit(^limit)
    |> offset(^offset)
    |> Repo.all()
  end

  def count_items(filters \\ []) when is_list(filters) do
    filters
    |> base_query()
    |> Repo.aggregate(:count, :id)
  end

  def list_items_by_location(location_id, filters \\ [], opts \\ [])
      when is_list(filters) do
    filters
    |> Keyword.put(:location_id, to_string(location_id))
    |> list_items(opts)
  end

  defp base_query(filters) do
    query = filters |> Keyword.get(:q, "") |> normalize_filter()
    condition = filters |> Keyword.get(:condition, "") |> normalize_filter()
    language = filters |> Keyword.get(:language, "") |> normalize_filter()
    finish = filters |> Keyword.get(:finish, "") |> normalize_filter()
    location_id = filters |> Keyword.get(:location_id, "") |> normalize_filter()

    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:inner, [_item, printing], card in assoc(printing, :card))
    |> join(:left, [item, _printing, _card], location in assoc(item, :location_assoc))
    |> maybe_filter_search(query)
    |> maybe_filter_condition(condition)
    |> maybe_filter_language(language)
    |> maybe_filter_finish(finish)
    |> maybe_filter_location(location_id)
  end

  defmacrop price_sort_fragment(item, printing) do
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
          desc: fragment("CASE ? WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3 WHEN 'mythic' THEN 4 ELSE 0 END", printing.rarity),
          asc: card.name,
          asc: item.id
        )

      {"rarity", _direction} ->
        order_by(query, [item, printing, card, _location],
          asc: fragment("CASE ? WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3 WHEN 'mythic' THEN 4 ELSE 0 END", printing.rarity),
          asc: card.name,
          asc: item.id
        )

      {"price", "desc"} ->
        order_by(query, [item, printing, card, _location],
          desc: price_sort_fragment(item, printing),
          asc: card.name,
          asc: item.id
        )

      {"price", _direction} ->
        order_by(query, [item, printing, card, _location],
          asc: price_sort_fragment(item, printing),
          asc: card.name,
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
      direction: sort |> Map.get(:direction, Map.get(sort, "direction")) |> normalize_sort_direction()
    }
  end

  defp normalize_sort(sort) when is_list(sort), do: sort |> Enum.into(%{}) |> normalize_sort()
  defp normalize_sort(_sort), do: @default_sort

  defp normalize_sort_field(value) do
    value = value |> to_string() |> String.trim() |> String.downcase()

    if value in ["quantity", "name", "set", "rarity", "price"] do
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

  defp maybe_filter_search(query, ""), do: query

  defp maybe_filter_search(query, search) do
    pattern = "%#{String.downcase(search)}%"

    where(
      query,
      [_item, printing, card, ...],
      fragment("lower(?) LIKE ?", card.name, ^pattern) or
        fragment("lower(?) LIKE ?", printing.set_code, ^pattern) or
        fragment("lower(?) LIKE ?", printing.collector_number, ^pattern) or
        fragment("lower(?) LIKE ?", printing.scryfall_id, ^pattern)
    )
  end

  defp maybe_filter_condition(query, ""), do: query

  defp maybe_filter_condition(query, condition) do
    where(query, [item, _printing, _card, _location], item.condition == ^condition)
  end

  defp maybe_filter_language(query, ""), do: query

  defp maybe_filter_language(query, language) do
    where(query, [item, _printing, _card, _location], item.language == ^language)
  end

  defp maybe_filter_finish(query, ""), do: query

  defp maybe_filter_finish(query, finish) do
    where(query, [item, _printing, _card, _location], item.finish == ^finish)
  end

  defp maybe_filter_location(query, ""), do: query

  defp maybe_filter_location(query, "unfiled") do
    where(query, [item, _printing, _card, _location], is_nil(item.location_id))
  end

  defp maybe_filter_location(query, location_id) do
    case Integer.parse(location_id) do
      {id, ""} -> where(query, [item, _printing, _card, _location], item.location_id == ^id)
      _invalid -> where(query, false)
    end
  end

  defp normalize_filter(value) when is_binary(value), do: String.trim(value)
  defp normalize_filter(_value), do: ""
end
