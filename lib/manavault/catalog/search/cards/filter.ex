defmodule Manavault.Catalog.Search.Cards.Filter do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.ScryfallQuery
  alias Manavault.Catalog.ScryfallQuery.{And, ExactName, Not, Or, Predicate}
  alias Manavault.Catalog.Search.Cards.{ColorPredicates, ScalarPredicates, TextPredicates, Values}

  def apply(query, term) do
    term = String.trim(term)

    case ScryfallQuery.parse(term) do
      {:ok, %And{terms: []}} ->
        query

      {:ok, expr} ->
        where(query, ^dynamic_for(expr))

      {:error, _reason} ->
        where(query, ^TextPredicates.plain_text(term))
    end
  end

  defp dynamic_for(%And{terms: terms}) do
    Enum.reduce(terms, dynamic(true), fn term, acc ->
      dynamic([card, printing], ^acc and ^dynamic_for(term))
    end)
  end

  defp dynamic_for(%Or{terms: terms}) do
    Enum.reduce(terms, dynamic(false), fn term, acc ->
      dynamic([card, printing], ^acc or ^dynamic_for(term))
    end)
  end

  defp dynamic_for(%Not{expr: expr}) do
    dynamic([card, printing], not (^dynamic_for(expr)))
  end

  defp dynamic_for(%ExactName{name: name}) do
    dynamic([card, _printing], fragment("lower(?)", card.name) == ^Values.downcase(name))
  end

  defp dynamic_for(%Predicate{field: :text, value: value, regex?: false}),
    do: TextPredicates.plain_text(value)

  defp dynamic_for(%Predicate{regex?: true}), do: dynamic(false)

  defp dynamic_for(%Predicate{field: :name, op: op, value: value}),
    do: TextPredicates.field(:name, op, value)

  defp dynamic_for(%Predicate{field: :type, op: op, value: value}),
    do: TextPredicates.field(:type, op, value)

  defp dynamic_for(%Predicate{field: :oracle, op: op, value: value}),
    do: TextPredicates.field(:oracle, op, value)

  defp dynamic_for(%Predicate{field: :mana, op: op, value: value}),
    do: TextPredicates.field(:mana, op, value)

  defp dynamic_for(%Predicate{field: :mana_value, op: op, value: value}),
    do: ScalarPredicates.mana_value(op, value)

  defp dynamic_for(%Predicate{field: :colors, op: op, value: value}),
    do: ColorPredicates.build(:colors, op, value)

  defp dynamic_for(%Predicate{field: :identity, op: op, value: value}),
    do: ColorPredicates.build(:identity, op, value)

  defp dynamic_for(%Predicate{field: :rarity, op: op, value: value}),
    do: ScalarPredicates.rarity(op, value)

  defp dynamic_for(%Predicate{field: :set, op: op, value: value}),
    do: ScalarPredicates.set(op, value)

  defp dynamic_for(%Predicate{field: :collector_number, op: op, value: value}),
    do: ScalarPredicates.collector_number(op, value)

  defp dynamic_for(%Predicate{field: :language, op: op, value: value}),
    do: ScalarPredicates.language(op, value)

  defp dynamic_for(%Predicate{field: :usd, op: op, value: value}),
    do: ScalarPredicates.price(op, value)

  defp dynamic_for(%Predicate{field: :date, op: op, value: value}),
    do: ScalarPredicates.date(op, value)

  defp dynamic_for(%Predicate{field: :year, op: op, value: value}),
    do: ScalarPredicates.year(op, value)

  defp dynamic_for(%Predicate{field: :is, op: op, value: value}),
    do: ScalarPredicates.is_predicate(op, value)

  defp dynamic_for(_unsupported), do: dynamic(false)
end
