defmodule Manavault.Catalog.Util do
  @moduledoc false

  def normalize_filter(value) when is_binary(value), do: String.trim(value)
  def normalize_filter(_value), do: ""

  def parse_quantity(quantity) when is_integer(quantity), do: quantity

  def parse_quantity(quantity) when is_binary(quantity) do
    case Integer.parse(quantity) do
      {parsed, ""} -> parsed
      _invalid -> 1
    end
  end

  def parse_quantity(_quantity), do: 1

  def encode_json(value), do: Jason.encode!(value)

  def decode_json(value, fallback) when is_binary(value) do
    case Jason.decode(value) do
      {:ok, decoded} -> decoded
      {:error, _reason} -> fallback
    end
  end

  def decode_json(_value, fallback), do: fallback
end
