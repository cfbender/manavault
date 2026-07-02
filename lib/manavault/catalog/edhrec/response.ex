defmodule Manavault.Catalog.EDHRec.Response do
  @moduledoc false

  alias Manavault.Catalog.{Card, Deck}
  alias Manavault.Catalog.EDHRec.{Client, Payload}
  alias Manavault.Catalog.EDHRec.Response.{CardLookup, CollectionStatus, CommanderPage}
  alias Manavault.Repo

  def normalize_recs_response(
        %Deck{} = deck,
        response,
        fetch_commander_page \\ &Client.fetch_commander_page/1
      )
      when is_map(response) do
    # No force: the caller (Recommendations.recs/2) already force-preloads these
    # associations, so this is a no-op there and only loads when a caller invokes
    # normalize with an unloaded deck.
    deck = Repo.preload(deck, Payload.deck_preloads())
    commander_names = response |> Map.get("commanders", []) |> Enum.map(&CardLookup.entry_name/1)

    %{
      commander_names: commander_names,
      recommendations: normalize_entries(Map.get(response, "inRecs", []), deck),
      cuts: normalize_entries(Map.get(response, "outRecs", []), deck),
      commander_pages: CommanderPage.pages(commander_names, fetch_commander_page, deck),
      more: Map.get(response, "more", false) == true
    }
  end

  defp normalize_entries(entries, %Deck{} = deck) when is_list(entries) do
    resolved =
      entries
      |> Enum.map(&resolve_entry(&1, deck))
      |> Enum.reject(&is_nil/1)

    # One pair of collection queries for the whole section instead of a pair per
    # not-in-deck card. Only %Card{} entries with no matching deck card hit the
    # collection-candidates path in CollectionStatus.
    prefetch = CollectionStatus.prefetch(prefetch_oracle_ids(resolved))

    Enum.map(resolved, &build_entry(&1, prefetch))
  end

  defp normalize_entries(_entries, _deck), do: []

  defp resolve_entry(%{} = entry, %Deck{} = deck) do
    name = CardLookup.entry_name(entry)

    if name == "" do
      nil
    else
      oracle_id = CardLookup.entry_oracle_id(entry)

      %{
        entry: entry,
        name: name,
        oracle_id: oracle_id,
        local_card: CardLookup.local_card(oracle_id, name),
        deck_card: CardLookup.matching_deck_card(deck, oracle_id, name)
      }
    end
  end

  defp resolve_entry(_entry, _deck), do: nil

  defp prefetch_oracle_ids(resolved) do
    for %{local_card: %Card{oracle_id: oracle_id}, deck_card: nil} <- resolved,
        is_binary(oracle_id),
        do: oracle_id
  end

  defp build_entry(resolved, prefetch) do
    %{
      entry: entry,
      name: name,
      oracle_id: oracle_id,
      local_card: local_card,
      deck_card: deck_card
    } =
      resolved

    %{
      name: name,
      oracle_id: oracle_id || CardLookup.local_card_oracle_id(local_card),
      primary_type: CardLookup.entry_string(entry, "primary_type"),
      score: CardLookup.entry_number(entry, "score"),
      salt: CardLookup.entry_number(entry, "salt"),
      card: local_card,
      collection_status: CollectionStatus.status(local_card, deck_card, prefetch),
      edhrec_url: "https://edhrec.com/cards/#{CardLookup.card_slug(name)}"
    }
  end
end
