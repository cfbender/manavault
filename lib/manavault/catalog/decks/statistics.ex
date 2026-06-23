defmodule Manavault.Catalog.Decks.Statistics do
  @moduledoc false

  alias Manavault.Catalog.{Card, Deck, DeckCard, Util}
  alias Manavault.Catalog.Decks.Preloads
  alias Manavault.Repo

  def deck_stats(%Deck{} = deck) do
    deck = Repo.preload(deck, Preloads.deck_preloads(), force: true)

    cards = deck.deck_cards || []

    %{
      total:
        cards
        |> Enum.filter(&DeckCard.counts_toward_deck_total?/1)
        |> Enum.reduce(0, &(&1.quantity + &2)),
      zones: count_deck_groups(cards, & &1.zone),
      colors: deck_color_counts(cards),
      types: count_deck_groups(cards, &deck_card_type/1)
    }
  end

  defp count_deck_groups(cards, group_fun) do
    cards
    |> Enum.group_by(group_fun)
    |> Map.new(fn {group, group_cards} ->
      {group, Enum.reduce(group_cards, 0, &(&1.quantity + &2))}
    end)
  end

  defp deck_color_counts(cards) do
    empty = %{"W" => 0, "U" => 0, "B" => 0, "R" => 0, "G" => 0, "C" => 0}

    Enum.reduce(cards, empty, fn deck_card, counts ->
      colors = deck_card.card.color_identity |> Util.decode_json([]) |> List.wrap()

      if colors == [] do
        Map.update!(counts, "C", &(&1 + deck_card.quantity))
      else
        Enum.reduce(colors, counts, fn color, color_counts ->
          Map.update(color_counts, color, deck_card.quantity, &(&1 + deck_card.quantity))
        end)
      end
    end)
  end

  defp deck_card_type(%DeckCard{card: %Card{type_line: type_line}}) when is_binary(type_line) do
    cond do
      String.contains?(type_line, "Creature") -> "Creature"
      String.contains?(type_line, "Land") -> "Land"
      String.contains?(type_line, "Instant") -> "Instant"
      String.contains?(type_line, "Sorcery") -> "Sorcery"
      String.contains?(type_line, "Artifact") -> "Artifact"
      String.contains?(type_line, "Enchantment") -> "Enchantment"
      String.contains?(type_line, "Planeswalker") -> "Planeswalker"
      true -> "Other"
    end
  end

  defp deck_card_type(_deck_card), do: "Other"
end
