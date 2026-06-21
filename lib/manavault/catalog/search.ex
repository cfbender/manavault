defmodule Manavault.Catalog.Search do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, CollectionItem, Printing, ScryfallQuery, Util}
  alias Manavault.Catalog.ScryfallQuery.{And, ExactName, Not, Or, Predicate}
  alias Manavault.Repo

  @card_name_cache_key {__MODULE__, :card_name_suggestions, 2}
  @suggestion_candidate_limit 250

  defmacrop catalog_price_fragment(printing) do
    quote do
      fragment(
        """
        CAST(COALESCE(NULLIF(
          COALESCE(json_extract(?, '$.usd'), json_extract(?, '$.usd_foil'), json_extract(?, '$.usd_etched')),
          ''
        ), '0') AS REAL)
        """,
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

  def search_cards(term, opts \\ []) when is_binary(term) do
    limit = Keyword.get(opts, :limit, 20)

    card_ids =
      Card
      |> join(:left, [card], printing in assoc(card, :printings))
      |> maybe_filter_catalog_cards(term)
      |> group_by([card, _printing], card.oracle_id)
      |> order_by([card, _printing], asc: card.name)
      |> limit(^limit)
      |> select([card, _printing], card.oracle_id)
      |> Repo.all()

    Card
    |> where([card], card.oracle_id in ^card_ids)
    |> Repo.all()
    |> Enum.sort_by(&Enum.find_index(card_ids, fn oracle_id -> oracle_id == &1.oracle_id end))
    |> Repo.preload(printings: from(printing in Printing, order_by: [desc: printing.released_at]))
  end

  defp maybe_filter_catalog_cards(query, term) do
    term = String.trim(term)

    case ScryfallQuery.parse(term) do
      {:ok, %And{terms: []}} ->
        query

      {:ok, expr} ->
        where(query, ^catalog_scryfall_dynamic(expr))

      {:error, _reason} ->
        where(query, ^catalog_text_dynamic(term))
    end
  end

  defp catalog_scryfall_dynamic(%And{terms: terms}) do
    Enum.reduce(terms, dynamic(true), fn term, acc ->
      dynamic([card, printing], ^acc and ^catalog_scryfall_dynamic(term))
    end)
  end

  defp catalog_scryfall_dynamic(%Or{terms: terms}) do
    Enum.reduce(terms, dynamic(false), fn term, acc ->
      dynamic([card, printing], ^acc or ^catalog_scryfall_dynamic(term))
    end)
  end

  defp catalog_scryfall_dynamic(%Not{expr: expr}) do
    dynamic([card, printing], not (^catalog_scryfall_dynamic(expr)))
  end

  defp catalog_scryfall_dynamic(%ExactName{name: name}) do
    dynamic([card, _printing], fragment("lower(?)", card.name) == ^catalog_downcase(name))
  end

  defp catalog_scryfall_dynamic(%Predicate{field: :text, value: value, regex?: false}),
    do: catalog_text_dynamic(value)

  defp catalog_scryfall_dynamic(%Predicate{regex?: true}), do: dynamic(false)

  defp catalog_scryfall_dynamic(%Predicate{field: :name, op: op, value: value}),
    do: catalog_text_field_dynamic(:name, op, value)

  defp catalog_scryfall_dynamic(%Predicate{field: :type, op: op, value: value}),
    do: catalog_text_field_dynamic(:type, op, value)

  defp catalog_scryfall_dynamic(%Predicate{field: :oracle, op: op, value: value}),
    do: catalog_text_field_dynamic(:oracle, op, value)

  defp catalog_scryfall_dynamic(%Predicate{field: :mana, op: op, value: value}),
    do: catalog_text_field_dynamic(:mana, op, value)

  defp catalog_scryfall_dynamic(%Predicate{field: :mana_value, op: op, value: value}),
    do: catalog_mana_value_dynamic(op, value)

  defp catalog_scryfall_dynamic(%Predicate{field: :colors, op: op, value: value}),
    do: catalog_color_dynamic(:colors, op, value)

  defp catalog_scryfall_dynamic(%Predicate{field: :identity, op: op, value: value}),
    do: catalog_color_dynamic(:identity, op, value)

  defp catalog_scryfall_dynamic(%Predicate{field: :rarity, op: op, value: value}),
    do: catalog_rarity_dynamic(op, value)

  defp catalog_scryfall_dynamic(%Predicate{field: :set, op: op, value: value}),
    do: catalog_set_dynamic(op, value)

  defp catalog_scryfall_dynamic(%Predicate{field: :collector_number, op: op, value: value}),
    do: catalog_collector_number_dynamic(op, value)

  defp catalog_scryfall_dynamic(%Predicate{field: :language, op: op, value: value}),
    do: catalog_language_dynamic(op, value)

  defp catalog_scryfall_dynamic(%Predicate{field: :usd, op: op, value: value}),
    do: catalog_price_dynamic(op, value)

  defp catalog_scryfall_dynamic(%Predicate{field: :date, op: op, value: value}),
    do: catalog_date_dynamic(op, value)

  defp catalog_scryfall_dynamic(%Predicate{field: :year, op: op, value: value}),
    do: catalog_year_dynamic(op, value)

  defp catalog_scryfall_dynamic(%Predicate{field: :is, op: op, value: value}),
    do: catalog_is_dynamic(op, value)

  defp catalog_scryfall_dynamic(_unsupported), do: dynamic(false)

  defp catalog_text_dynamic(term) do
    pattern = term |> catalog_downcase() |> catalog_like_pattern()
    dynamic([card, _printing], fragment("lower(?) LIKE ? ESCAPE '\\'", card.name, ^pattern))
  end

  defp catalog_text_field_dynamic(_field, _op, ""), do: dynamic(true)

  defp catalog_text_field_dynamic(field, op, value) when op in [:colon, :eq, :neq] do
    pattern = value |> catalog_downcase() |> catalog_like_pattern()

    condition =
      case field do
        :name ->
          dynamic([card, _printing], fragment("lower(?) LIKE ? ESCAPE '\\'", card.name, ^pattern))

        :type ->
          dynamic(
            [card, _printing],
            fragment("lower(coalesce(?, '')) LIKE ? ESCAPE '\\'", card.type_line, ^pattern)
          )

        :oracle ->
          dynamic(
            [card, _printing],
            fragment("lower(coalesce(?, '')) LIKE ? ESCAPE '\\'", card.oracle_text, ^pattern)
          )

        :mana ->
          dynamic(
            [card, _printing],
            fragment("lower(coalesce(?, '')) LIKE ? ESCAPE '\\'", card.mana_cost, ^pattern)
          )
      end

    if op == :neq, do: dynamic([card, printing], not (^condition)), else: condition
  end

  defp catalog_text_field_dynamic(_field, _op, _value), do: dynamic(false)

  defp catalog_mana_value_dynamic(op, value) do
    case value |> catalog_downcase() do
      "even" ->
        dynamic([card, _printing], fragment("CAST(coalesce(?, 0) AS INTEGER) % 2 = 0", card.cmc))

      "odd" ->
        dynamic([card, _printing], fragment("CAST(coalesce(?, 0) AS INTEGER) % 2 = 1", card.cmc))

      value ->
        catalog_numeric_card_dynamic(:mana_value, op, value)
    end
  end

  defp catalog_numeric_card_dynamic(:mana_value, op, value) do
    case Float.parse(value) do
      {number, ""} ->
        case catalog_comparison_op(op) do
          :eq -> dynamic([card, _printing], card.cmc == ^number)
          :neq -> dynamic([card, _printing], card.cmc != ^number)
          :gt -> dynamic([card, _printing], card.cmc > ^number)
          :gte -> dynamic([card, _printing], card.cmc >= ^number)
          :lt -> dynamic([card, _printing], card.cmc < ^number)
          :lte -> dynamic([card, _printing], card.cmc <= ^number)
        end

      _invalid ->
        dynamic(false)
    end
  end

  defp catalog_color_dynamic(field, op, value) do
    value = catalog_downcase(value)

    cond do
      value in ["m", "multicolor"] ->
        catalog_color_count_dynamic(field, op, 2, :gte)

      value in ["c", "colorless"] ->
        catalog_color_count_dynamic(field, op, 0, :eq)

      String.match?(value, ~r/^\d+$/) ->
        {count, ""} = Integer.parse(value)
        catalog_color_count_dynamic(field, op, count, :eq)

      true ->
        case catalog_parse_color_set(value) do
          {:ok, colors} -> catalog_color_set_dynamic(field, op, colors)
          :error -> dynamic(false)
        end
    end
  end

  defp catalog_color_count_dynamic(field, op, count, default_op) do
    op = if op == :colon, do: default_op, else: catalog_comparison_op(op)

    case {field, op} do
      {:colors, :eq} ->
        dynamic([card, _printing], json_array_count(card.colors) == ^count)

      {:colors, :neq} ->
        dynamic([card, _printing], json_array_count(card.colors) != ^count)

      {:colors, :gt} ->
        dynamic([card, _printing], json_array_count(card.colors) > ^count)

      {:colors, :gte} ->
        dynamic([card, _printing], json_array_count(card.colors) >= ^count)

      {:colors, :lt} ->
        dynamic([card, _printing], json_array_count(card.colors) < ^count)

      {:colors, :lte} ->
        dynamic([card, _printing], json_array_count(card.colors) <= ^count)

      {:identity, :eq} ->
        dynamic([card, _printing], json_array_count(card.color_identity) == ^count)

      {:identity, :neq} ->
        dynamic([card, _printing], json_array_count(card.color_identity) != ^count)

      {:identity, :gt} ->
        dynamic([card, _printing], json_array_count(card.color_identity) > ^count)

      {:identity, :gte} ->
        dynamic([card, _printing], json_array_count(card.color_identity) >= ^count)

      {:identity, :lt} ->
        dynamic([card, _printing], json_array_count(card.color_identity) < ^count)

      {:identity, :lte} ->
        dynamic([card, _printing], json_array_count(card.color_identity) <= ^count)
    end
  end

  defp catalog_color_set_dynamic(field, op, colors) do
    op = if op == :colon, do: :eq, else: catalog_comparison_op(op)
    contains = catalog_contains_colors_dynamic(field, colors)
    excludes = catalog_excludes_other_colors_dynamic(field, colors)
    count = length(colors)

    case op do
      :eq ->
        dynamic([card, printing], ^contains and ^excludes)

      :neq ->
        dynamic([card, printing], not (^contains and ^excludes))

      :gte ->
        contains

      :lte ->
        excludes

      :gt ->
        dynamic(
          [card, printing],
          ^contains and ^catalog_color_count_dynamic(field, :gt, count, :gt)
        )

      :lt ->
        dynamic(
          [card, printing],
          ^excludes and ^catalog_color_count_dynamic(field, :lt, count, :lt)
        )
    end
  end

  defp catalog_contains_colors_dynamic(field, colors) do
    Enum.reduce(colors, dynamic(true), fn color, acc ->
      catalog_color_presence_dynamic(field, color, acc, true)
    end)
  end

  defp catalog_excludes_other_colors_dynamic(field, colors) do
    ~w(W U B R G)
    |> Enum.reject(&(&1 in colors))
    |> Enum.reduce(dynamic(true), fn color, acc ->
      catalog_color_presence_dynamic(field, color, acc, false)
    end)
  end

  defp catalog_color_presence_dynamic(:colors, color, acc, true),
    do:
      dynamic(
        [card, _printing],
        ^acc and fragment("instr(coalesce(?, '[]'), ?) > 0", card.colors, ^~s("#{color}"))
      )

  defp catalog_color_presence_dynamic(:colors, color, acc, false),
    do:
      dynamic(
        [card, _printing],
        ^acc and fragment("instr(coalesce(?, '[]'), ?) = 0", card.colors, ^~s("#{color}"))
      )

  defp catalog_color_presence_dynamic(:identity, color, acc, true),
    do:
      dynamic(
        [card, _printing],
        ^acc and fragment("instr(coalesce(?, '[]'), ?) > 0", card.color_identity, ^~s("#{color}"))
      )

  defp catalog_color_presence_dynamic(:identity, color, acc, false),
    do:
      dynamic(
        [card, _printing],
        ^acc and fragment("instr(coalesce(?, '[]'), ?) = 0", card.color_identity, ^~s("#{color}"))
      )

  defp catalog_rarity_dynamic(op, value) do
    with {:ok, rank} <- catalog_rarity_rank(value) do
      case catalog_comparison_op(op) do
        :eq -> dynamic([_card, printing], rarity_rank_fragment(printing.rarity) == ^rank)
        :neq -> dynamic([_card, printing], rarity_rank_fragment(printing.rarity) != ^rank)
        :gt -> dynamic([_card, printing], rarity_rank_fragment(printing.rarity) > ^rank)
        :gte -> dynamic([_card, printing], rarity_rank_fragment(printing.rarity) >= ^rank)
        :lt -> dynamic([_card, printing], rarity_rank_fragment(printing.rarity) < ^rank)
        :lte -> dynamic([_card, printing], rarity_rank_fragment(printing.rarity) <= ^rank)
      end
    else
      :error -> dynamic(false)
    end
  end

  defp catalog_set_dynamic(op, value) when op in [:colon, :eq, :neq] do
    value = catalog_downcase(value)
    pattern = catalog_like_pattern(value)

    condition =
      dynamic(
        [_card, printing],
        fragment("lower(?)", printing.set_code) == ^value or
          fragment("lower(coalesce(?, '')) LIKE ? ESCAPE '\\'", printing.set_name, ^pattern)
      )

    if op == :neq, do: dynamic([card, printing], not (^condition)), else: condition
  end

  defp catalog_set_dynamic(_op, _value), do: dynamic(false)

  defp catalog_collector_number_dynamic(op, value) when op in [:colon, :eq, :neq] do
    value = catalog_downcase(value)

    condition =
      dynamic([_card, printing], fragment("lower(?)", printing.collector_number) == ^value)

    if op == :neq, do: dynamic([card, printing], not (^condition)), else: condition
  end

  defp catalog_collector_number_dynamic(op, value) do
    case Integer.parse(value) do
      {number, ""} ->
        case catalog_comparison_op(op) do
          :gt ->
            dynamic(
              [_card, printing],
              fragment("CAST(? AS INTEGER)", printing.collector_number) > ^number
            )

          :gte ->
            dynamic(
              [_card, printing],
              fragment("CAST(? AS INTEGER)", printing.collector_number) >= ^number
            )

          :lt ->
            dynamic(
              [_card, printing],
              fragment("CAST(? AS INTEGER)", printing.collector_number) < ^number
            )

          :lte ->
            dynamic(
              [_card, printing],
              fragment("CAST(? AS INTEGER)", printing.collector_number) <= ^number
            )

          _op ->
            dynamic(false)
        end

      _invalid ->
        dynamic(false)
    end
  end

  defp catalog_language_dynamic(op, value) when op in [:colon, :eq, :neq] do
    value = catalog_downcase(value)
    condition = dynamic([_card, printing], fragment("lower(?)", printing.lang) == ^value)
    if op == :neq, do: dynamic([card, printing], not (^condition)), else: condition
  end

  defp catalog_language_dynamic(_op, _value), do: dynamic(false)

  defp catalog_price_dynamic(op, value) do
    case Float.parse(value) do
      {number, ""} ->
        case catalog_comparison_op(op) do
          :eq -> dynamic([_card, printing], catalog_price_fragment(printing) == ^number)
          :neq -> dynamic([_card, printing], catalog_price_fragment(printing) != ^number)
          :gt -> dynamic([_card, printing], catalog_price_fragment(printing) > ^number)
          :gte -> dynamic([_card, printing], catalog_price_fragment(printing) >= ^number)
          :lt -> dynamic([_card, printing], catalog_price_fragment(printing) < ^number)
          :lte -> dynamic([_card, printing], catalog_price_fragment(printing) <= ^number)
        end

      _invalid ->
        dynamic(false)
    end
  end

  defp catalog_date_dynamic(op, value) do
    case Date.from_iso8601(value) do
      {:ok, date} ->
        case catalog_comparison_op(op) do
          :eq -> dynamic([_card, printing], printing.released_at == ^date)
          :neq -> dynamic([_card, printing], printing.released_at != ^date)
          :gt -> dynamic([_card, printing], printing.released_at > ^date)
          :gte -> dynamic([_card, printing], printing.released_at >= ^date)
          :lt -> dynamic([_card, printing], printing.released_at < ^date)
          :lte -> dynamic([_card, printing], printing.released_at <= ^date)
        end

      _invalid ->
        dynamic(false)
    end
  end

  defp catalog_year_dynamic(op, value) do
    case Integer.parse(value) do
      {year, ""} ->
        case catalog_comparison_op(op) do
          :eq ->
            dynamic(
              [_card, printing],
              fragment("CAST(strftime('%Y', ?) AS INTEGER)", printing.released_at) == ^year
            )

          :neq ->
            dynamic(
              [_card, printing],
              fragment("CAST(strftime('%Y', ?) AS INTEGER)", printing.released_at) != ^year
            )

          :gt ->
            dynamic(
              [_card, printing],
              fragment("CAST(strftime('%Y', ?) AS INTEGER)", printing.released_at) > ^year
            )

          :gte ->
            dynamic(
              [_card, printing],
              fragment("CAST(strftime('%Y', ?) AS INTEGER)", printing.released_at) >= ^year
            )

          :lt ->
            dynamic(
              [_card, printing],
              fragment("CAST(strftime('%Y', ?) AS INTEGER)", printing.released_at) < ^year
            )

          :lte ->
            dynamic(
              [_card, printing],
              fragment("CAST(strftime('%Y', ?) AS INTEGER)", printing.released_at) <= ^year
            )
        end

      _invalid ->
        dynamic(false)
    end
  end

  defp catalog_is_dynamic(op, value) when op in [:colon, :eq, :neq] do
    condition =
      case catalog_downcase(value) do
        "foil" ->
          dynamic(
            [_card, printing],
            fragment("instr(coalesce(?, '[]'), '\"foil\"') > 0", printing.finishes)
          )

        "nonfoil" ->
          dynamic(
            [_card, printing],
            fragment("instr(coalesce(?, '[]'), '\"nonfoil\"') > 0", printing.finishes)
          )

        "etched" ->
          dynamic(
            [_card, printing],
            fragment("instr(coalesce(?, '[]'), '\"etched\"') > 0", printing.finishes)
          )

        "colorless" ->
          catalog_color_count_dynamic(:colors, :eq, 0, :eq)

        "multicolor" ->
          catalog_color_count_dynamic(:colors, :gte, 2, :gte)

        "land" ->
          catalog_text_field_dynamic(:type, :colon, "land")

        "creature" ->
          catalog_text_field_dynamic(:type, :colon, "creature")

        "artifact" ->
          catalog_text_field_dynamic(:type, :colon, "artifact")

        "enchantment" ->
          catalog_text_field_dynamic(:type, :colon, "enchantment")

        "planeswalker" ->
          catalog_text_field_dynamic(:type, :colon, "planeswalker")

        "instant" ->
          catalog_text_field_dynamic(:type, :colon, "instant")

        "sorcery" ->
          catalog_text_field_dynamic(:type, :colon, "sorcery")

        _unsupported ->
          dynamic(false)
      end

    if op == :neq, do: dynamic([card, printing], not (^condition)), else: condition
  end

  defp catalog_is_dynamic(_op, _value), do: dynamic(false)

  defp catalog_comparison_op(:colon), do: :eq
  defp catalog_comparison_op(op) when op in [:eq, :neq, :gt, :gte, :lt, :lte], do: op
  defp catalog_comparison_op(_op), do: :eq

  defp catalog_parse_color_set(value) do
    letters =
      value
      |> String.replace(~r/[^a-z]/, "")
      |> catalog_color_letters()
      |> Enum.uniq()

    if letters == [], do: :error, else: {:ok, letters}
  end

  defp catalog_color_letters("white"), do: ["W"]
  defp catalog_color_letters("blue"), do: ["U"]
  defp catalog_color_letters("black"), do: ["B"]
  defp catalog_color_letters("red"), do: ["R"]
  defp catalog_color_letters("green"), do: ["G"]

  defp catalog_color_letters(value) do
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

  defp catalog_rarity_rank(value) do
    case catalog_downcase(value) do
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

  defp catalog_like_pattern(value) do
    value
    |> String.replace("\\", "\\\\")
    |> String.replace("%", "\\%")
    |> String.replace("_", "\\_")
    |> then(&"%#{&1}%")
  end

  defp catalog_downcase(value), do: value |> to_string() |> String.trim() |> String.downcase()

  def suggest_card_names(term, opts \\ []) when is_binary(term) do
    limit = Keyword.get(opts, :limit, 5)
    normalized_term = normalize_card_suggestion(term)

    if normalized_term == "" do
      []
    else
      candidate_limit = Keyword.get(opts, :candidate_limit, @suggestion_candidate_limit)

      normalized_term
      |> card_name_suggestion_candidates(candidate_limit)
      |> Enum.map(fn %{name: name} -> {card_name_match_score(normalized_term, name), name} end)
      |> Enum.sort_by(fn {score, name} -> {score, String.downcase(name)} end)
      |> Enum.take(limit)
      |> Enum.map(fn {_score, name} -> name end)
    end
  end

  def get_printing_by_scryfall_id(scryfall_id) when is_binary(scryfall_id) do
    Printing
    |> Repo.get(scryfall_id)
    |> Repo.preload(:card)
  end

  def get_printing(set_code, collector_number)
      when is_binary(set_code) and is_binary(collector_number) do
    Repo.one(
      from printing in Printing,
        where:
          printing.set_code == ^String.downcase(set_code) and
            printing.collector_number == ^collector_number,
        limit: 1
    )
  end

  def get_card_with_printings(oracle_id) when is_binary(oracle_id) do
    case Repo.get(Card, oracle_id) do
      nil ->
        nil

      card ->
        owned_counts = printing_owned_counts(oracle_id)

        Repo.preload(card,
          printings: from(printing in Printing, order_by: [desc: printing.released_at])
        )
        |> Map.update!(:printings, fn printings ->
          Enum.map(printings, &%{&1 | owned_count: Map.get(owned_counts, &1.scryfall_id, 0)})
        end)
    end
  end

  defp printing_owned_counts(oracle_id) do
    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:left, [item, _printing], location in assoc(item, :location_assoc))
    |> where([_item, printing, _location], printing.oracle_id == ^oracle_id)
    |> where([_item, _printing, location], is_nil(location.id) or location.kind != "list")
    |> group_by([item, _printing, _location], item.scryfall_id)
    |> select([item, _printing, _location], {item.scryfall_id, coalesce(sum(item.quantity), 0)})
    |> Repo.all()
    |> Map.new()
  end

  def search_printings(filters, opts \\ []) when is_list(filters) do
    limit = Keyword.get(opts, :limit, 50)
    name = filters |> Keyword.get(:name, "") |> Util.normalize_filter()

    set_code =
      filters |> Keyword.get(:set_code, "") |> Util.normalize_filter() |> String.downcase()

    collector_number = filters |> Keyword.get(:collector_number, "") |> Util.normalize_filter()

    if name == "" and set_code == "" and collector_number == "" do
      []
    else
      Printing
      |> join(:inner, [printing], card in assoc(printing, :card))
      |> maybe_filter_card_name(name)
      |> maybe_filter_set_code(set_code)
      |> maybe_filter_collector_number(collector_number)
      |> preload([_printing, card], card: card)
      |> order_by([printing, card],
        asc: card.name,
        asc: printing.set_code,
        asc: printing.collector_number
      )
      |> limit(^limit)
      |> Repo.all()
    end
  end

  def search_sets(term, opts \\ []) when is_binary(term) do
    limit = Keyword.get(opts, :limit, 12)
    query = Util.normalize_filter(term)

    if query == "" do
      []
    else
      pattern = "%#{String.downcase(query)}%"

      Printing
      |> where(
        [printing],
        fragment("lower(?) LIKE ?", printing.set_code, ^pattern) or
          fragment("lower(coalesce(?, '')) LIKE ?", printing.set_name, ^pattern)
      )
      |> group_by([printing], [printing.set_code, printing.set_name])
      |> order_by([printing], asc: printing.set_name, asc: printing.set_code)
      |> select([printing], %{set_code: printing.set_code, set_name: printing.set_name})
      |> limit(^limit)
      |> Repo.all()
    end
  end

  def list_printings_for_oracle_id(oracle_id) do
    Printing
    |> where([printing], printing.oracle_id == ^oracle_id)
    |> order_by([printing],
      desc: printing.released_at,
      asc: printing.set_code,
      asc: printing.collector_number
    )
    |> Repo.all()
    |> Repo.preload(:card)
  end

  defp card_name_suggestion_candidates(term, candidate_limit) do
    cache = cached_card_names()

    cache
    |> candidate_pool(term)
    |> Enum.filter(&card_name_candidate?(term, &1))
    |> Enum.take(candidate_limit)
  end

  defp cached_card_names do
    case :persistent_term.get(@card_name_cache_key, nil) do
      nil ->
        entries =
          Card
          |> select([card], card.name)
          |> order_by([card], asc: card.name)
          |> Repo.all()
          |> Enum.uniq()
          |> Enum.map(&card_name_cache_entry/1)

        cache = %{
          entries: entries,
          by_initial: index_card_names_by_initial(entries),
          by_ngram: index_card_names_by_ngram(entries)
        }

        :persistent_term.put(@card_name_cache_key, cache)
        cache

      %{by_initial: _by_initial, by_ngram: _by_ngram} = cache ->
        cache

      _stale_cache ->
        clear_card_name_suggestion_cache()
        cached_card_names()
    end
  end

  def clear_card_name_suggestion_cache do
    try do
      :persistent_term.erase(@card_name_cache_key)
    rescue
      ArgumentError -> :ok
    end
  end

  defp card_name_cache_entry(name) do
    normalized_name = normalize_card_suggestion(name)

    %{
      name: name,
      normalized_name: normalized_name,
      compact_name: String.replace(normalized_name, " ", ""),
      tokens: String.split(normalized_name, " ", trim: true)
    }
  end

  defp index_card_names_by_initial(entries) do
    Enum.reduce(entries, %{}, fn entry, index ->
      entry.tokens
      |> Enum.flat_map(&token_initial/1)
      |> Enum.uniq()
      |> Enum.reduce(index, fn initial, index ->
        Map.update(index, initial, [entry], &[entry | &1])
      end)
    end)
  end

  defp index_card_names_by_ngram(entries) do
    Enum.reduce(entries, %{}, fn entry, index ->
      entry.compact_name
      |> name_ngrams()
      |> Enum.reduce(index, fn ngram, index ->
        Map.update(index, ngram, [entry], &[entry | &1])
      end)
    end)
  end

  defp candidate_pool(%{by_initial: by_initial}, term) when byte_size(term) < 3 do
    term
    |> String.split(" ", trim: true)
    |> Enum.flat_map(&token_initial/1)
    |> Enum.flat_map(&Map.get(by_initial, &1, []))
    |> uniq_card_name_entries()
  end

  defp candidate_pool(%{by_ngram: by_ngram}, term) do
    compact_term = String.replace(term, " ", "")

    compact_term
    |> name_ngrams()
    |> Enum.flat_map(&Map.get(by_ngram, &1, []))
    |> uniq_card_name_entries()
  end

  defp name_ngrams(value) do
    graphemes = String.graphemes(value)

    cond do
      length(graphemes) >= 3 ->
        graphemes
        |> Enum.chunk_every(3, 1, :discard)
        |> Enum.map(&Enum.join/1)
        |> Enum.uniq()

      value == "" ->
        []

      true ->
        [value]
    end
  end

  defp uniq_card_name_entries(entries) do
    entries
    |> Enum.uniq_by(& &1.name)
    |> Enum.sort_by(&String.downcase(&1.name))
  end

  defp normalize_card_suggestion(value) do
    value
    |> String.downcase()
    |> String.replace(~r/[^[:alnum:]]+/u, " ")
    |> String.trim()
  end

  defp card_name_match_score(term, name) do
    normalized_name = normalize_card_suggestion(name)

    contains_score =
      cond do
        normalized_name == term -> 0
        String.starts_with?(normalized_name, term) -> 1
        String.contains?(normalized_name, term) -> 2
        true -> 8
      end

    token_distance =
      normalized_name
      |> String.split(" ", trim: true)
      |> Enum.map(&edit_distance(term, &1))
      |> Enum.min(fn -> edit_distance(term, normalized_name) end)

    full_distance = edit_distance(term, normalized_name)
    contains_score * 100 + min(full_distance, token_distance + 2)
  end

  defp card_name_candidate?(term, %{
         normalized_name: normalized_name,
         compact_name: compact_name,
         tokens: name_tokens
       }) do
    compact_term = String.replace(term, " ", "")
    term_tokens = String.split(term, " ", trim: true)

    exact_or_substring? =
      normalized_name == term or
        String.starts_with?(normalized_name, term) or
        String.contains?(normalized_name, term) or
        String.starts_with?(compact_name, compact_term) or
        String.contains?(compact_name, compact_term) or
        token_prefix_match?(term_tokens, name_tokens)

    exact_or_substring? or fuzzy_candidate?(term, term_tokens, normalized_name, name_tokens)
  end

  defp fuzzy_candidate?(term, term_tokens, normalized_name, name_tokens) do
    String.length(term) >= 4 and
      abs(String.length(term) - String.length(normalized_name)) <= 8 and
      token_initial_match?(term_tokens, name_tokens) and
      card_name_distance_match?(term, normalized_name)
  end

  defp card_name_distance_match?(term, normalized_name) do
    distance_threshold = max(3, div(String.length(term), 4))
    distances = card_name_distances(term, normalized_name)

    Enum.min(distances) <= distance_threshold
  end

  defp token_prefix_match?(term_tokens, name_tokens) do
    Enum.any?(term_tokens, fn term_token ->
      Enum.any?(name_tokens, &String.starts_with?(&1, term_token))
    end)
  end

  defp token_initial_match?(term_tokens, name_tokens) do
    term_initials = Enum.flat_map(term_tokens, &token_initial/1)
    name_initials = Enum.flat_map(name_tokens, &token_initial/1)

    Enum.any?(term_initials, &(&1 in name_initials))
  end

  defp token_initial(token) do
    case String.graphemes(token) do
      [initial | _rest] -> [initial]
      [] -> []
    end
  end

  defp card_name_distances(term, normalized_name) do
    token_distances =
      normalized_name
      |> String.split(" ", trim: true)
      |> Enum.map(&edit_distance(term, &1))

    [edit_distance(term, normalized_name) | token_distances]
  end

  defp edit_distance(left, right) when left == right, do: 0
  defp edit_distance("", right), do: String.length(right)
  defp edit_distance(left, ""), do: String.length(left)

  defp edit_distance(left, right) do
    right_chars = String.graphemes(right)
    initial_row = Enum.to_list(0..length(right_chars))

    left
    |> String.graphemes()
    |> Enum.with_index(1)
    |> Enum.reduce(initial_row, fn {left_char, row_index}, previous_row ->
      {row, _left_value} =
        right_chars
        |> Enum.with_index(1)
        |> Enum.reduce({[row_index], row_index}, fn {right_char, column_index},
                                                    {row, left_value} ->
          insert_cost = left_value + 1
          delete_cost = Enum.at(previous_row, column_index) + 1

          replace_cost =
            Enum.at(previous_row, column_index - 1) +
              if(left_char == right_char, do: 0, else: 1)

          value = min(insert_cost, min(delete_cost, replace_cost))

          {row ++ [value], value}
        end)

      row
    end)
    |> List.last()
  end

  defp maybe_filter_card_name(query, ""), do: query

  defp maybe_filter_card_name(query, name) do
    pattern = "%#{String.downcase(name)}%"
    where(query, [_printing, card], fragment("lower(?) LIKE ?", card.name, ^pattern))
  end

  defp maybe_filter_set_code(query, ""), do: query

  defp maybe_filter_set_code(query, set_code) do
    where(query, [printing, _card], printing.set_code == ^set_code)
  end

  defp maybe_filter_collector_number(query, ""), do: query

  defp maybe_filter_collector_number(query, collector_number) do
    where(query, [printing, _card], printing.collector_number == ^collector_number)
  end
end
