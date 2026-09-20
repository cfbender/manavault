defmodule Manavault.AI.DeckAnalysis.Payload do
  @moduledoc false

  alias Manavault.Catalog.{Deck, DeckCard, DeckSummaries, Util}

  def build(%Deck{} = deck, deck_cards) when is_list(deck_cards) do
    counted_cards = Enum.filter(deck_cards, &DeckCard.counts_toward_deck_total?/1)
    card_count = DeckCard.counted_quantity(counted_cards)
    land_count = counted_cards |> Enum.filter(&land?/1) |> DeckCard.counted_quantity()

    %{
      deck: %{
        name: deck.name,
        format: deck.format,
        primer: deck.primer,
        commander_color_identity:
          DeckSummaries.commander_color_identity_from_cards(counted_cards),
        cards: Enum.map(counted_cards, &card_payload(&1, deck.format))
      },
      facts: %{
        card_count: card_count,
        land_count: land_count,
        nonland_count: card_count - land_count,
        game_changer_count: Enum.count(counted_cards, &game_changer?/1),
        commanders:
          counted_cards
          |> Enum.filter(&(&1.zone == "commander"))
          |> Enum.map(& &1.card.name),
        saltiest_cards: saltiest_cards(counted_cards)
      }
    }
  end

  defp card_payload(%DeckCard{} = deck_card, format) do
    card = deck_card.card
    legalities = Util.decode_json(card.legalities, %{})

    %{
      name: card.name,
      type_line: card.type_line,
      oracle_text: card.oracle_text
    }
    |> put_unless_default(:quantity, deck_card.quantity, 1)
    |> put_unless_default(:zone, deck_card.zone, "mainboard")
    |> put_unless_default(:mana_value, card.cmc, nil)
    |> put_unless_default(:mana_cost, card.mana_cost, nil)
    |> put_unless_default(:color_identity, Util.decode_json(card.color_identity, []), [])
    |> put_unless_default(
      :format_legality,
      Map.get(legalities, format, "not_legal"),
      "legal"
    )
    |> put_unless_default(:game_changer, card.game_changer || false, false)
    |> put_unless_default(:deck_category, card.deck_category, nil)
    |> put_unless_default(:deck_themes, decode_json_list(card.deck_themes), [])
  end

  defp put_unless_default(payload, _key, value, default) when value == default, do: payload
  defp put_unless_default(payload, key, value, _default), do: Map.put(payload, key, value)

  defp game_changer?(%DeckCard{card: %{game_changer: true}}), do: true
  defp game_changer?(_deck_card), do: false

  defp saltiest_cards(deck_cards) do
    deck_cards
    |> Enum.filter(fn deck_card ->
      is_number(deck_card.card.edhrec_saltiness) and deck_card.card.edhrec_saltiness > 0
    end)
    |> Enum.sort_by(& &1.card.edhrec_saltiness, :desc)
    |> Enum.take(5)
    |> Enum.map(&%{name: &1.card.name, score: &1.card.edhrec_saltiness})
  end

  defp land?(%DeckCard{card: %{type_line: type_line}}) when is_binary(type_line),
    do: Regex.match?(~r/\bLand\b/i, type_line)

  defp land?(_deck_card), do: false

  defp decode_json_list(value) when is_binary(value) do
    case Jason.decode(value) do
      {:ok, values} when is_list(values) -> values
      _error -> []
    end
  end

  defp decode_json_list(_value), do: []
end
