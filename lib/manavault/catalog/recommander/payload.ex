defmodule Manavault.Catalog.Recommander.Payload do
  @moduledoc false

  alias Manavault.Catalog.Deck
  alias Manavault.Catalog.Decks.Preloads
  alias Manavault.Repo

  # Recommander accepts oracle_id, scryfall_id, or name; ManaVault keys cards by
  # Scryfall oracle IDs, so oracle_id is exact and avoids any name-matching fuzz.
  def recommend_payload(%Deck{} = deck) do
    deck = Repo.preload(deck, Preloads.deck_preloads())

    commander_ids =
      deck.deck_cards
      |> Enum.filter(&(&1.zone == "commander"))
      |> Enum.sort_by(& &1.card.name)
      |> Enum.map(& &1.oracle_id)
      |> Enum.reject(&(&1 in [nil, ""]))
      |> Enum.uniq()

    case commander_ids do
      [] ->
        {:error, :recommander_missing_commander}

      [commander] ->
        {:ok, build_payload(deck, commander, nil)}

      [commander, partner] ->
        {:ok, build_payload(deck, commander, partner)}

      _too_many ->
        {:error, :recommander_too_many_commanders}
    end
  end

  defp build_payload(%Deck{} = deck, commander, partner) do
    %{
      "card_format" => "oracle_id",
      "commander" => commander,
      "partner" => partner,
      "deck" => deck_oracle_ids(deck)
    }
  end

  # Only decided cards shape the recommendations: the commander zone is sent
  # separately and "considering" cards are still open questions — leaving them
  # out lets Recommander recommend (and thereby second) them.
  defp deck_oracle_ids(%Deck{} = deck) do
    deck.deck_cards
    |> Enum.filter(&(&1.zone == "mainboard"))
    |> Enum.map(& &1.oracle_id)
    |> Enum.reject(&(&1 in [nil, ""]))
    |> Enum.uniq()
    |> Enum.sort()
  end
end
