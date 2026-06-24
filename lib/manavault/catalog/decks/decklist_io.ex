defmodule Manavault.Catalog.Decks.DecklistIO do
  @moduledoc false

  alias Ecto.Changeset
  alias Manavault.Catalog.{Deck, Decklists}
  alias Manavault.Catalog.Decks.{Cards, Preloads}
  alias Manavault.Repo

  def import_decklist(%Deck{} = deck, text, opts \\ []) when is_binary(text) and is_list(opts) do
    entries = Decklists.parse(text)
    replace? = Keyword.get(opts, :replace?, false)

    Repo.transact(fn ->
      if replace?, do: delete_deck_cards_for_import!(deck)

      result =
        Enum.reduce(entries, %{imported: 0, unresolved: [], skipped_printings: []}, fn entry,
                                                                                       result ->
          case import_deck_card(deck, entry) do
            {:ok, _deck_card} ->
              update_in(result.imported, &(&1 + 1))

            {:ok, _deck_card, :skipped_preferred_printing} ->
              result
              |> update_in([:imported], &(&1 + 1))
              |> update_in([:skipped_printings], &[entry["name"] | &1])

            {:error, :card_not_found} ->
              update_in(result.unresolved, &[entry["name"] | &1])

            {:error, %Changeset{} = changeset} ->
              Repo.rollback(changeset)

            {:error, reason} ->
              Repo.rollback(reason)
          end
        end)
        |> update_in([:unresolved], &Enum.reverse/1)
        |> update_in([:skipped_printings], &Enum.reverse/1)

      {:ok, result}
    end)
  end

  defp delete_deck_cards_for_import!(%Deck{} = deck) do
    deck =
      deck
      |> Repo.preload([deck_cards: [deck_allocations: [:collection_item]]], force: true)

    Enum.each(deck.deck_cards, fn deck_card ->
      case Cards.delete_deck_card(deck_card) do
        {:ok, _deck_card} -> :ok
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  def export_decklist(%Deck{} = deck) do
    deck
    |> Repo.preload(Preloads.deck_preloads(), force: true)
    |> Map.fetch!(:deck_cards)
    |> Decklists.export()
  end

  defp import_deck_card(deck, entry) do
    case Cards.add_card_to_deck(deck, entry) do
      {:error, reason}
      when reason in [:preferred_printing_mismatch, :preferred_printing_not_found] ->
        entry = Map.put(entry, "preferred_printing_id", nil)

        case Cards.add_card_to_deck(deck, entry) do
          {:ok, deck_card} -> {:ok, deck_card, :skipped_preferred_printing}
          other -> other
        end

      other ->
        other
    end
  end
end
