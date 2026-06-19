defmodule Manavault.Catalog.CardCollection do
  @moduledoc """
  Query helpers for card collection rows.

  This keeps collection-card filtering, sorting, and pagination in one place so
  API/UI layers do not grow ad hoc Ecto query fragments.
  """

  import Ecto.Query

  alias Manavault.Catalog.CollectionItem
  alias Manavault.Catalog.ScryfallQuery
  alias Manavault.Catalog.ScryfallQuery.{And, ExactName, Not, Or, Predicate}
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
    |> select([item, _printing, _card, _location], coalesce(sum(item.quantity), 0))
    |> Repo.one()
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

  defmacrop json_array_count(field) do
    quote do
      fragment("(SELECT count(1) FROM json_each(COALESCE(?, '[]')))", unquote(field))
    end
  end

  defmacrop rarity_rank_fragment(field) do
    quote do
      fragment(
        "CASE lower(coalesce(?, '')) WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3 WHEN 'mythic' THEN 4 WHEN 'special' THEN 5 WHEN 'bonus' THEN 6 ELSE 0 END",
        unquote(field)
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
    case ScryfallQuery.parse(search) do
      {:ok, %And{terms: []}} ->
        query

      {:ok, expr} ->
        where(query, ^scryfall_dynamic(expr))

      {:error, _reason} ->
        where(query, ^plain_text_dynamic(search))
    end
  end

  defp scryfall_dynamic(%And{terms: terms}) do
    Enum.reduce(terms, dynamic(true), fn term, acc ->
      dynamic([item, printing, card, location], ^acc and ^scryfall_dynamic(term))
    end)
  end

  defp scryfall_dynamic(%Or{terms: terms}) do
    Enum.reduce(terms, dynamic(false), fn term, acc ->
      dynamic([item, printing, card, location], ^acc or ^scryfall_dynamic(term))
    end)
  end

  defp scryfall_dynamic(%Not{expr: expr}) do
    dynamic([item, printing, card, location], not (^scryfall_dynamic(expr)))
  end

  defp scryfall_dynamic(%ExactName{name: name}) do
    dynamic(
      [_item, _printing, card, _location],
      fragment("lower(?)", card.name) == ^downcase(name)
    )
  end

  defp scryfall_dynamic(%Predicate{field: :text, value: value, regex?: false}) do
    plain_text_dynamic(value)
  end

  defp scryfall_dynamic(%Predicate{regex?: true}), do: dynamic(false)

  defp scryfall_dynamic(%Predicate{field: :name, op: op, value: value}) do
    text_field_dynamic(:name, op, value)
  end

  defp scryfall_dynamic(%Predicate{field: :type, op: op, value: value}) do
    text_field_dynamic(:type, op, value)
  end

  defp scryfall_dynamic(%Predicate{field: :oracle, op: op, value: value}) do
    text_field_dynamic(:oracle, op, value)
  end

  defp scryfall_dynamic(%Predicate{field: :mana, op: op, value: value}) do
    text_field_dynamic(:mana, op, value)
  end

  defp scryfall_dynamic(%Predicate{field: :mana_value, op: op, value: value}) do
    mana_value_dynamic(op, value)
  end

  defp scryfall_dynamic(%Predicate{field: :colors, op: op, value: value}) do
    color_dynamic(:colors, op, value)
  end

  defp scryfall_dynamic(%Predicate{field: :identity, op: op, value: value}) do
    color_dynamic(:identity, op, value)
  end

  defp scryfall_dynamic(%Predicate{field: :rarity, op: op, value: value}) do
    rarity_dynamic(op, value)
  end

  defp scryfall_dynamic(%Predicate{field: :set, op: op, value: value}) do
    set_dynamic(op, value)
  end

  defp scryfall_dynamic(%Predicate{field: :collector_number, op: op, value: value}) do
    collector_number_dynamic(op, value)
  end

  defp scryfall_dynamic(%Predicate{field: :language, op: op, value: value}) do
    equality_dynamic(:language, op, value)
  end

  defp scryfall_dynamic(%Predicate{field: :usd, op: op, value: value}) do
    price_dynamic(op, value)
  end

  defp scryfall_dynamic(%Predicate{field: :is, op: op, value: value}) do
    is_dynamic(op, value)
  end

  defp scryfall_dynamic(%Predicate{field: :date, op: op, value: value}) do
    date_dynamic(op, value)
  end

  defp scryfall_dynamic(%Predicate{field: :year, op: op, value: value}) do
    year_dynamic(op, value)
  end

  defp scryfall_dynamic(_unsupported), do: dynamic(false)

  defp plain_text_dynamic(search) do
    pattern = search |> downcase() |> like_pattern()

    dynamic(
      [_item, printing, card, _location],
      fragment("lower(?) LIKE ? ESCAPE '\\'", card.name, ^pattern) or
        fragment("lower(?) LIKE ? ESCAPE '\\'", printing.set_code, ^pattern) or
        fragment("lower(?) LIKE ? ESCAPE '\\'", printing.set_name, ^pattern) or
        fragment("lower(?) LIKE ? ESCAPE '\\'", printing.collector_number, ^pattern) or
        fragment("lower(?) LIKE ? ESCAPE '\\'", printing.scryfall_id, ^pattern)
    )
  end

  defp text_field_dynamic(_field, _op, ""), do: dynamic(true)

  defp text_field_dynamic(field, op, value) when op in [:colon, :eq, :neq] do
    value = downcase(value)
    pattern = like_pattern(value)

    condition =
      case field do
        :name ->
          dynamic(
            [_item, _printing, card, _location],
            fragment("lower(?) LIKE ? ESCAPE '\\'", card.name, ^pattern)
          )

        :type ->
          dynamic(
            [_item, _printing, card, _location],
            fragment("lower(coalesce(?, '')) LIKE ? ESCAPE '\\'", card.type_line, ^pattern)
          )

        :oracle ->
          dynamic(
            [_item, _printing, card, _location],
            fragment("lower(coalesce(?, '')) LIKE ? ESCAPE '\\'", card.oracle_text, ^pattern)
          )

        :mana ->
          dynamic(
            [_item, _printing, card, _location],
            fragment("lower(coalesce(?, '')) LIKE ? ESCAPE '\\'", card.mana_cost, ^pattern)
          )
      end

    if op == :neq do
      dynamic([item, printing, card, location], not (^condition))
    else
      condition
    end
  end

  defp text_field_dynamic(_field, _op, _value), do: dynamic(false)

  defp mana_value_dynamic(op, value) do
    case value |> downcase() do
      "even" ->
        dynamic(
          [_item, _printing, card, _location],
          fragment("CAST(coalesce(?, 0) AS INTEGER) % 2 = 0", card.cmc)
        )

      "odd" ->
        dynamic(
          [_item, _printing, card, _location],
          fragment("CAST(coalesce(?, 0) AS INTEGER) % 2 = 1", card.cmc)
        )

      value ->
        numeric_value_dynamic(:mana_value, op, value)
    end
  end

  defp numeric_value_dynamic(field, op, value) do
    case Float.parse(value) do
      {number, ""} -> numeric_comparison_dynamic(field, op, number)
      _invalid -> dynamic(false)
    end
  end

  defp numeric_comparison_dynamic(:mana_value, op, number) do
    case normalize_comparison_op(op) do
      :eq -> dynamic([_item, _printing, card, _location], card.cmc == ^number)
      :neq -> dynamic([_item, _printing, card, _location], card.cmc != ^number)
      :gt -> dynamic([_item, _printing, card, _location], card.cmc > ^number)
      :gte -> dynamic([_item, _printing, card, _location], card.cmc >= ^number)
      :lt -> dynamic([_item, _printing, card, _location], card.cmc < ^number)
      :lte -> dynamic([_item, _printing, card, _location], card.cmc <= ^number)
    end
  end

  defp color_dynamic(json_field, op, value) do
    value = downcase(value)

    cond do
      value in ["m", "multicolor"] ->
        compare_color_count_dynamic(json_field, op, 2, :gte)

      value in ["c", "colorless"] ->
        compare_color_count_dynamic(json_field, op, 0, :eq)

      numeric_string?(value) ->
        {count, ""} = Integer.parse(value)
        compare_color_count_dynamic(json_field, op, count, :eq)

      true ->
        case parse_color_set(value) do
          {:ok, colors} -> compare_color_set_dynamic(json_field, op, colors)
          :error -> dynamic(false)
        end
    end
  end

  defp compare_color_count_dynamic(field, op, count, default_op) do
    op = if op == :colon, do: default_op, else: normalize_comparison_op(op)

    case {field, op} do
      {:colors, :eq} ->
        dynamic([_item, _printing, card, _location], json_array_count(card.colors) == ^count)

      {:colors, :neq} ->
        dynamic([_item, _printing, card, _location], json_array_count(card.colors) != ^count)

      {:colors, :gt} ->
        dynamic([_item, _printing, card, _location], json_array_count(card.colors) > ^count)

      {:colors, :gte} ->
        dynamic([_item, _printing, card, _location], json_array_count(card.colors) >= ^count)

      {:colors, :lt} ->
        dynamic([_item, _printing, card, _location], json_array_count(card.colors) < ^count)

      {:colors, :lte} ->
        dynamic([_item, _printing, card, _location], json_array_count(card.colors) <= ^count)

      {:identity, :eq} ->
        dynamic(
          [_item, _printing, card, _location],
          json_array_count(card.color_identity) == ^count
        )

      {:identity, :neq} ->
        dynamic(
          [_item, _printing, card, _location],
          json_array_count(card.color_identity) != ^count
        )

      {:identity, :gt} ->
        dynamic(
          [_item, _printing, card, _location],
          json_array_count(card.color_identity) > ^count
        )

      {:identity, :gte} ->
        dynamic(
          [_item, _printing, card, _location],
          json_array_count(card.color_identity) >= ^count
        )

      {:identity, :lt} ->
        dynamic(
          [_item, _printing, card, _location],
          json_array_count(card.color_identity) < ^count
        )

      {:identity, :lte} ->
        dynamic(
          [_item, _printing, card, _location],
          json_array_count(card.color_identity) <= ^count
        )
    end
  end

  defp compare_color_set_dynamic(field, op, colors) do
    op = normalize_color_op(op)
    contains = contains_colors_dynamic(field, colors)
    excludes = excludes_other_colors_dynamic(field, colors)
    count = length(colors)

    case op do
      :eq ->
        dynamic([item, printing, card, location], ^contains and ^excludes)

      :neq ->
        dynamic([item, printing, card, location], not (^contains and ^excludes))

      :gte ->
        contains

      :lte ->
        excludes

      :gt ->
        dynamic(
          [item, printing, card, location],
          ^contains and ^compare_color_count_dynamic(field, :gt, count, :gt)
        )

      :lt ->
        dynamic(
          [item, printing, card, location],
          ^excludes and ^compare_color_count_dynamic(field, :lt, count, :lt)
        )
    end
  end

  defp contains_colors_dynamic(field, colors) do
    Enum.reduce(colors, dynamic(true), fn color, acc ->
      color_presence_dynamic(field, color, acc, true)
    end)
  end

  defp excludes_other_colors_dynamic(field, colors) do
    ~w(W U B R G)
    |> Enum.reject(&(&1 in colors))
    |> Enum.reduce(dynamic(true), fn color, acc ->
      color_presence_dynamic(field, color, acc, false)
    end)
  end

  defp color_presence_dynamic(:colors, color, acc, true) do
    dynamic(
      [_item, _printing, card, _location],
      ^acc and fragment("instr(coalesce(?, '[]'), ?) > 0", card.colors, ^~s("#{color}"))
    )
  end

  defp color_presence_dynamic(:colors, color, acc, false) do
    dynamic(
      [_item, _printing, card, _location],
      ^acc and fragment("instr(coalesce(?, '[]'), ?) = 0", card.colors, ^~s("#{color}"))
    )
  end

  defp color_presence_dynamic(:identity, color, acc, true) do
    dynamic(
      [_item, _printing, card, _location],
      ^acc and fragment("instr(coalesce(?, '[]'), ?) > 0", card.color_identity, ^~s("#{color}"))
    )
  end

  defp color_presence_dynamic(:identity, color, acc, false) do
    dynamic(
      [_item, _printing, card, _location],
      ^acc and fragment("instr(coalesce(?, '[]'), ?) = 0", card.color_identity, ^~s("#{color}"))
    )
  end

  defp rarity_dynamic(op, value) do
    with {:ok, rank} <- rarity_rank(value) do
      case normalize_comparison_op(op) do
        :eq ->
          dynamic(
            [_item, printing, _card, _location],
            rarity_rank_fragment(printing.rarity) == ^rank
          )

        :neq ->
          dynamic(
            [_item, printing, _card, _location],
            rarity_rank_fragment(printing.rarity) != ^rank
          )

        :gt ->
          dynamic(
            [_item, printing, _card, _location],
            rarity_rank_fragment(printing.rarity) > ^rank
          )

        :gte ->
          dynamic(
            [_item, printing, _card, _location],
            rarity_rank_fragment(printing.rarity) >= ^rank
          )

        :lt ->
          dynamic(
            [_item, printing, _card, _location],
            rarity_rank_fragment(printing.rarity) < ^rank
          )

        :lte ->
          dynamic(
            [_item, printing, _card, _location],
            rarity_rank_fragment(printing.rarity) <= ^rank
          )
      end
    else
      :error -> dynamic(false)
    end
  end

  defp set_dynamic(op, value) when op in [:colon, :eq, :neq] do
    value = downcase(value)
    pattern = like_pattern(value)

    condition =
      dynamic(
        [_item, printing, _card, _location],
        fragment("lower(?)", printing.set_code) == ^value or
          fragment("lower(coalesce(?, '')) LIKE ? ESCAPE '\\'", printing.set_name, ^pattern)
      )

    if op == :neq,
      do: dynamic([item, printing, card, location], not (^condition)),
      else: condition
  end

  defp set_dynamic(_op, _value), do: dynamic(false)

  defp collector_number_dynamic(op, value) when op in [:colon, :eq, :neq] do
    value = downcase(value)

    condition =
      dynamic(
        [_item, printing, _card, _location],
        fragment("lower(?)", printing.collector_number) == ^value
      )

    if op == :neq,
      do: dynamic([item, printing, card, location], not (^condition)),
      else: condition
  end

  defp collector_number_dynamic(op, value) do
    case Integer.parse(value) do
      {number, ""} ->
        case normalize_comparison_op(op) do
          :gt ->
            dynamic(
              [_item, printing, _card, _location],
              fragment("CAST(? AS INTEGER)", printing.collector_number) > ^number
            )

          :gte ->
            dynamic(
              [_item, printing, _card, _location],
              fragment("CAST(? AS INTEGER)", printing.collector_number) >= ^number
            )

          :lt ->
            dynamic(
              [_item, printing, _card, _location],
              fragment("CAST(? AS INTEGER)", printing.collector_number) < ^number
            )

          :lte ->
            dynamic(
              [_item, printing, _card, _location],
              fragment("CAST(? AS INTEGER)", printing.collector_number) <= ^number
            )

          _op ->
            dynamic(false)
        end

      _invalid ->
        dynamic(false)
    end
  end

  defp equality_dynamic(:language, op, value) when op in [:colon, :eq, :neq] do
    value = downcase(value)

    condition =
      dynamic([item, _printing, _card, _location], fragment("lower(?)", item.language) == ^value)

    if op == :neq,
      do: dynamic([item, printing, card, location], not (^condition)),
      else: condition
  end

  defp equality_dynamic(_field, _op, _value), do: dynamic(false)

  defp price_dynamic(op, value) do
    case Float.parse(value) do
      {number, ""} ->
        case normalize_comparison_op(op) do
          :eq ->
            dynamic(
              [item, printing, _card, _location],
              price_value_fragment(item, printing) == ^number
            )

          :neq ->
            dynamic(
              [item, printing, _card, _location],
              price_value_fragment(item, printing) != ^number
            )

          :gt ->
            dynamic(
              [item, printing, _card, _location],
              price_value_fragment(item, printing) > ^number
            )

          :gte ->
            dynamic(
              [item, printing, _card, _location],
              price_value_fragment(item, printing) >= ^number
            )

          :lt ->
            dynamic(
              [item, printing, _card, _location],
              price_value_fragment(item, printing) < ^number
            )

          :lte ->
            dynamic(
              [item, printing, _card, _location],
              price_value_fragment(item, printing) <= ^number
            )
        end

      _invalid ->
        dynamic(false)
    end
  end

  defp is_dynamic(op, value) when op in [:colon, :eq, :neq] do
    value = downcase(value)

    condition =
      case value do
        "foil" ->
          dynamic([item, _printing, _card, _location], item.finish == "foil")

        "nonfoil" ->
          dynamic([item, _printing, _card, _location], item.finish == "nonfoil")

        "etched" ->
          dynamic([item, _printing, _card, _location], item.finish == "etched")

        "colorless" ->
          compare_color_count_dynamic(:colors, :eq, 0, :eq)

        "multicolor" ->
          compare_color_count_dynamic(:colors, :gte, 2, :gte)

        "land" ->
          text_field_dynamic(:type, :colon, "land")

        "creature" ->
          text_field_dynamic(:type, :colon, "creature")

        "artifact" ->
          text_field_dynamic(:type, :colon, "artifact")

        "enchantment" ->
          text_field_dynamic(:type, :colon, "enchantment")

        "planeswalker" ->
          text_field_dynamic(:type, :colon, "planeswalker")

        "instant" ->
          text_field_dynamic(:type, :colon, "instant")

        "sorcery" ->
          text_field_dynamic(:type, :colon, "sorcery")

        "permanent" ->
          permanent_dynamic()

        "spell" ->
          dynamic(
            [_item, _printing, card, _location],
            not fragment("lower(coalesce(?, '')) LIKE '%land%'", card.type_line)
          )

        _unsupported ->
          dynamic(false)
      end

    if op == :neq,
      do: dynamic([item, printing, card, location], not (^condition)),
      else: condition
  end

  defp is_dynamic(_op, _value), do: dynamic(false)

  defp permanent_dynamic do
    Enum.reduce(
      ~w(artifact creature enchantment land planeswalker battle),
      dynamic(false),
      fn type, acc ->
        dynamic(
          [item, printing, card, location],
          ^acc or ^text_field_dynamic(:type, :colon, type)
        )
      end
    )
  end

  defp date_dynamic(op, value) do
    case Date.from_iso8601(value) do
      {:ok, date} ->
        case normalize_comparison_op(op) do
          :eq -> dynamic([_item, printing, _card, _location], printing.released_at == ^date)
          :neq -> dynamic([_item, printing, _card, _location], printing.released_at != ^date)
          :gt -> dynamic([_item, printing, _card, _location], printing.released_at > ^date)
          :gte -> dynamic([_item, printing, _card, _location], printing.released_at >= ^date)
          :lt -> dynamic([_item, printing, _card, _location], printing.released_at < ^date)
          :lte -> dynamic([_item, printing, _card, _location], printing.released_at <= ^date)
        end

      _invalid ->
        dynamic(false)
    end
  end

  defp year_dynamic(op, value) do
    case Integer.parse(value) do
      {year, ""} ->
        case normalize_comparison_op(op) do
          :eq ->
            dynamic(
              [_item, printing, _card, _location],
              fragment("CAST(strftime('%Y', ?) AS INTEGER)", printing.released_at) == ^year
            )

          :neq ->
            dynamic(
              [_item, printing, _card, _location],
              fragment("CAST(strftime('%Y', ?) AS INTEGER)", printing.released_at) != ^year
            )

          :gt ->
            dynamic(
              [_item, printing, _card, _location],
              fragment("CAST(strftime('%Y', ?) AS INTEGER)", printing.released_at) > ^year
            )

          :gte ->
            dynamic(
              [_item, printing, _card, _location],
              fragment("CAST(strftime('%Y', ?) AS INTEGER)", printing.released_at) >= ^year
            )

          :lt ->
            dynamic(
              [_item, printing, _card, _location],
              fragment("CAST(strftime('%Y', ?) AS INTEGER)", printing.released_at) < ^year
            )

          :lte ->
            dynamic(
              [_item, printing, _card, _location],
              fragment("CAST(strftime('%Y', ?) AS INTEGER)", printing.released_at) <= ^year
            )
        end

      _invalid ->
        dynamic(false)
    end
  end

  defp normalize_comparison_op(:colon), do: :eq
  defp normalize_comparison_op(op) when op in [:eq, :neq, :gt, :gte, :lt, :lte], do: op
  defp normalize_comparison_op(_op), do: :eq

  defp normalize_color_op(:colon), do: :eq
  defp normalize_color_op(op) when op in [:eq, :neq, :gt, :gte, :lt, :lte], do: op
  defp normalize_color_op(_op), do: :eq

  defp parse_color_set(value) do
    letters =
      value
      |> String.replace(~r/[^a-z]/, "")
      |> color_letters()
      |> Enum.uniq()

    if letters == [], do: :error, else: {:ok, letters}
  end

  defp color_letters("white"), do: ["W"]
  defp color_letters("blue"), do: ["U"]
  defp color_letters("black"), do: ["B"]
  defp color_letters("red"), do: ["R"]
  defp color_letters("green"), do: ["G"]

  defp color_letters(value) do
    value
    |> String.graphemes()
    |> Enum.flat_map(fn
      "w" -> ["W"]
      "u" -> ["U"]
      "b" -> ["B"]
      "r" -> ["R"]
      "g" -> ["G"]
      _other -> []
    end)
  end

  defp rarity_rank(value) do
    case downcase(value) do
      "c" -> {:ok, 1}
      "common" -> {:ok, 1}
      "u" -> {:ok, 2}
      "uncommon" -> {:ok, 2}
      "r" -> {:ok, 3}
      "rare" -> {:ok, 3}
      "m" -> {:ok, 4}
      "mythic" -> {:ok, 4}
      "s" -> {:ok, 5}
      "special" -> {:ok, 5}
      "b" -> {:ok, 6}
      "bonus" -> {:ok, 6}
      _other -> :error
    end
  end

  defp numeric_string?(value), do: String.match?(value, ~r/^\d+$/)

  defp like_pattern(value) do
    value
    |> String.replace("\\", "\\\\")
    |> String.replace("%", "\\%")
    |> String.replace("_", "\\_")
    |> then(&"%#{&1}%")
  end

  defp downcase(value), do: value |> to_string() |> String.trim() |> String.downcase()

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
