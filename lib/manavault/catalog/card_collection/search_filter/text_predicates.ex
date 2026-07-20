defmodule Manavault.Catalog.CardCollection.SearchFilter.TextPredicates do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.CardCollection.SearchFilter.Values
  alias Manavault.Catalog.Search.NameMatch

  def plain_text(search) do
    pattern = search |> Values.downcase() |> Values.like_pattern()
    name_pattern = NameMatch.like_pattern(search)

    dynamic(
      [_item, printing, card, _location],
      fragment(
        "lower(replace(replace(?, '''', ''), '’', '')) LIKE ? ESCAPE '\\'",
        card.name,
        ^name_pattern
      ) or
        fragment("lower(?) LIKE ? ESCAPE '\\'", printing.set_code, ^pattern) or
        fragment("lower(?) LIKE ? ESCAPE '\\'", printing.set_name, ^pattern) or
        fragment("lower(?) LIKE ? ESCAPE '\\'", printing.collector_number, ^pattern) or
        fragment("lower(?) LIKE ? ESCAPE '\\'", printing.scryfall_id, ^pattern)
    )
  end

  def field(_field, _op, ""), do: dynamic(true)

  def field(field, op, value) when op in [:colon, :eq, :neq] do
    value = Values.downcase(value)
    pattern = Values.like_pattern(value)

    condition =
      case field do
        :name ->
          name_pattern = NameMatch.like_pattern(value)

          dynamic(
            [_item, _printing, card, _location],
            fragment(
              "lower(replace(replace(?, '''', ''), '’', '')) LIKE ? ESCAPE '\\'",
              card.name,
              ^name_pattern
            )
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

  def field(_field, _op, _value), do: dynamic(false)
end
