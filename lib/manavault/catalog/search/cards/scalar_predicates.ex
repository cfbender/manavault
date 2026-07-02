defmodule Manavault.Catalog.Search.Cards.ScalarPredicates do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.Search.Cards.{ColorPredicates, TextPredicates, Values}
  alias Manavault.Catalog.Search.ScalarPredicates, as: Shared

  import Manavault.Catalog.PriceFragments, only: [price_fragment: 1]

  # Card/printing predicates shared with the collection search; they resolve via
  # the :card / :printing bindings.
  defdelegate mana_value(op, value), to: Shared
  defdelegate rarity(op, value), to: Shared
  defdelegate set(op, value), to: Shared
  defdelegate collector_number(op, value), to: Shared
  defdelegate date(op, value), to: Shared
  defdelegate year(op, value), to: Shared

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
end
