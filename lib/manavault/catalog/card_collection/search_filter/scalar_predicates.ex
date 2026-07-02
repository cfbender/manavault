defmodule Manavault.Catalog.CardCollection.SearchFilter.ScalarPredicates do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.CardCollection.SearchFilter.{ColorPredicates, TextPredicates, Values}
  alias Manavault.Catalog.Search.ScalarPredicates, as: Shared

  import Manavault.Catalog.PriceFragments, only: [price_value_fragment: 2]

  # Card/printing predicates are identical to the catalog card search; they live
  # in Search.ScalarPredicates and resolve via the :card / :printing bindings.
  defdelegate mana_value(op, value), to: Shared
  defdelegate rarity(op, value), to: Shared
  defdelegate set(op, value), to: Shared
  defdelegate collector_number(op, value), to: Shared
  defdelegate date(op, value), to: Shared
  defdelegate year(op, value), to: Shared

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
