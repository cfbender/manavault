defmodule Manavault.Catalog.CardCollection.SearchFilter.ScalarPredicates do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.CardCollection.SearchFilter.{ColorPredicates, TextPredicates, Values}

  import Manavault.Catalog.PriceFragments, only: [price_value_fragment: 2]

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
        numeric_value(:mana_value, op, value)
    end
  end

  def rarity(op, value) do
    with {:ok, rank} <- Values.rarity_rank(value) do
      case Values.comparison_op(op) do
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

  def set(op, value) when op in [:colon, :eq, :neq] do
    value = Values.downcase(value)
    pattern = Values.like_pattern(value)

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

  def set(_op, _value), do: dynamic(false)

  def collector_number(op, value) when op in [:colon, :eq, :neq] do
    value = Values.downcase(value)

    condition =
      dynamic(
        [_item, printing, _card, _location],
        fragment("lower(?)", printing.collector_number) == ^value
      )

    if op == :neq,
      do: dynamic([item, printing, card, location], not (^condition)),
      else: condition
  end

  def collector_number(op, value) do
    case Integer.parse(value) do
      {number, ""} ->
        case Values.comparison_op(op) do
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

  def language(op, value) when op in [:colon, :eq, :neq] do
    value = Values.downcase(value)

    condition =
      dynamic([item, _printing, _card, _location], fragment("lower(?)", item.language) == ^value)

    if op == :neq,
      do: dynamic([item, printing, card, location], not (^condition)),
      else: condition
  end

  def language(_op, _value), do: dynamic(false)

  def price(op, value) do
    case Float.parse(value) do
      {number, ""} ->
        case Values.comparison_op(op) do
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

  def is_predicate(op, value) when op in [:colon, :eq, :neq] do
    value = Values.downcase(value)

    condition =
      case value do
        "foil" ->
          dynamic([item, _printing, _card, _location], item.finish == "foil")

        "nonfoil" ->
          dynamic([item, _printing, _card, _location], item.finish == "nonfoil")

        "etched" ->
          dynamic([item, _printing, _card, _location], item.finish == "etched")

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

        "permanent" ->
          permanent()

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

  def is_predicate(_op, _value), do: dynamic(false)

  def quantity(op, value) do
    case Integer.parse(value) do
      {number, ""} ->
        case Values.comparison_op(op) do
          :eq -> dynamic([item, _printing, _card, _location], item.quantity == ^number)
          :neq -> dynamic([item, _printing, _card, _location], item.quantity != ^number)
          :gt -> dynamic([item, _printing, _card, _location], item.quantity > ^number)
          :gte -> dynamic([item, _printing, _card, _location], item.quantity >= ^number)
          :lt -> dynamic([item, _printing, _card, _location], item.quantity < ^number)
          :lte -> dynamic([item, _printing, _card, _location], item.quantity <= ^number)
        end

      _invalid ->
        dynamic(false)
    end
  end

  def date(op, value) do
    case Date.from_iso8601(value) do
      {:ok, date} ->
        case Values.comparison_op(op) do
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

  def year(op, value) do
    case Integer.parse(value) do
      {year, ""} ->
        case Values.comparison_op(op) do
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

  defp numeric_value(:mana_value, op, value) do
    case Float.parse(value) do
      {number, ""} -> numeric_comparison(:mana_value, op, number)
      _invalid -> dynamic(false)
    end
  end

  defp numeric_comparison(:mana_value, op, number) do
    case Values.comparison_op(op) do
      :eq -> dynamic([_item, _printing, card, _location], card.cmc == ^number)
      :neq -> dynamic([_item, _printing, card, _location], card.cmc != ^number)
      :gt -> dynamic([_item, _printing, card, _location], card.cmc > ^number)
      :gte -> dynamic([_item, _printing, card, _location], card.cmc >= ^number)
      :lt -> dynamic([_item, _printing, card, _location], card.cmc < ^number)
      :lte -> dynamic([_item, _printing, card, _location], card.cmc <= ^number)
    end
  end

  defp permanent do
    Enum.reduce(
      ~w(artifact creature enchantment land planeswalker battle),
      dynamic(false),
      fn type, acc ->
        dynamic(
          [item, printing, card, location],
          ^acc or ^TextPredicates.field(:type, :colon, type)
        )
      end
    )
  end
end
