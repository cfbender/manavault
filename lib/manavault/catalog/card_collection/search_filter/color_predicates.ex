defmodule Manavault.Catalog.CardCollection.SearchFilter.ColorPredicates do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.CardCollection.SearchFilter.Values

  defmacrop json_array_count(field) do
    quote do
      fragment("(SELECT count(1) FROM json_each(COALESCE(?, '[]')))", unquote(field))
    end
  end

  def build(json_field, op, value) do
    value = Values.downcase(value)

    cond do
      value in ["m", "multicolor"] ->
        count(json_field, op, 2, :gte)

      value in ["c", "colorless"] ->
        count(json_field, op, 0, :eq)

      Values.numeric_string?(value) ->
        {color_count, ""} = Integer.parse(value)
        count(json_field, op, color_count, :eq)

      true ->
        case Values.parse_color_set(value) do
          {:ok, colors} -> compare_set(json_field, op, colors)
          :error -> dynamic(false)
        end
    end
  end

  def count(field, op, color_count, default_op) do
    op = if op == :colon, do: default_op, else: Values.comparison_op(op)

    case {field, op} do
      {:colors, :eq} ->
        dynamic(
          [_item, _printing, card, _location],
          json_array_count(card.colors) == ^color_count
        )

      {:colors, :neq} ->
        dynamic(
          [_item, _printing, card, _location],
          json_array_count(card.colors) != ^color_count
        )

      {:colors, :gt} ->
        dynamic([_item, _printing, card, _location], json_array_count(card.colors) > ^color_count)

      {:colors, :gte} ->
        dynamic(
          [_item, _printing, card, _location],
          json_array_count(card.colors) >= ^color_count
        )

      {:colors, :lt} ->
        dynamic([_item, _printing, card, _location], json_array_count(card.colors) < ^color_count)

      {:colors, :lte} ->
        dynamic(
          [_item, _printing, card, _location],
          json_array_count(card.colors) <= ^color_count
        )

      {:identity, :eq} ->
        dynamic(
          [_item, _printing, card, _location],
          json_array_count(card.color_identity) == ^color_count
        )

      {:identity, :neq} ->
        dynamic(
          [_item, _printing, card, _location],
          json_array_count(card.color_identity) != ^color_count
        )

      {:identity, :gt} ->
        dynamic(
          [_item, _printing, card, _location],
          json_array_count(card.color_identity) > ^color_count
        )

      {:identity, :gte} ->
        dynamic(
          [_item, _printing, card, _location],
          json_array_count(card.color_identity) >= ^color_count
        )

      {:identity, :lt} ->
        dynamic(
          [_item, _printing, card, _location],
          json_array_count(card.color_identity) < ^color_count
        )

      {:identity, :lte} ->
        dynamic(
          [_item, _printing, card, _location],
          json_array_count(card.color_identity) <= ^color_count
        )
    end
  end

  defp compare_set(field, op, colors) do
    op = Values.color_op(op)
    contains = contains_colors(field, colors)
    excludes = excludes_other_colors(field, colors)
    color_count = length(colors)

    case op do
      :eq ->
        dynamic([item, printing, card, location], ^contains and ^excludes)

      :neq ->
        dynamic([item, printing, card, location], not (^contains and ^excludes))

      :gte ->
        contains

      :lte ->
        excludes

      :gt ->
        dynamic(
          [item, printing, card, location],
          ^contains and ^count(field, :gt, color_count, :gt)
        )

      :lt ->
        dynamic(
          [item, printing, card, location],
          ^excludes and ^count(field, :lt, color_count, :lt)
        )
    end
  end

  defp contains_colors(field, colors) do
    Enum.reduce(colors, dynamic(true), fn color, acc ->
      color_presence(field, color, acc, true)
    end)
  end

  defp excludes_other_colors(field, colors) do
    ~w(W U B R G)
    |> Enum.reject(&(&1 in colors))
    |> Enum.reduce(dynamic(true), fn color, acc ->
      color_presence(field, color, acc, false)
    end)
  end

  defp color_presence(:colors, color, acc, true) do
    dynamic(
      [_item, _printing, card, _location],
      ^acc and fragment("instr(coalesce(?, '[]'), ?) > 0", card.colors, ^~s("#{color}"))
    )
  end

  defp color_presence(:colors, color, acc, false) do
    dynamic(
      [_item, _printing, card, _location],
      ^acc and fragment("instr(coalesce(?, '[]'), ?) = 0", card.colors, ^~s("#{color}"))
    )
  end

  defp color_presence(:identity, color, acc, true) do
    dynamic(
      [_item, _printing, card, _location],
      ^acc and fragment("instr(coalesce(?, '[]'), ?) > 0", card.color_identity, ^~s("#{color}"))
    )
  end

  defp color_presence(:identity, color, acc, false) do
    dynamic(
      [_item, _printing, card, _location],
      ^acc and fragment("instr(coalesce(?, '[]'), ?) = 0", card.color_identity, ^~s("#{color}"))
    )
  end
end
