defmodule Manavault.Catalog.DeckSummaries do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, DeckCard, Printing, Util}
  alias Manavault.Repo

  def put_fields([]), do: []

  def put_fields(decks) do
    deck_ids = Enum.map(decks, & &1.id)
    counts_by_deck_id = count_summaries(deck_ids)
    display_by_deck_id = display_summaries(deck_ids)

    Enum.map(decks, fn deck ->
      counts = Map.get(counts_by_deck_id, deck.id, %{card_count: 0, unique_card_count: 0})
      display = Map.get(display_by_deck_id, deck.id, empty_display_summary())

      %{
        deck
        | card_count: counts.card_count || 0,
          unique_card_count: counts.unique_card_count || 0,
          cover_image_url: display.cover_image_url,
          commander_color_identity: display.commander_color_identity
      }
    end)
  end

  def display(deck_id) do
    deck_id
    |> List.wrap()
    |> display_summaries()
    |> Map.get(deck_id, empty_display_summary())
  end

  def cover_image_url_from_cards(cards) when is_list(cards) do
    Enum.find_value(cards, fn deck_card ->
      cover_image_url(
        preferred_printing_image_uris(deck_card),
        fallback_printing_image_uris(deck_card)
      )
    end)
  end

  def commander_color_identity_from_cards(cards) when is_list(cards) do
    cards
    |> Enum.filter(&match?(%DeckCard{card: %Card{}}, &1))
    |> commander_color_identity_from_values(& &1.card.color_identity)
  end

  defp count_summaries(deck_ids) do
    DeckCard
    |> where(
      [deck_card],
      deck_card.deck_id in ^deck_ids and deck_card.zone in ^DeckCard.deck_count_zones()
    )
    |> group_by([deck_card], deck_card.deck_id)
    |> select([deck_card], %{
      deck_id: deck_card.deck_id,
      card_count: sum(deck_card.quantity),
      unique_card_count: count(deck_card.id)
    })
    |> Repo.all()
    |> Map.new(fn summary -> {summary.deck_id, summary} end)
  end

  defp display_summaries([]), do: %{}

  defp display_summaries(deck_ids) do
    DeckCard
    |> join(:inner, [deck_card], card in assoc(deck_card, :card))
    |> join(:left, [deck_card], preferred_printing in assoc(deck_card, :preferred_printing))
    |> where([deck_card], deck_card.deck_id in ^deck_ids)
    |> order_by([deck_card, card],
      asc: deck_card.deck_id,
      asc: deck_card.zone,
      asc: card.name,
      asc: deck_card.id
    )
    |> select([deck_card, card, preferred_printing], %{
      deck_id: deck_card.deck_id,
      zone: deck_card.zone,
      color_identity: card.color_identity,
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
    Enum.find_value(rows, fn row ->
      cover_image_url(row.preferred_image_uris, row.fallback_image_uris)
    end)
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
         card: %Card{printings: [%Printing{image_uris: image_uris} | _rest]}
       }),
       do: image_uris

  defp fallback_printing_image_uris(_deck_card), do: nil

  defp commander_color_identity_from_rows(rows) do
    rows
    |> Enum.filter(&(&1.zone == "commander"))
    |> commander_color_identity_from_values(& &1.color_identity)
  end

  defp commander_color_identity_from_values([], _color_identity_fun), do: nil

  defp commander_color_identity_from_values(values, color_identity_fun) do
    colors =
      values
      |> Enum.flat_map(fn value ->
        color_identity_fun.(value)
        |> Util.decode_json([])
      end)
      |> Enum.filter(&is_binary/1)
      |> Enum.map(&String.upcase/1)
      |> MapSet.new()

    if MapSet.size(colors) == 0 do
      ["C"]
    else
      colors
      |> MapSet.to_list()
      |> Enum.sort_by(&color_sort_value/1)
    end
  end

  defp color_sort_value(color) do
    Enum.find_index(~w(W U B R G M C), &(&1 == color)) || 99
  end

  defp present?(value), do: is_binary(value) and value != ""
end
