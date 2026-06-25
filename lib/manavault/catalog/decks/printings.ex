defmodule Manavault.Catalog.Decks.Printings do
  @moduledoc false

  alias Manavault.Catalog.{DeckCard, Finishes, Price, Printing}

  def cheapest_printing(%DeckCard{} = deck_card) do
    deck_card
    |> compatible_printings()
    |> Enum.sort_by(&printing_sort_key(&1, deck_card.finish))
    |> List.first()
  end

  def cheapest_priced_printing(%DeckCard{} = deck_card) do
    deck_card
    |> compatible_printings()
    |> Enum.reject(&(Price.price_cents_for_printing(&1, deck_card.finish) == nil))
    |> Enum.sort_by(&printing_sort_key(&1, deck_card.finish))
    |> List.first()
  end

  defp compatible_printings(%DeckCard{card: %{printings: printings}, finish: finish})
       when is_list(printings) do
    Enum.filter(printings, &Finishes.supports?(&1, finish))
  end

  defp compatible_printings(_deck_card), do: []

  defp printing_sort_key(%Printing{} = printing, finish) do
    {Price.price_cents_for_printing(printing, finish) || 999_999_999,
     printing.released_at || ~D[9999-12-31], printing.set_code || "",
     printing.collector_number || ""}
  end
end
