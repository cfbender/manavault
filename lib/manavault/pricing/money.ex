defmodule Manavault.Pricing.Money do
  @moduledoc false

  @doc """
  Converts a vendor price value (decimal dollar string, float, or integer
  dollars) into non-negative integer cents. Returns `nil` for missing,
  malformed, zero, or negative values.
  """
  def to_cents(nil), do: nil

  def to_cents(value) when is_integer(value) do
    positive_or_nil(value * 100)
  end

  def to_cents(value) when is_float(value) do
    positive_or_nil(round(value * 100))
  end

  def to_cents(value) when is_binary(value) do
    case Regex.run(~r/^\s*(\d+)(?:\.(\d{1,2}))?\s*$/, value) do
      [_, dollars] ->
        positive_or_nil(String.to_integer(dollars) * 100)

      [_, dollars, cents] ->
        positive_or_nil(
          String.to_integer(dollars) * 100 +
            (cents |> String.pad_trailing(2, "0") |> String.to_integer())
        )

      _no_match ->
        nil
    end
  end

  def to_cents(_value), do: nil

  defp positive_or_nil(cents) when is_integer(cents) and cents > 0, do: cents
  defp positive_or_nil(_cents), do: nil
end
