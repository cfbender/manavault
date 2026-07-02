defmodule Manavault.Catalog.Search.Cards.ScalarPredicates do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.Search.Cards.{ColorPredicates, TextPredicates, Values}

  import Manavault.Catalog.PriceFragments, only: [price_fragment: 1]

  defmacrop rarity_rank_fragment(field) do
    quote do
      fragment(
        "CASE lower(coalesce(?, '')) WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3 WHEN 'mythic' THEN 4 WHEN 'special' THEN 5 WHEN 'bonus' THEN 6 ELSE 0 END",
        unquote(field)
      )
    end
  end

  def mana_value(op, value) do
    case value |> Values.downcase() do
      "even" ->
        dynamic([card, _printing], fragment("CAST(coalesce(?, 0) AS INTEGER) % 2 = 0", card.cmc))

      "odd" ->
        dynamic([card, _printing], fragment("CAST(coalesce(?, 0) AS INTEGER) % 2 = 1", card.cmc))

      value ->
        numeric_card(:mana_value, op, value)
    end
  end

  def rarity(op, value) do
    with {:ok, rank} <- Values.rarity_rank(value) do
      case Values.comparison_op(op) do
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

  def set(op, value) when op in [:colon, :eq, :neq] do
    value = Values.downcase(value)
    pattern = Values.like_pattern(value)

    condition =
      dynamic(
        [_card, printing],
        fragment("lower(?)", printing.set_code) == ^value or
          fragment("lower(coalesce(?, '')) LIKE ? ESCAPE '\\'", printing.set_name, ^pattern)
      )

    if op == :neq, do: dynamic([card, printing], not (^condition)), else: condition
  end

  def set(_op, _value), do: dynamic(false)

  def collector_number(op, value) when op in [:colon, :eq, :neq] do
    value = Values.downcase(value)

    condition =
      dynamic([_card, printing], fragment("lower(?)", printing.collector_number) == ^value)

    if op == :neq, do: dynamic([card, printing], not (^condition)), else: condition
  end

  def collector_number(op, value) do
    case Integer.parse(value) do
      {number, ""} ->
        case Values.comparison_op(op) do
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

  def language(op, value) when op in [:colon, :eq, :neq] do
    value = Values.downcase(value)
    condition = dynamic([_card, printing], fragment("lower(?)", printing.lang) == ^value)
    if op == :neq, do: dynamic([card, printing], not (^condition)), else: condition
  end

  def language(_op, _value), do: dynamic(false)

  def price(op, value) do
    case Float.parse(value) do
      {number, ""} ->
        case Values.comparison_op(op) do
          :eq -> dynamic([_card, printing], price_fragment(printing) == ^number)
          :neq -> dynamic([_card, printing], price_fragment(printing) != ^number)
          :gt -> dynamic([_card, printing], price_fragment(printing) > ^number)
          :gte -> dynamic([_card, printing], price_fragment(printing) >= ^number)
          :lt -> dynamic([_card, printing], price_fragment(printing) < ^number)
          :lte -> dynamic([_card, printing], price_fragment(printing) <= ^number)
        end

      _invalid ->
        dynamic(false)
    end
  end

  def date(op, value) do
    case Date.from_iso8601(value) do
      {:ok, date} ->
        case Values.comparison_op(op) do
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

  def year(op, value) do
    case Integer.parse(value) do
      {year, ""} ->
        case Values.comparison_op(op) do
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

  def is_predicate(op, value) when op in [:colon, :eq, :neq] do
    condition =
      case Values.downcase(value) do
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
          ColorPredicates.count(:colors, :eq, 0, :eq)

        "multicolor" ->
          ColorPredicates.count(:colors, :gte, 2, :gte)

        "land" ->
          TextPredicates.field(:type, :colon, "land")

        "creature" ->
          TextPredicates.field(:type, :colon, "creature")

        "artifact" ->
          TextPredicates.field(:type, :colon, "artifact")

        "enchantment" ->
          TextPredicates.field(:type, :colon, "enchantment")

        "planeswalker" ->
          TextPredicates.field(:type, :colon, "planeswalker")

        "instant" ->
          TextPredicates.field(:type, :colon, "instant")

        "sorcery" ->
          TextPredicates.field(:type, :colon, "sorcery")

        _unsupported ->
          dynamic(false)
      end

    if op == :neq, do: dynamic([card, printing], not (^condition)), else: condition
  end

  def is_predicate(_op, _value), do: dynamic(false)

  defp numeric_card(:mana_value, op, value) do
    case Float.parse(value) do
      {number, ""} ->
        case Values.comparison_op(op) do
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
end
