defmodule Manavault.Catalog.Decks.EditGuard do
  @moduledoc false

  alias Manavault.Catalog.{Deck, DeckCard}
  alias Manavault.Repo

  def ensure_deck_editable(%Deck{status: "archived"}), do: {:error, :deck_archived}
  def ensure_deck_editable(%Deck{}), do: :ok

  def ensure_deck_card_editable(%DeckCard{deck: %Deck{} = deck}), do: ensure_deck_editable(deck)

  def ensure_deck_card_editable(%DeckCard{} = deck_card) do
    deck_card
    |> Repo.preload(:deck)
    |> Map.fetch!(:deck)
    |> ensure_deck_editable()
  end

  def ensure_deck_cards_editable(deck_cards) when is_list(deck_cards) do
    deck_cards
    |> Enum.reduce_while(:ok, fn deck_card, :ok ->
      case ensure_deck_card_editable(deck_card) do
        :ok -> {:cont, :ok}
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
  end
end
