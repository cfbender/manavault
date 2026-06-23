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

  def purchase_text_for_collection_item(%CollectionItem{} = item) do
    item
    |> collection_item_purchase_price_cents()
    |> format_cents()
  end

  def text_for_deck_card(%DeckCard{} = deck_card) do
    deck_card
    |> deck_card_printing()
    |> case do
      %Printing{} = printing -> text_for_printing(printing, deck_card.finish)
      nil -> nil
    end
  end

  def collection_items_total_cents(items),
    do: collection_items_sum_cents(items, &collection_item_price_cents/1)

  def collection_items_purchase_total_cents(items),
    do: collection_items_sum_cents(items, &collection_item_purchase_price_cents/1)

  def collection_items_value_gain_cents(items) do
    collection_items_total_cents(items) - collection_items_purchase_total_cents(items)
  end

  def collection_items_value_gain_percent(items) do
    purchase_total = collection_items_purchase_total_cents(items)

    if purchase_total > 0 do
      collection_items_value_gain_cents(items) * 100 / purchase_total
    end
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

  def format_cents(cents) when is_integer(cents) and cents > 999_999 do
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

  def format_signed_cents(nil), do: nil

  def format_signed_cents(cents) when is_integer(cents) and cents > 0 do
    "+#{format_cents(cents)}"
  end

  def format_signed_cents(cents) when is_integer(cents) and cents < 0 do
    "-#{format_cents(abs(cents))}"
  end

  def format_signed_cents(0), do: "$0"

  def format_percent(nil), do: nil

  def format_percent(percent) when is_number(percent) do
    rounded = Float.round(percent, 1)
    sign = if rounded > 0, do: "+", else: ""
    value = if rounded == trunc(rounded), do: trunc(rounded), else: rounded

    "#{sign}#{value}%"
  end

  def collection_item_price_cents(%CollectionItem{
        printing: %Printing{} = printing,
        finish: finish
      }) do
    price_cents_for_printing(printing, finish)
  end

  def collection_item_price_cents(_item), do: nil

  def collection_item_purchase_price_cents(%CollectionItem{purchase_price_cents: cents})
      when is_integer(cents),
      do: cents

  def collection_item_purchase_price_cents(%CollectionItem{} = item),
    do: collection_item_price_cents(item)

  def collection_item_purchase_price_cents(_item), do: nil

  def collection_item_value_gain_cents(%CollectionItem{} = item) do
    with current when is_integer(current) <- collection_item_price_cents(item),
         purchase when is_integer(purchase) <- collection_item_purchase_price_cents(item) do
      current - purchase
    else
      _unknown -> nil
    end
  end

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
    |> parse_cents()
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

  def parse_cents(nil), do: nil

  def parse_cents(cents) when is_integer(cents) and cents >= 0, do: cents

  def parse_cents(price) when is_float(price) and price >= 0 do
    round(price * 100)
  end

  def parse_cents(price) when is_binary(price) do
    normalized =
      price
      |> String.trim()
      |> String.replace(",", "")
      |> String.trim_leading("$")

    case Regex.run(~r/^(\d+)(?:\.(\d{1,2}))?$/, normalized) do
      [_, dollars] ->
        String.to_integer(dollars) * 100

      [_, dollars, cents] ->
        String.to_integer(dollars) * 100 +
          (cents |> String.pad_trailing(2, "0") |> String.to_integer())

      _no_match ->
        nil
    end
  end

  def parse_cents(_price), do: nil

  defp collection_items_sum_cents(items, price_fun) do
    Enum.reduce(List.wrap(items), 0, fn
      %CollectionItem{quantity: quantity} = item, total when is_integer(quantity) ->
        total + quantity * (price_fun.(item) || 0)

      _item, total ->
        total
    end)
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
