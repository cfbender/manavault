defmodule Manavault.Catalog.Search.ScalarPredicates do
  @moduledoc """
  Card/printing scalar filter predicates shared by the collection search
  (`CardCollection.SearchFilter`) and the catalog card search (`Search.Cards`).

  These return `Ecto.Query.dynamic/2` expressions keyed on the named bindings
  `:card` and `:printing`, so any query that declares `as: :card` / `as: :printing`
  on those joins can use them regardless of the binding positions. Item-specific
  predicates (finish-aware price, quantity, item language/finish) stay in the
  collection module.
  """

  import Ecto.Query

  defmacrop rarity_rank_fragment(field) do
    quote do
      fragment(
        "CASE lower(coalesce(?, '')) WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3 WHEN 'mythic' THEN 4 WHEN 'special' THEN 5 WHEN 'bonus' THEN 6 ELSE 0 END",
        unquote(field)
      )
    end
  end

  defmacrop year_fragment(printing) do
    quote do
      fragment("CAST(strftime('%Y', ?) AS INTEGER)", unquote(printing).released_at)
    end
  end

  def mana_value(op, value) do
    case downcase(value) do
      "even" ->
        dynamic([card: card], fragment("CAST(coalesce(?, 0) AS INTEGER) % 2 = 0", card.cmc))

      "odd" ->
        dynamic([card: card], fragment("CAST(coalesce(?, 0) AS INTEGER) % 2 = 1", card.cmc))

      value ->
        numeric_mana_value(op, value)
    end
  end

  def rarity(op, value) do
    with {:ok, rank} <- rarity_rank(value) do
      case comparison_op(op) do
        :eq -> dynamic([printing: p], rarity_rank_fragment(p.rarity) == ^rank)
        :neq -> dynamic([printing: p], rarity_rank_fragment(p.rarity) != ^rank)
        :gt -> dynamic([printing: p], rarity_rank_fragment(p.rarity) > ^rank)
        :gte -> dynamic([printing: p], rarity_rank_fragment(p.rarity) >= ^rank)
        :lt -> dynamic([printing: p], rarity_rank_fragment(p.rarity) < ^rank)
        :lte -> dynamic([printing: p], rarity_rank_fragment(p.rarity) <= ^rank)
      end
    else
      :error -> dynamic(false)
    end
  end

  def set(op, value) when op in [:colon, :eq, :neq] do
    value = downcase(value)
    pattern = like_pattern(value)

    condition =
      dynamic(
        [printing: p],
        fragment("lower(?)", p.set_code) == ^value or
          fragment("lower(coalesce(?, '')) LIKE ? ESCAPE '\\'", p.set_name, ^pattern)
      )

    if op == :neq, do: dynamic([printing: _p], not (^condition)), else: condition
  end

  def set(_op, _value), do: dynamic(false)

  def collector_number(op, value) when op in [:colon, :eq, :neq] do
    value = downcase(value)

    condition =
      dynamic([printing: p], fragment("lower(?)", p.collector_number) == ^value)

    if op == :neq, do: dynamic([printing: _p], not (^condition)), else: condition
  end

  def collector_number(op, value) do
    case Integer.parse(value) do
      {number, ""} ->
        case comparison_op(op) do
          :gt ->
            dynamic([printing: p], fragment("CAST(? AS INTEGER)", p.collector_number) > ^number)

          :gte ->
            dynamic([printing: p], fragment("CAST(? AS INTEGER)", p.collector_number) >= ^number)

          :lt ->
            dynamic([printing: p], fragment("CAST(? AS INTEGER)", p.collector_number) < ^number)

          :lte ->
            dynamic([printing: p], fragment("CAST(? AS INTEGER)", p.collector_number) <= ^number)

          _op ->
            dynamic(false)
        end

      _invalid ->
        dynamic(false)
    end
  end

  def date(op, value) do
    case Date.from_iso8601(value) do
      {:ok, date} ->
        case comparison_op(op) do
          :eq -> dynamic([printing: p], p.released_at == ^date)
          :neq -> dynamic([printing: p], p.released_at != ^date)
          :gt -> dynamic([printing: p], p.released_at > ^date)
          :gte -> dynamic([printing: p], p.released_at >= ^date)
          :lt -> dynamic([printing: p], p.released_at < ^date)
          :lte -> dynamic([printing: p], p.released_at <= ^date)
        end

      _invalid ->
        dynamic(false)
    end
  end

  def year(op, value) do
    case Integer.parse(value) do
      {year, ""} ->
        case comparison_op(op) do
          :eq -> dynamic([printing: p], year_fragment(p) == ^year)
          :neq -> dynamic([printing: p], year_fragment(p) != ^year)
          :gt -> dynamic([printing: p], year_fragment(p) > ^year)
          :gte -> dynamic([printing: p], year_fragment(p) >= ^year)
          :lt -> dynamic([printing: p], year_fragment(p) < ^year)
          :lte -> dynamic([printing: p], year_fragment(p) <= ^year)
        end

      _invalid ->
        dynamic(false)
    end
  end

  defp numeric_mana_value(op, value) do
    case Float.parse(value) do
      {number, ""} ->
        case comparison_op(op) do
          :eq -> dynamic([card: c], c.cmc == ^number)
          :neq -> dynamic([card: c], c.cmc != ^number)
          :gt -> dynamic([card: c], c.cmc > ^number)
          :gte -> dynamic([card: c], c.cmc >= ^number)
          :lt -> dynamic([card: c], c.cmc < ^number)
          :lte -> dynamic([card: c], c.cmc <= ^number)
        end

      _invalid ->
        dynamic(false)
    end
  end

  # Value helpers (kept private so this module has no cross-tree dependency).
  defp comparison_op(:colon), do: :eq
  defp comparison_op(op) when op in [:eq, :neq, :gt, :gte, :lt, :lte], do: op
  defp comparison_op(_op), do: :eq

  defp downcase(value), do: value |> to_string() |> String.trim() |> String.downcase()

  defp like_pattern(value) do
    value
    |> String.replace("\\", "\\\\")
    |> String.replace("%", "\\%")
    |> String.replace("_", "\\_")
    |> then(&"%#{&1}%")
  end

  defp rarity_rank(value) do
    case downcase(value) do
      rank when rank in ["c", "common"] -> {:ok, 1}
      rank when rank in ["u", "uncommon"] -> {:ok, 2}
      rank when rank in ["r", "rare"] -> {:ok, 3}
      rank when rank in ["m", "mythic"] -> {:ok, 4}
      rank when rank in ["s", "special"] -> {:ok, 5}
      rank when rank in ["b", "bonus"] -> {:ok, 6}
      _other -> :error
    end
  end
end
