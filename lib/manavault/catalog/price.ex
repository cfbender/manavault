defmodule Manavault.Catalog.Price do
  @moduledoc false

  alias Manavault.Catalog.{CollectionItem, DeckCard, Printing}

  def text_for_printing(%Printing{} = printing, finish \\ nil) do
    printing
    |> price_cents_for_printing(finish)
    |> format_cents()
  end

  def text_for_collection_item(%CollectionItem{printing: %Printing{} = printing, finish: finish}) do
    text_for_printing(printing, finish)
  end

  def text_for_collection_item(_item), do: nil

  def text_for_deck_card(%DeckCard{} = deck_card) do
    deck_card
    |> deck_card_printing()
    |> case do
      %Printing{} = printing -> text_for_printing(printing, deck_card.finish)
      nil -> nil
    end
  end

  def collection_items_total_cents(items) do
    Enum.reduce(List.wrap(items), 0, fn
      %CollectionItem{quantity: quantity} = item, total when is_integer(quantity) ->
        total + quantity * (collection_item_price_cents(item) || 0)

      _item, total ->
        total
    end)
  end

  def deck_cards_total_cents(cards) do
    Enum.reduce(List.wrap(cards), 0, fn
      %DeckCard{quantity: quantity} = deck_card, total when is_integer(quantity) ->
        total + quantity * (deck_card_price_cents(deck_card) || 0)

      _deck_card, total ->
        total
    end)
  end

  def format_cents(nil), do: nil

  def format_cents(cents) when is_integer(cents) and cents > 99_900 do
    dollars = cents / 100
    thousands = dollars / 1_000
    "$#{format_thousands(thousands)}k"
  end

  def format_cents(cents) when is_integer(cents) and cents >= 10_000 do
    "$#{div(cents, 100)}"
  end

  def format_cents(cents) when is_integer(cents) do
    dollars = div(cents, 100)
    remainder = rem(cents, 100)

    if remainder == 0 do
      "$#{dollars}"
    else
      "$#{dollars}.#{remainder |> Integer.to_string() |> String.pad_leading(2, "0")}"
    end
  end

  def collection_item_price_cents(%CollectionItem{
        printing: %Printing{} = printing,
        finish: finish
      }) do
    price_cents_for_printing(printing, finish)
  end

  def collection_item_price_cents(_item), do: nil

  def deck_card_price_cents(%DeckCard{} = deck_card) do
    deck_card
    |> deck_card_printing()
    |> case do
      %Printing{} = printing -> price_cents_for_printing(printing, deck_card.finish)
      nil -> nil
    end
  end

  def deck_card_price_cents(_deck_card), do: nil

  def price_cents_for_printing(printing, finish \\ nil)

  def price_cents_for_printing(%Printing{prices: prices}, finish) do
    prices
    |> decode_prices()
    |> price_string_for_finish(finish)
    |> parse_price_cents()
  end

  def price_cents_for_printing(_printing, _finish), do: nil

  defp price_string_for_finish(prices, "foil"), do: first_present(prices, ["usd_foil", "usd"])

  defp price_string_for_finish(prices, "etched"),
    do: first_present(prices, ["usd_etched", "usd_foil", "usd"])

  defp price_string_for_finish(prices, "nonfoil"),
    do: first_present(prices, ["usd", "usd_foil", "usd_etched"])

  defp price_string_for_finish(prices, _finish),
    do: first_present(prices, ["usd", "usd_foil", "usd_etched"])

  defp first_present(prices, keys) do
    Enum.find_value(keys, fn key ->
      case Map.get(prices, key) do
        value when is_binary(value) and value != "" -> value
        _other -> nil
      end
    end)
  end

  defp parse_price_cents(nil), do: nil

  defp parse_price_cents(price) when is_binary(price) do
    case Regex.run(~r/^\s*(\d+)(?:\.(\d{1,2}))?\s*$/, price) do
      [_, dollars] ->
        String.to_integer(dollars) * 100

      [_, dollars, cents] ->
        String.to_integer(dollars) * 100 +
          (cents |> String.pad_trailing(2, "0") |> String.to_integer())

      _no_match ->
        nil
    end
  end

  defp format_thousands(value) do
    rounded = Float.round(value, 1)

    if rounded == trunc(rounded) do
      rounded |> trunc() |> Integer.to_string()
    else
      :erlang.float_to_binary(rounded, decimals: 1)
    end
  end

  defp deck_card_printing(%DeckCard{preferred_printing: %Printing{} = printing}), do: printing

  defp deck_card_printing(%DeckCard{card: %{printings: [%Printing{} = printing | _]}}),
    do: printing

  defp deck_card_printing(_deck_card), do: nil

  defp decode_prices(value) when is_binary(value) do
    case Jason.decode(value) do
      {:ok, prices} when is_map(prices) -> prices
      _other -> %{}
    end
  end

  defp decode_prices(value) when is_map(value), do: value
  defp decode_prices(_value), do: %{}
end
