defmodule Manavault.Catalog.ScryfallQuery.Serializer do
  @moduledoc false

  alias Manavault.Catalog.ScryfallQuery.{And, ExactName, Not, Or, Predicate}

  @canonical_fields %{
    text: nil,
    name: "name",
    type: "type",
    oracle: "oracle",
    keyword: "keyword",
    mana: "mana",
    mana_value: "mv",
    colors: "c",
    identity: "id",
    rarity: "rarity",
    set: "set",
    collector_number: "number",
    language: "lang",
    is: "is",
    usd: "usd",
    eur: "eur",
    tix: "tix",
    date: "date",
    year: "year",
    artist: "artist",
    flavor: "flavor",
    game: "game",
    format: "format",
    legal: "legal",
    banned: "banned",
    restricted: "restricted",
    unique: "unique",
    order: "order",
    direction: "direction"
  }

  @operator_strings %{
    neq: "!=",
    gte: ">=",
    lte: "<=",
    colon: ":",
    eq: "=",
    gt: ">",
    lt: "<"
  }

  def to_query(expr), do: serialize(expr, :root)

  defp serialize(%And{terms: []}, _context), do: ""

  defp serialize(%And{terms: terms}, context) do
    rendered = terms |> Enum.map(&serialize(&1, :and)) |> Enum.join(" ")

    if context == :not do
      "(" <> rendered <> ")"
    else
      rendered
    end
  end

  defp serialize(%Or{terms: terms}, context) do
    rendered = terms |> Enum.map(&serialize(&1, :or)) |> Enum.join(" or ")

    if context in [:and, :not] do
      "(" <> rendered <> ")"
    else
      rendered
    end
  end

  defp serialize(%Not{expr: expr}, _context), do: "-" <> serialize(expr, :not)
  defp serialize(%ExactName{name: name}, _context), do: "!" <> quote_value(name)
  defp serialize(%Predicate{field: :text, value: value}, _context), do: quote_value(value)

  defp serialize(%Predicate{field: field, op: op, value: value, regex?: regex?}, _context) do
    field_name = Map.get(@canonical_fields, field, Atom.to_string(field))
    operator = Map.fetch!(@operator_strings, op)
    rendered_value = if regex?, do: "/" <> escape_regex(value) <> "/", else: quote_value(value)
    field_name <> operator <> rendered_value
  end

  defp quote_value(value) do
    if String.match?(value, ~r/[\s()"]/), do: ~s("#{escape_quoted(value)}"), else: value
  end

  defp escape_quoted(value) do
    value
    |> String.replace("\\", "\\\\")
    |> String.replace("\"", "\\\"")
  end

  defp escape_regex(value) do
    value
    |> String.replace("\\", "\\\\")
    |> String.replace("/", "\\/")
  end
end
