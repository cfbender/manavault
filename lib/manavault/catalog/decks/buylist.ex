defmodule Manavault.Catalog.Decks.Buylist do
  @moduledoc false

  alias Manavault.Catalog.{CSV, Card, Deck, DeckCard, Finishes, Price}
  alias Manavault.Catalog.Decks.{AllocationStatus, Preloads}
  alias Manavault.Repo

  def deck_buylist(%Deck{} = deck, opts \\ []) when is_list(opts) do
    deck = Repo.preload(deck, Preloads.deck_preloads(), force: true)
    printing_mode = Keyword.get(opts, :printing_mode, :none)
    include_basic_lands = Keyword.get(opts, :include_basic_lands, false)

    deck.deck_cards
    |> AllocationStatus.put_deck_card_allocation_statuses()
    |> Enum.map(fn deck_card ->
      status = deck_card.allocation_status
      needed = max(status.required - status.allocated - status.available, 0)
      unavailable = min(needed, status.allocated_elsewhere)
      missing = max(needed - unavailable, 0)

      if needed > 0 and (include_basic_lands or !is_basic_land?(deck_card)) do
        printing = buylist_printing(deck_card, printing_mode)
        unit_price_cents = Price.price_cents_for_printing(printing, deck_card.finish)

        %{
          deck_card: deck_card,
          card_name: deck_card.card.name,
          quantity: needed,
          missing: missing,
          unavailable: unavailable,
          reason: buylist_reason(missing, unavailable),
          finish: deck_card.finish,
          printing: printing,
          set_code: printing && printing.set_code,
          collector_number: printing && printing.collector_number,
          language: printing && printing.lang,
          unit_price_cents: unit_price_cents,
          total_price_cents: price_total_cents(unit_price_cents, needed)
        }
      end
    end)
    |> Enum.reject(&is_nil/1)
    |> Enum.sort_by(&{&1.card_name, &1.set_code || "", &1.collector_number || ""})
  end

  def export_deck_buylist(deck, format, opts \\ [])

  def export_deck_buylist(%Deck{} = deck, :text, opts) do
    deck
    |> deck_buylist(opts)
    |> Enum.map_join("\n", fn entry ->
      printing =
        if entry.set_code && entry.collector_number do
          " (#{String.upcase(entry.set_code)} #{entry.collector_number})"
        else
          ""
        end

      "#{entry.quantity} #{entry.card_name}#{printing}"
    end)
  end

  def export_deck_buylist(%Deck{} = deck, :csv, opts) do
    rows =
      deck
      |> deck_buylist(opts)
      |> Enum.map(fn entry ->
        [
          entry.quantity,
          entry.card_name,
          entry.set_code || "",
          entry.collector_number || "",
          entry.finish,
          entry.language || "",
          entry.reason,
          Price.format_cents(entry.unit_price_cents),
          Price.format_cents(entry.total_price_cents)
        ]
      end)

    [
      [
        "Quantity",
        "Card",
        "Set",
        "Collector Number",
        "Finish",
        "Language",
        "Reason",
        "Unit Price",
        "Total Price"
      ]
      | rows
    ]
    |> Enum.map_join("\n", &CSV.row/1)
  end

  def export_deck_buylist(%Deck{} = deck, format, opts) when is_binary(format) do
    case format do
      "text" -> export_deck_buylist(deck, :text, opts)
      "csv" -> export_deck_buylist(deck, :csv, opts)
      _other -> ""
    end
  end

  defp buylist_printing(%DeckCard{} = deck_card, :exact) do
    cond do
      Finishes.supports?(deck_card.preferred_printing, deck_card.finish) ->
        deck_card.preferred_printing

      true ->
        buylist_printing(deck_card, :cheapest)
    end
  end

  defp buylist_printing(%DeckCard{}, :none), do: nil
  defp buylist_printing(%DeckCard{}, "none"), do: nil

  defp buylist_printing(%DeckCard{} = deck_card, "exact"), do: buylist_printing(deck_card, :exact)

  defp buylist_printing(%DeckCard{} = deck_card, "cheapest"),
    do: buylist_printing(deck_card, :cheapest)

  defp buylist_printing(%DeckCard{} = deck_card, _mode) do
    deck_card.card.printings
    |> Enum.filter(&Finishes.supports?(&1, deck_card.finish))
    |> Enum.sort_by(fn printing ->
      {Price.price_cents_for_printing(printing, deck_card.finish) || 999_999_999,
       printing.released_at || ~D[9999-12-31], printing.set_code || "",
       printing.collector_number || ""}
    end)
    |> List.first()
  end

  defp buylist_reason(missing, unavailable) when missing > 0 and unavailable > 0,
    do: "missing and owned but unavailable"

  defp buylist_reason(missing, _unavailable) when missing > 0, do: "missing"
  defp buylist_reason(_missing, unavailable) when unavailable > 0, do: "owned but unavailable"
  defp buylist_reason(_missing, _unavailable), do: "available"

  defp price_total_cents(nil, _quantity), do: nil
  defp price_total_cents(price_cents, quantity), do: price_cents * quantity

  defp is_basic_land?(%DeckCard{card: %Card{type_line: type_line}}) when is_binary(type_line) do
    String.contains?(type_line, "Basic Land")
  end

  defp is_basic_land?(_deck_card), do: false
end
