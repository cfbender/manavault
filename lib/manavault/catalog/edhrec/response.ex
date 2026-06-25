defmodule Manavault.Catalog.EDHRec.Response do
  @moduledoc false

  alias Manavault.Catalog.Deck
  alias Manavault.Catalog.EDHRec.{Client, Payload}
  alias Manavault.Catalog.EDHRec.Response.{CardLookup, CollectionStatus, CommanderPage}
  alias Manavault.Repo

  def normalize_recs_response(
        %Deck{} = deck,
        response,
        fetch_commander_page \\ &Client.fetch_commander_page/1
      )
      when is_map(response) do
    deck = Repo.preload(deck, Payload.deck_preloads(), force: true)
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
    entries
    |> Enum.map(&normalize_entry(&1, deck))
    |> Enum.reject(&is_nil/1)
  end

  defp normalize_entries(_entries, _deck), do: []

  defp normalize_entry(%{} = entry, %Deck{} = deck) do
    name = CardLookup.entry_name(entry)

    if name == "" do
      nil
    else
      oracle_id = CardLookup.entry_oracle_id(entry)
      local_card = CardLookup.local_card(oracle_id, name)
      deck_card = CardLookup.matching_deck_card(deck, oracle_id, name)

      %{
        name: name,
        oracle_id: oracle_id || CardLookup.local_card_oracle_id(local_card),
        primary_type: CardLookup.entry_string(entry, "primary_type"),
        score: CardLookup.entry_number(entry, "score"),
        salt: CardLookup.entry_number(entry, "salt"),
        card: local_card,
        collection_status: CollectionStatus.status(local_card, deck_card),
        edhrec_url: "https://edhrec.com/cards/#{CardLookup.card_slug(name)}"
      }
    end
  end

  defp normalize_entry(_entry, _deck), do: nil
end
