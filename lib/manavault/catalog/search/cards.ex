defmodule Manavault.Catalog.Search.Cards do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, Printing}
  alias Manavault.Catalog.Search.Cards.Filter
  alias Manavault.Repo

  @default_sort %{field: "name", direction: "asc"}
  @sort_fields ~w(name mana_value color type released rarity price)
  @sort_directions ~w(asc desc)

  def search_cards(term, opts \\ []) when is_binary(term) do
    limit = Keyword.get(opts, :limit, 20)
    sort = Keyword.get(opts, :sort, @default_sort)

    card_ids =
      from(card in Card, as: :card)
      |> join(:left, [card], printing in assoc(card, :printings), as: :printing)
      |> Filter.apply(term)
      |> group_by([card, _printing], card.oracle_id)
      |> apply_sort(sort)
      |> limit(^limit)
      |> select([card, _printing], card.oracle_id)
      |> Repo.all()

    Card
    |> where([card], card.oracle_id in ^card_ids)
    |> Repo.all()
    |> Enum.sort_by(&Enum.find_index(card_ids, fn oracle_id -> oracle_id == &1.oracle_id end))
    |> Repo.preload(printings: from(printing in Printing, order_by: [desc: printing.released_at]))
  end

  # Printing-level fields aggregate across the card's printings (the query groups
  # by card.oracle_id): newest/oldest release, best rarity, and best price.
  defp apply_sort(query, sort) do
    %{field: field, direction: direction} = normalize_sort(sort)

    case {field, direction} do
      {"mana_value", "desc"} ->
        order_by(query, [card, _printing], desc: card.cmc, asc: card.name, asc: card.oracle_id)

      {"mana_value", _direction} ->
        order_by(query, [card, _printing], asc: card.cmc, asc: card.name, asc: card.oracle_id)

      {"color", "desc"} ->
        order_by(query, [card, _printing],
          desc: fragment("json_array_length(?)", card.color_identity),
          asc: card.color_identity,
          asc: card.name,
          asc: card.oracle_id
        )

      {"color", _direction} ->
        order_by(query, [card, _printing],
          asc: fragment("json_array_length(?)", card.color_identity),
          asc: card.color_identity,
          asc: card.name,
          asc: card.oracle_id
        )

      {"type", "desc"} ->
        order_by(query, [card, _printing],
          desc: card.type_line,
          asc: card.name,
          asc: card.oracle_id
        )

      {"type", _direction} ->
        order_by(query, [card, _printing], asc: card.type_line, asc: card.name, asc: card.oracle_id)

      {"released", "desc"} ->
        order_by(query, [card, printing],
          desc: max(printing.released_at),
          asc: card.name,
          asc: card.oracle_id
        )

      {"released", _direction} ->
        order_by(query, [card, printing],
          asc: min(printing.released_at),
          asc: card.name,
          asc: card.oracle_id
        )

      {"rarity", "desc"} ->
        order_by(query, [card, printing],
          desc: max(fragment("CASE ? WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3 WHEN 'mythic' THEN 4 ELSE 0 END", printing.rarity)),
          asc: card.name,
          asc: card.oracle_id
        )

      {"rarity", _direction} ->
        order_by(query, [card, printing],
          asc: min(fragment("CASE ? WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3 WHEN 'mythic' THEN 4 ELSE 0 END", printing.rarity)),
          asc: card.name,
          asc: card.oracle_id
        )

      {"price", "desc"} ->
        order_by(query, [card, printing],
          desc:
            max(
              fragment(
                "COALESCE(CAST(?->>'usd' AS REAL), CAST(?->>'usd_foil' AS REAL))",
                printing.prices,
                printing.prices
              )
            ),
          asc: card.name,
          asc: card.oracle_id
        )

      {"price", _direction} ->
        order_by(query, [card, printing],
          asc:
            min(
              fragment(
                "COALESCE(CAST(?->>'usd' AS REAL), CAST(?->>'usd_foil' AS REAL))",
                printing.prices,
                printing.prices
              )
            ),
          asc: card.name,
          asc: card.oracle_id
        )

      {_name, "desc"} ->
        order_by(query, [card, _printing], desc: card.name, asc: card.oracle_id)

      {_name, _direction} ->
        order_by(query, [card, _printing], asc: card.name, asc: card.oracle_id)
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

    if value in @sort_fields do
      value
    else
      @default_sort.field
    end
  end

  defp normalize_sort_direction(value) do
    value = value |> to_string() |> String.trim() |> String.downcase()

    if value in @sort_directions do
      value
    else
      @default_sort.direction
    end
  end
end
