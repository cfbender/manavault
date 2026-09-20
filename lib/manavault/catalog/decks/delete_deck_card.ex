defmodule Manavault.Catalog.Decks.DeleteDeckCard do
  @moduledoc false

  alias Manavault.Catalog.DeckCard
  alias Manavault.Catalog.Decks.{ClearDeckCardAllocations, EditGuard}
  alias Manavault.Repo

  def run(%DeckCard{} = deck_card) do
    with :ok <- EditGuard.ensure_deck_card_editable(deck_card) do
      for_deck_deletion(deck_card)
    end
  end

  @doc false
  def for_deck_deletion(%DeckCard{} = deck_card) do
    Repo.transact(fn ->
      ClearDeckCardAllocations.run!(deck_card)

      case Repo.delete(deck_card) do
        {:ok, deck_card} -> {:ok, deck_card}
        {:error, changeset} -> {:error, changeset}
      end
    end)
  end
end
