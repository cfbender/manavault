defmodule Manavault.Catalog.DeckSummaries do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, Deck, DeckCard, Printing, Util}
  alias Manavault.Repo

  def put_fields([]), do: []

  def put_fields(decks) do
    Enum.map(decks, fn deck ->
      cards = deck.deck_cards || []

      %{
        deck
        | card_count: DeckCard.counted_quantity(cards),
          unique_card_count: Enum.count(cards, &DeckCard.counts_toward_deck_total?/1),
          cover_image_url: cover_image_url_from_cards(cards, deck.cover_deck_card_id),
          commander_color_identity: commander_color_identity_from_cards(cards)
      }
    end)
  end

  def display(deck_id) do
    deck_id
    |> List.wrap()
    |> display_summaries()
    |> Map.get(deck_id, empty_display_summary())
  end

  def cover_image_url_from_cards(cards, cover_deck_card_id \\ nil) when is_list(cards) do
    selected_cover =
      cards
      |> Enum.find(&(&1.id == cover_deck_card_id))
      |> deck_card_cover_image_url()

    selected_cover || Enum.find_value(cards, &deck_card_cover_image_url/1)
  end

  def commander_color_identity_from_cards(cards) when is_list(cards) do
    cards
    |> Enum.filter(&match?(%DeckCard{card: %Card{}}, &1))
    |> Enum.map(
      &%{zone: &1.zone, color_identity: &1.card.color_identity, oracle_text: &1.card.oracle_text}
    )
    |> commander_color_identity_from_rows()
  end

  defp display_summaries([]), do: %{}

  defp display_summaries(deck_ids) do
    DeckCard
    |> join(:inner, [deck_card], deck in Deck, on: deck.id == deck_card.deck_id)
    |> join(:inner, [deck_card], card in assoc(deck_card, :card))
    |> join(:left, [deck_card], preferred_printing in assoc(deck_card, :preferred_printing))
    |> where([deck_card], deck_card.deck_id in ^deck_ids)
    |> order_by([deck_card, card],
      asc: deck_card.deck_id,
      asc: deck_card.zone,
      asc: card.name,
      asc: deck_card.id
    )
    |> select([deck_card, deck, card, preferred_printing], %{
      id: deck_card.id,
      deck_id: deck_card.deck_id,
      cover_deck_card_id: deck.cover_deck_card_id,
      zone: deck_card.zone,
      color_identity: card.color_identity,
      oracle_text: card.oracle_text,
      preferred_image_uris: preferred_printing.image_uris,
      fallback_image_uris:
        fragment(
          """
          (
            SELECT printing.image_uris
            FROM scryfall_printings AS printing
            WHERE printing.oracle_id = ?
            ORDER BY printing.released_at DESC, printing.set_code ASC
            LIMIT 1
          )
          """,
          deck_card.oracle_id
        )
    })
    |> Repo.all()
    |> Enum.group_by(& &1.deck_id)
    |> Map.new(fn {deck_id, rows} ->
      {deck_id,
       %{
         cover_image_url: cover_image_url_from_rows(rows),
         commander_color_identity: commander_color_identity_from_rows(rows)
       }}
    end)
  end

  def put_fallback_printings([]), do: []

  def put_fallback_printings(deck_cards) when is_list(deck_cards) do
    oracle_ids = deck_cards |> Enum.map(& &1.oracle_id) |> Enum.uniq()
    fallbacks = fallback_printings_by_oracle_id(oracle_ids)

    Enum.map(deck_cards, fn deck_card ->
      %{deck_card | fallback_printing: Map.get(fallbacks, deck_card.oracle_id)}
    end)
  end

  defp fallback_printings_by_oracle_id([]), do: %{}

  defp fallback_printings_by_oracle_id(oracle_ids) do
    ranked =
      from(p in Printing,
        where: p.oracle_id in ^oracle_ids,
        select_merge: %{
          rn:
            row_number()
            |> over(partition_by: p.oracle_id, order_by: [desc: p.released_at, asc: p.set_code])
        }
      )

    from(p in subquery(ranked), where: p.rn == 1, select: p)
    |> Repo.all()
    |> Map.new(&{&1.oracle_id, &1})
  end

  defp empty_display_summary do
    %{cover_image_url: nil, commander_color_identity: nil}
  end

  defp cover_image_url_from_rows(rows) do
    selected_cover =
      rows
      |> Enum.find(fn row -> row.id == row.cover_deck_card_id end)
      |> row_cover_image_url()

    selected_cover || Enum.find_value(rows, &row_cover_image_url/1)
  end

  defp deck_card_cover_image_url(nil), do: nil

  defp deck_card_cover_image_url(deck_card) do
    cover_image_url(
      preferred_printing_image_uris(deck_card),
      fallback_printing_image_uris(deck_card)
    )
  end

  defp row_cover_image_url(nil), do: nil

  defp row_cover_image_url(row) do
    cover_image_url(row.preferred_image_uris, row.fallback_image_uris)
  end

  defp cover_image_url(preferred_image_uris, fallback_image_uris) do
    preferred = image_urls(preferred_image_uris)
    fallback = image_urls(fallback_image_uris)

    Enum.find(
      [
        preferred.art_crop_url,
        preferred.image_url,
        fallback.art_crop_url,
        fallback.image_url
      ],
      &present?/1
    )
  end

  defp image_urls(image_uris) do
    decoded = Util.decode_json(image_uris, %{})

    %{
      image_url: image_url(decoded),
      art_crop_url: art_crop_url(decoded)
    }
  end

  defp image_url(%{} = image_uris) do
    image_uris["normal"] || image_uris["large"] || image_uris["small"] || image_uris["png"]
  end

  defp image_url([first | _rest]), do: image_url(first)
  defp image_url(_image_uris), do: nil

  defp art_crop_url(%{} = image_uris), do: image_uris["art_crop"] || image_url(image_uris)
  defp art_crop_url([first | _rest]), do: art_crop_url(first)
  defp art_crop_url(_image_uris), do: nil

  defp preferred_printing_image_uris(%DeckCard{
         preferred_printing: %Printing{image_uris: image_uris}
       }),
       do: image_uris

  defp preferred_printing_image_uris(_deck_card), do: nil

  defp fallback_printing_image_uris(%DeckCard{
         fallback_printing: %Printing{image_uris: image_uris}
       }),
       do: image_uris

  defp fallback_printing_image_uris(_deck_card), do: nil

  defp commander_color_identity_from_rows(rows) do
    {commanders, other_rows} = Enum.split_with(rows, &(&1.zone == "commander"))

    case commanders do
      [] ->
        nil

      commanders ->
        printed_colors = row_colors(commanders)

        colors =
          MapSet.union(printed_colors, chosen_colors(commanders, other_rows, printed_colors))

        if MapSet.size(colors) == 0 do
          ["C"]
        else
          colors
          |> MapSet.to_list()
          |> Enum.sort_by(&color_sort_value/1)
        end
    end
  end

  # Commanders that "choose a color before the game begins" (e.g. Clara
  # Oswald) each add one chosen color to the deck's identity; infer the chosen
  # colors from the counted cards outside the commanders' printed identities.
  defp chosen_colors(commanders, other_rows, printed_colors) do
    chosen_color_slots = Enum.count(commanders, &Card.chooses_color_before_game?(&1.oracle_text))

    extra_colors =
      other_rows
      |> Enum.filter(&DeckCard.deck_count_zone?(&1.zone))
      |> row_colors()
      |> MapSet.difference(printed_colors)

    if chosen_color_slots > 0 and MapSet.size(extra_colors) <= chosen_color_slots do
      extra_colors
    else
      MapSet.new()
    end
  end

  defp row_colors(rows) do
    rows
    |> Enum.flat_map(&Util.decode_json(&1.color_identity, []))
    |> Enum.filter(&is_binary/1)
    |> Enum.map(&String.upcase/1)
    |> MapSet.new()
  end

  defp color_sort_value(color) do
    Enum.find_index(~w(W U B R G M C), &(&1 == color)) || 99
  end

  defp present?(value), do: is_binary(value) and value != ""
end
