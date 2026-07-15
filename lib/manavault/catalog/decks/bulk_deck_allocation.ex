defmodule Manavault.Catalog.Decks.BulkDeckAllocation do
  @moduledoc false

  alias Manavault.Catalog.{Deck, DeckCard}

  alias Manavault.Catalog.Decks.{
    AllocationStatus,
    DeckCardAllocation,
    EditGuard,
    Preloads
  }

  alias Manavault.Repo

  def bulk_allocate_deck(%Deck{} = deck, mode)
      when mode in [:exact_printings, :matching_printings] do
    with :ok <- EditGuard.ensure_deck_editable(deck),
         {:ok, preview} <- preview_bulk_allocate_deck(deck, mode) do
      Repo.transact(fn ->
        result =
          Enum.reduce(preview.entries, %{allocated: 0, cards: MapSet.new(), skipped: 0}, fn entry,
                                                                                            counts ->
            case DeckCardAllocation.allocate_by_ids_in_transaction(
                   entry.deck_card.id,
                   entry.item.id,
                   entry.quantity
                 ) do
              {:ok, _allocation} ->
                counts
                |> update_in([:allocated], &(&1 + entry.quantity))
                |> update_in([:cards], &MapSet.put(&1, entry.deck_card.id))

              {:error, _reason} ->
                update_in(counts, [:skipped], &(&1 + 1))
            end
          end)

        {:ok,
         %{allocated: result.allocated, cards: MapSet.size(result.cards), skipped: result.skipped}}
      end)
    end
  end

  def bulk_allocate_deck(%Deck{} = deck, mode) when is_binary(mode) do
    case mode do
      "exact_printings" -> bulk_allocate_deck(deck, :exact_printings)
      "matching_printings" -> bulk_allocate_deck(deck, :matching_printings)
      _other -> {:error, :invalid_allocation_mode}
    end
  end

  def preview_bulk_allocate_deck(%Deck{} = deck, mode)
      when mode in [:exact_printings, :matching_printings] do
    deck = Repo.preload(deck, Preloads.deck_preloads(), force: true)
    deck_cards = AllocationStatus.put_deck_card_allocation_statuses(deck.deck_cards)

    preview =
      deck_cards
      |> Enum.reduce(%{allocated: 0, cards: MapSet.new(), skipped: 0, entries: []}, fn deck_card,
                                                                                       preview ->
        status = deck_card.allocation_status
        needed = max(status.required - status.allocated, 0)
        entries = deck_card_preview(deck_card, mode, status, needed)

        cond do
          needed == 0 ->
            preview

          entries == [] ->
            update_in(preview, [:skipped], &(&1 + 1))

          true ->
            allocated = Enum.reduce(entries, 0, &(&1.quantity + &2))

            preview
            |> update_in([:allocated], &(&1 + allocated))
            |> update_in([:cards], &MapSet.put(&1, deck_card.id))
            |> update_in([:entries], &(&1 ++ entries))
        end
      end)

    {:ok, %{preview | cards: MapSet.size(preview.cards)} |> Map.put(:mode, mode)}
  end

  def preview_bulk_allocate_deck(%Deck{} = deck, mode) when is_binary(mode) do
    case mode do
      "exact_printings" -> preview_bulk_allocate_deck(deck, :exact_printings)
      "matching_printings" -> preview_bulk_allocate_deck(deck, :matching_printings)
      _other -> {:error, :invalid_allocation_mode}
    end
  end

  defp deck_card_preview(%DeckCard{} = deck_card, mode, status, needed) do
    status.candidates
    |> Enum.filter(&allocation_candidate?(&1, deck_card, mode))
    |> Enum.reduce_while({0, []}, fn candidate, {allocated, entries} ->
      remaining = needed - allocated

      if remaining <= 0 do
        {:halt, {allocated, entries}}
      else
        quantity = min(remaining, candidate.available)

        entry = %{
          deck_card: deck_card,
          item: candidate.item,
          quantity: quantity,
          exact?: candidate.item.scryfall_id == deck_card.preferred_printing_id
        }

        {:cont, {allocated + quantity, entries ++ [entry]}}
      end
    end)
    |> elem(1)
  end

  defp allocation_candidate?(%{available: available}, _deck_card, _mode) when available <= 0,
    do: false

  defp allocation_candidate?(%{item: item}, %DeckCard{} = deck_card, :exact_printings) do
    is_binary(deck_card.preferred_printing_id) and
      item.scryfall_id == deck_card.preferred_printing_id
  end

  defp allocation_candidate?(_candidate, _deck_card, :matching_printings), do: true
end
