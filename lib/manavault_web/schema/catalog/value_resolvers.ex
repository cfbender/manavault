defmodule ManavaultWeb.Schema.Catalog.ValueResolvers do
  @moduledoc false

  def decode_json_field(parent, key, fallback) do
    parent |> Map.get(key) |> decode_json(fallback)
  end

  def map_value(parent, _args, %{definition: %{schema_node: %{identifier: key}}}) do
    {:ok, Map.get(parent, key) || Map.get(parent, to_string(key))}
  end

  def map_exact_value(parent, _args, _resolution) do
    {:ok, Map.get(parent, :exact?) || Map.get(parent, "exact?") || false}
  end

  def decode_json(value, fallback) when is_binary(value) do
    case Jason.decode(value) do
      {:ok, decoded} -> decoded
      _ -> fallback
    end
  end

  def decode_json(_value, fallback), do: fallback
end
