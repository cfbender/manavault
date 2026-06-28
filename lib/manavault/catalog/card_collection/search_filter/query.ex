defmodule Manavault.Catalog.CardCollection.SearchFilter.Query do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.CardCollection.SearchFilter.{
    ColorPredicates,
    ScalarPredicates,
    TextPredicates,
    Values
  }

  alias Manavault.Catalog.ScryfallQuery
  alias Manavault.Catalog.ScryfallQuery.{And, ExactName, Not, Or, Predicate}

  def apply(query, ""), do: query

  def apply(query, search) do
    case ScryfallQuery.parse(search) do
      {:ok, %And{terms: []}} ->
        query

      {:ok, expr} ->
        where(query, ^dynamic_for(expr))

      {:error, _reason} ->
        where(query, ^TextPredicates.plain_text(search))
    end
  end

  defp dynamic_for(%And{terms: terms}) do
    Enum.reduce(terms, dynamic(true), fn term, acc ->
      dynamic([item, printing, card, location], ^acc and ^dynamic_for(term))
    end)
  end

  defp dynamic_for(%Or{terms: terms}) do
    Enum.reduce(terms, dynamic(false), fn term, acc ->
      dynamic([item, printing, card, location], ^acc or ^dynamic_for(term))
    end)
  end

  defp dynamic_for(%Not{expr: expr}) do
    dynamic([item, printing, card, location], not (^dynamic_for(expr)))
  end

  defp dynamic_for(%ExactName{name: name}) do
    dynamic(
      [_item, _printing, card, _location],
      fragment("lower(?)", card.name) == ^Values.downcase(name)
    )
  end

  defp dynamic_for(%Predicate{field: :text, value: value, regex?: false}) do
    TextPredicates.plain_text(value)
  end

  defp dynamic_for(%Predicate{regex?: true}), do: dynamic(false)

  defp dynamic_for(%Predicate{field: :name, op: op, value: value}) do
    TextPredicates.field(:name, op, value)
  end

  defp dynamic_for(%Predicate{field: :type, op: op, value: value}) do
    TextPredicates.field(:type, op, value)
  end

  defp dynamic_for(%Predicate{field: :oracle, op: op, value: value}) do
    TextPredicates.field(:oracle, op, value)
  end

  defp dynamic_for(%Predicate{field: :mana, op: op, value: value}) do
    TextPredicates.field(:mana, op, value)
  end

  defp dynamic_for(%Predicate{field: :mana_value, op: op, value: value}) do
    ScalarPredicates.mana_value(op, value)
  end

  defp dynamic_for(%Predicate{field: :colors, op: op, value: value}) do
    ColorPredicates.build(:colors, op, value)
  end

  defp dynamic_for(%Predicate{field: :identity, op: op, value: value}) do
    ColorPredicates.build(:identity, op, value)
  end

  defp dynamic_for(%Predicate{field: :rarity, op: op, value: value}) do
    ScalarPredicates.rarity(op, value)
  end

  defp dynamic_for(%Predicate{field: :set, op: op, value: value}) do
    ScalarPredicates.set(op, value)
  end

  defp dynamic_for(%Predicate{field: :collector_number, op: op, value: value}) do
    ScalarPredicates.collector_number(op, value)
  end

  defp dynamic_for(%Predicate{field: :language, op: op, value: value}) do
    ScalarPredicates.language(op, value)
  end

  defp dynamic_for(%Predicate{field: :quantity, op: op, value: value}) do
    ScalarPredicates.quantity(op, value)
  end

  defp dynamic_for(%Predicate{field: :usd, op: op, value: value}) do
    ScalarPredicates.price(op, value)
  end

  defp dynamic_for(%Predicate{field: :is, op: op, value: value}) do
    ScalarPredicates.is_predicate(op, value)
  end

  defp dynamic_for(%Predicate{field: :date, op: op, value: value}) do
    ScalarPredicates.date(op, value)
  end

  defp dynamic_for(%Predicate{field: :year, op: op, value: value}) do
    ScalarPredicates.year(op, value)
  end

  defp dynamic_for(_unsupported), do: dynamic(false)
end
