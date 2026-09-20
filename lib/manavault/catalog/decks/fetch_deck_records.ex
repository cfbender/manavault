defmodule Manavault.Catalog.Decks.FetchDeckRecords do
  @moduledoc false

  alias Manavault.Catalog.{DeckCard, DeckTag}
  alias Manavault.Repo

  @deck_card_preloads [:card, :preferred_printing]

  def deck_card(id) do
    case Repo.get(DeckCard, id) do
      %DeckCard{} = deck_card -> {:ok, Repo.preload(deck_card, @deck_card_preloads)}
      nil -> {:error, :not_found}
    end
  end

  def deck_tag(id) do
    case Repo.get(DeckTag, id) do
      %DeckTag{} = deck_tag -> {:ok, deck_tag}
      nil -> {:error, :not_found}
    end
  end

  def preload_deck_card(%DeckCard{} = deck_card),
    do: Repo.preload(deck_card, @deck_card_preloads)

  def preload_deck_cards(deck_cards) when is_list(deck_cards),
    do: Repo.preload(deck_cards, @deck_card_preloads)
end
