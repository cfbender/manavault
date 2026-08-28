defmodule Manavault.Catalog.Recommander.Response do
  @moduledoc false

  alias Manavault.Catalog.{Card, Deck}
  alias Manavault.Catalog.Decks.Preloads
  # The batched card lookup and collection-status enrichment are provider
  # agnostic (oracle_id/name in, local card + availability out), so Recommander
  # reuses the EDHREC response helpers instead of duplicating them.
  alias Manavault.Catalog.EDHRec.Response.{CardLookup, CollectionStatus}
  alias Manavault.Repo

  def normalize(%Deck{} = deck, recommendations) when is_list(recommendations) do
    deck = Repo.preload(deck, Preloads.deck_preloads())

    entries =
      recommendations
      |> Enum.filter(&is_map/1)
      |> Enum.sort_by(&(-(CardLookup.entry_number(&1, "score") || 0)))

    card_lookup =
      CardLookup.local_card_lookup(
        Enum.map(entries, &CardLookup.entry_oracle_id/1),
        Enum.map(entries, &CardLookup.entry_name/1)
      )

    resolved =
      entries
      |> Enum.map(&resolve_entry(&1, deck, card_lookup))
      |> Enum.reject(&is_nil/1)

    prefetch = CollectionStatus.prefetch(prefetch_oracle_ids(resolved))

    %{
      commanders: commanders(deck),
      recommendations:
        resolved
        |> Enum.with_index(1)
        |> Enum.map(fn {entry, rank} -> build_entry(entry, rank, prefetch) end)
    }
  end

  defp commanders(%Deck{} = deck) do
    deck.deck_cards
    |> Enum.filter(&(&1.zone == "commander"))
    |> Enum.map(&%{name: &1.card.name, oracle_id: &1.oracle_id, url: commander_url(&1.oracle_id)})
    |> Enum.sort_by(& &1.name)
  end

  # Recommander's card pages accept oracle IDs directly and show the
  # commander's deck-context stats and synergies.
  defp commander_url(oracle_id) when is_binary(oracle_id) and oracle_id != "",
    do: "https://recommander.cards/card/#{oracle_id}"

  defp commander_url(_oracle_id), do: nil

  defp resolve_entry(%{} = entry, %Deck{} = deck, card_lookup) do
    name = CardLookup.entry_name(entry)

    if name == "" do
      nil
    else
      oracle_id = CardLookup.entry_oracle_id(entry)

      %{
        entry: entry,
        name: name,
        oracle_id: oracle_id,
        local_card: CardLookup.local_card(oracle_id, name, card_lookup),
        deck_card: CardLookup.matching_deck_card(deck, oracle_id, name)
      }
    end
  end

  defp prefetch_oracle_ids(resolved) do
    for %{local_card: %Card{oracle_id: oracle_id}, deck_card: nil} <- resolved,
        is_binary(oracle_id),
        do: oracle_id
  end

  defp build_entry(resolved, rank, prefetch) do
    %{
      entry: entry,
      name: name,
      oracle_id: oracle_id,
      local_card: local_card,
      deck_card: deck_card
    } = resolved

    %{
      name: name,
      oracle_id: oracle_id || CardLookup.local_card_oracle_id(local_card),
      rank: rank,
      score: CardLookup.entry_number(entry, "score"),
      card: local_card,
      collection_status: CollectionStatus.status(local_card, deck_card, prefetch)
    }
  end
end
