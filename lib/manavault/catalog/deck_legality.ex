defmodule Manavault.Catalog.DeckLegality do
  @moduledoc false

  alias Manavault.Catalog.{Card, Deck, DeckCard}

  @commander_format "commander"
  @legal_status "legal"

  def evaluate(%Deck{} = deck) do
    counted_cards = counted_cards(deck)

    issues =
      card_legality_issues(deck, counted_cards) ++
        commander_issues(deck, counted_cards)

    %{
      status: status(issues),
      issues: issues
    }
  end

  defp counted_cards(%Deck{deck_cards: deck_cards}) when is_list(deck_cards) do
    Enum.filter(deck_cards, &DeckCard.counts_toward_deck_total?/1)
  end

  defp counted_cards(_deck), do: []

  defp card_legality_issues(%Deck{format: format}, deck_cards) do
    deck_cards
    |> Enum.uniq_by(&singleton_key/1)
    |> Enum.flat_map(fn deck_card ->
      card = deck_card.card
      legalities = card_legalities(card)
      legality_status = Map.get(legalities, format)

      if legality_status == @legal_status do
        []
      else
        display_status = legality_status || "missing"
        card_name = card_name(deck_card)

        [
          issue(
            "card_legality",
            "#{card_name} is not legal in #{format} (status: #{display_status}).",
            card_name
          )
        ]
      end
    end)
  end

  defp commander_issues(%Deck{format: @commander_format}, deck_cards) do
    deck_size_issues(deck_cards) ++
      commander_count_issues(deck_cards) ++
      singleton_issues(deck_cards) ++
      commander_color_identity_issues(deck_cards)
  end

  defp commander_issues(_deck, _deck_cards), do: []

  defp deck_size_issues(deck_cards) do
    count = Enum.reduce(deck_cards, 0, &(&1.quantity + &2))

    if count == 100 do
      []
    else
      [
        issue(
          "commander_deck_size",
          "Commander decks must contain exactly 100 counted cards; this deck has #{count}."
        )
      ]
    end
  end

  defp commander_count_issues(deck_cards) do
    count =
      deck_cards
      |> Enum.filter(&(&1.zone == "commander"))
      |> Enum.reduce(0, &(&1.quantity + &2))

    if count == 1 do
      []
    else
      [
        issue(
          "commander_count",
          "Commander decks must have exactly one card in the commander zone; this deck has #{count}."
        )
      ]
    end
  end

  defp singleton_issues(deck_cards) do
    deck_cards
    |> Enum.reject(&basic_land?/1)
    |> Enum.group_by(&singleton_key/1)
    |> Enum.flat_map(fn {_key, cards} ->
      count = Enum.reduce(cards, 0, &(&1.quantity + &2))

      if count > 1 do
        card_name = card_name(List.first(cards))

        [
          issue(
            "commander_singleton",
            "#{card_name} appears #{count} times; Commander allows only one copy of a non-basic land.",
            card_name
          )
        ]
      else
        []
      end
    end)
    |> Enum.sort_by(& &1.card_name)
  end

  defp commander_color_identity_issues(deck_cards) do
    commander_colors =
      deck_cards
      |> Enum.filter(&(&1.zone == "commander"))
      |> Enum.flat_map(&card_color_identity/1)
      |> MapSet.new()

    deck_cards
    |> Enum.reject(&(&1.zone == "commander"))
    |> Enum.flat_map(fn deck_card ->
      card_colors = deck_card |> card_color_identity() |> MapSet.new()

      if MapSet.subset?(card_colors, commander_colors) do
        []
      else
        card_name = card_name(deck_card)

        [
          issue(
            "commander_color_identity",
            "#{card_name} color identity #{colors_message(card_colors)} is outside commander color identity #{colors_message(commander_colors)}.",
            card_name
          )
        ]
      end
    end)
  end

  defp singleton_key(%DeckCard{oracle_id: oracle_id}) when is_binary(oracle_id),
    do: {:oracle_id, oracle_id}

  defp singleton_key(deck_card), do: {:name, String.downcase(card_name(deck_card))}

  defp basic_land?(%DeckCard{card: %Card{type_line: type_line}}) when is_binary(type_line) do
    String.contains?(type_line, "Basic") and String.contains?(type_line, "Land")
  end

  defp basic_land?(_deck_card), do: false

  defp card_legalities(%Card{legalities: legalities}), do: decode_map(legalities)
  defp card_legalities(_card), do: %{}

  defp card_color_identity(%DeckCard{card: %Card{color_identity: color_identity}}) do
    color_identity
    |> decode_list()
    |> Enum.filter(&is_binary/1)
  end

  defp card_color_identity(_deck_card), do: []

  defp decode_map(value) when is_map(value), do: value

  defp decode_map(value) when is_binary(value) do
    case Jason.decode(value) do
      {:ok, decoded} when is_map(decoded) -> decoded
      _decoded -> %{}
    end
  end

  defp decode_map(_value), do: %{}

  defp decode_list(value) when is_list(value), do: value

  defp decode_list(value) when is_binary(value) do
    case Jason.decode(value) do
      {:ok, decoded} when is_list(decoded) -> decoded
      _decoded -> []
    end
  end

  defp decode_list(_value), do: []

  defp issue(code, message, card_name \\ nil) do
    %{
      code: code,
      message: message,
      severity: "error",
      card_name: card_name
    }
  end

  defp status([]), do: "legal"
  defp status(_issues), do: "illegal"

  defp colors_message(colors) do
    colors
    |> Enum.sort()
    |> case do
      [] -> "none"
      sorted_colors -> Enum.join(sorted_colors, "")
    end
  end

  defp card_name(%DeckCard{card: %Card{name: name}}) when is_binary(name), do: name
  defp card_name(%DeckCard{oracle_id: oracle_id}) when is_binary(oracle_id), do: oracle_id
  defp card_name(_deck_card), do: "Unknown card"
end
