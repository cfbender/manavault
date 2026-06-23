defmodule Manavault.Catalog.Collection.Export do
  @moduledoc false

  alias Manavault.Catalog.{CSV, CollectionItem, Price, Printing}

  def csv(items) when is_list(items) do
    rows =
      Enum.map(items, fn item ->
        [
          item.quantity,
          item.printing.card.name,
          item.printing.set_code,
          item.printing.collector_number,
          item.finish,
          item.condition,
          item.language,
          if(item.location_assoc, do: item.location_assoc.name, else: ""),
          item |> Price.collection_item_purchase_price_cents() |> Price.format_cents()
        ]
      end)

    [
      [
        "Quantity",
        "Card Name",
        "Set Code",
        "Collector Number",
        "Finish",
        "Condition",
        "Language",
        "Location",
        "Purchase Price"
      ]
      | rows
    ]
    |> Enum.map_join("\n", &CSV.row/1)
  end

  def text(items) when is_list(items) do
    Enum.map_join(items, "\n", &text_line/1)
  end

  defp text_line(%CollectionItem{} = item) do
    [
      "#{item.quantity}x",
      item.printing.card.name,
      printing_text(item.printing),
      finish_text(item.finish),
      condition_text(item.condition),
      language_text(item.language)
    ]
    |> Enum.reject(&(&1 in [nil, ""]))
    |> Enum.join(" ")
  end

  defp printing_text(%Printing{} = printing) do
    "(#{String.upcase(printing.set_code || "")}) #{printing.collector_number}"
  end

  defp finish_text("nonfoil"), do: nil
  defp finish_text(finish) when is_binary(finish), do: "[#{finish}]"
  defp finish_text(_finish), do: nil

  defp condition_text("near_mint"), do: nil
  defp condition_text(condition) when is_binary(condition), do: "{#{condition}}"
  defp condition_text(_condition), do: nil

  defp language_text("en"), do: nil
  defp language_text(language) when is_binary(language), do: "<#{language}>"
  defp language_text(_language), do: nil
end
