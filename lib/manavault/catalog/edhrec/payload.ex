defmodule Manavault.Catalog.EDHRec.Payload do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Deck, DeckCard, Printing}
  alias Manavault.Repo

  def recs_payload(%Deck{} = deck, opts \\ []) when is_list(opts) do
    deck = Repo.preload(deck, deck_preloads(), force: true)

    %{
      "cards" =>
        deck.deck_cards
        |> Enum.reject(&(&1.zone == "maybeboard"))
        |> Enum.sort_by(&{zone_order(&1.zone), &1.card.name, &1.id})
        |> Enum.map(&deck_card_line/1),
      "commanders" =>
        deck.deck_cards
        |> Enum.filter(&(&1.zone == "commander"))
        |> Enum.sort_by(& &1.card.name)
        |> Enum.map(& &1.card.name),
      "name" => "",
      "options" => %{
        "excludeLands" => Keyword.get(opts, :exclude_lands, false),
        "offset" => Keyword.get(opts, :offset, 0)
      }
    }
  end

  def validate_payload(%{"commanders" => [_ | _], "cards" => [_ | _]}), do: :ok
  def validate_payload(%{"commanders" => []}), do: {:error, :edhrec_missing_commander}
  def validate_payload(%{"cards" => []}), do: {:error, :edhrec_empty_deck}
  def validate_payload(_payload), do: {:error, :edhrec_invalid_deck}

  defp deck_card_line(%DeckCard{} = deck_card) do
    [
      "#{deck_card.quantity}x",
      deck_card.card.name,
      printing_label(deck_card.preferred_printing),
      finish_label(deck_card.finish)
    ]
    |> Enum.reject(&(&1 in [nil, ""]))
    |> Enum.join(" ")
  end

  defp printing_label(%Printing{} = printing) do
    "(#{String.upcase(printing.set_code || "")}) #{printing.collector_number}"
  end

  defp printing_label(_printing), do: nil

  defp finish_label("foil"), do: "*F*"
  defp finish_label("etched"), do: "*E*"
  defp finish_label(_finish), do: nil

  defp zone_order("commander"), do: 0
  defp zone_order("mainboard"), do: 1
  defp zone_order("sideboard"), do: 2
  defp zone_order(_zone), do: 3

  def deck_preloads do
    [
      deck_cards:
        {from(deck_card in DeckCard,
           join: card in assoc(deck_card, :card),
           left_join: preferred_printing in assoc(deck_card, :preferred_printing),
           order_by: [
             asc: deck_card.zone,
             asc: card.name,
             asc: deck_card.id
           ],
           preload: [
             card:
               {card,
                printings:
                  ^from(printing in Printing,
                    order_by: [desc: printing.released_at, asc: printing.set_code]
                  )},
             preferred_printing: preferred_printing
           ]
         ), []}
    ]
  end
end
