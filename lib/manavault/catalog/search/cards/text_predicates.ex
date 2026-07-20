defmodule Manavault.Catalog.Search.Cards.TextPredicates do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.Search.Cards.Values
  alias Manavault.Catalog.Search.NameMatch

  def plain_text(term) do
    pattern = NameMatch.like_pattern(term)

    dynamic(
      [card, _printing],
      fragment("lower(replace(replace(?, '''', ''), '’', '')) LIKE ? ESCAPE '\\'", card.name, ^pattern)
    )
  end

  def field(_field, _op, ""), do: dynamic(true)

  def field(field, op, value) when op in [:colon, :eq, :neq] do
    pattern = value |> Values.downcase() |> Values.like_pattern()

    condition =
      case field do
        :name ->
          name_pattern = NameMatch.like_pattern(value)

          dynamic(
            [card, _printing],
            fragment(
              "lower(replace(replace(?, '''', ''), '’', '')) LIKE ? ESCAPE '\\'",
              card.name,
              ^name_pattern
            )
          )

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

  def field(_field, _op, _value), do: dynamic(false)
end
