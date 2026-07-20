defmodule Manavault.Catalog.Search.Cards.Values do
  @moduledoc false

  def comparison_op(:colon), do: :eq
  def comparison_op(op) when op in [:eq, :neq, :gt, :gte, :lt, :lte], do: op
  def comparison_op(_op), do: :eq

  def parse_color_set(value) do
    letters =
      value
      |> String.replace(~r/[^a-z]/, "")
      |> color_letters()
      |> Enum.uniq()

    if letters == [], do: :error, else: {:ok, letters}
  end

  def rarity_rank(value) do
    case downcase(value) do
      "c" -> {:ok, 1}
      "common" -> {:ok, 1}
      "u" -> {:ok, 2}
      "uncommon" -> {:ok, 2}
      "r" -> {:ok, 3}
      "rare" -> {:ok, 3}
      "m" -> {:ok, 4}
      "mythic" -> {:ok, 4}
      "s" -> {:ok, 5}
      "special" -> {:ok, 5}
      "b" -> {:ok, 6}
      "bonus" -> {:ok, 6}
      _other -> :error
    end
  end

  defdelegate like_pattern(value), to: Manavault.Catalog.Search.NameMatch, as: :substring_pattern

  def downcase(value), do: value |> to_string() |> String.trim() |> String.downcase()

  defp color_letters("white"), do: ["W"]
  defp color_letters("blue"), do: ["U"]
  defp color_letters("black"), do: ["B"]
  defp color_letters("red"), do: ["R"]
  defp color_letters("green"), do: ["G"]

  defp color_letters(value) do
    value
    |> String.graphemes()
    |> Enum.flat_map(fn
      "w" -> ["W"]
      "u" -> ["U"]
      "b" -> ["B"]
      "r" -> ["R"]
      "g" -> ["G"]
      _other -> []
    end)
  end
end
