defmodule Manavault.Catalog.Finishes do
  @moduledoc false

  alias Manavault.Catalog.{Printing, Util}

  def list(finishes) do
    finishes
    |> Util.decode_json([])
    |> List.wrap()
  end

  def first(finishes) do
    finishes
    |> list()
    |> Enum.find("nonfoil", &is_binary/1)
  end

  def preferred(%Printing{finishes: finishes}, current_finish) do
    available_finishes = list(finishes)

    cond do
      is_binary(current_finish) and current_finish in available_finishes -> current_finish
      true -> Enum.find(available_finishes, "nonfoil", &is_binary/1)
    end
  end

  def supports?(%Printing{finishes: finishes}, finish) when is_binary(finish) do
    finishes
    |> list()
    |> Enum.member?(finish)
  end

  def supports?(_printing, _finish), do: false
end
