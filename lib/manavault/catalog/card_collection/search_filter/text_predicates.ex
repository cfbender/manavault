defmodule Manavault.Catalog.CardCollection.SearchFilter.TextPredicates do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.CardCollection.SearchFilter.Values

  def plain_text(search) do
    pattern = search |> Values.downcase() |> Values.like_pattern()

    dynamic(
      [_item, printing, card, _location],
      fragment("lower(?) LIKE ? ESCAPE '\\'", card.name, ^pattern) or
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

  def field(_field, _op, _value), do: dynamic(false)
end
