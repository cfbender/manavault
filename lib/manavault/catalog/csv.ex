defmodule Manavault.Catalog.CSV do
  @moduledoc false

  def row(values) do
    values
    |> Enum.map(&cell/1)
    |> Enum.join(",")
  end

  defp cell(nil), do: ""

  defp cell(value) do
    value = to_string(value)

    if String.contains?(value, [",", "\"", "\n"]) do
      ~s("#{String.replace(value, "\"", "\"\"")}")
    else
      value
    end
  end
end
