defmodule Manavault.Catalog.Decks.PullListAllocation do
  @moduledoc false

  alias Manavault.Catalog.{Deck, DeckCard, Util}
  alias Manavault.Catalog.Decks.{DeckCardAllocation, EditGuard}
  alias Manavault.Repo

  def allocate_deck_pull_list(deck_or_id, entries) when is_list(entries) do
    with {:ok, entries} <- normalize_pull_list_entries(entries) do
      Repo.transact(fn ->
        deck = load_deck!(deck_or_id)

        with :ok <- EditGuard.ensure_deck_editable(deck) do
          result =
            Enum.reduce(entries, %{allocated: 0, cards: MapSet.new(), skipped: 0}, fn entry,
                                                                                      counts ->
              case apply_entry(deck, entry) do
                {:ok, _allocation} ->
                  counts
                  |> update_in([:allocated], &(&1 + entry.quantity))
                  |> update_in([:cards], &MapSet.put(&1, entry.deck_card_id))

                {:error, _reason} ->
                  update_in(counts, [:skipped], &(&1 + 1))
              end
            end)

          {:ok,
           %{
             allocated: result.allocated,
             cards: MapSet.size(result.cards),
             skipped: result.skipped
           }}
        end
      end)
    end
  end

  defp apply_entry(%Deck{id: deck_id}, entry) do
    case Repo.get(DeckCard, entry.deck_card_id) do
      %DeckCard{deck_id: ^deck_id} ->
        DeckCardAllocation.allocate_by_ids_in_transaction(
          entry.deck_card_id,
          entry.collection_item_id,
          entry.quantity
        )

      _other_deck_or_missing ->
        {:error, :deck_card_not_found}
    end
  end

  defp load_deck!(%Deck{id: id}), do: Repo.get!(Deck, id)
  defp load_deck!(id), do: Repo.get!(Deck, id)

  defp normalize_pull_list_entries(entries) do
    result =
      Enum.reduce_while(entries, {:ok, []}, fn entry, {:ok, normalized} ->
        case normalize_pull_list_entry(entry) do
          {:ok, entry} -> {:cont, {:ok, [entry | normalized]}}
          :error -> {:halt, {:error, :invalid_pull_list_entry}}
        end
      end)

    with {:ok, entries} <- result do
      {:ok, Enum.reverse(entries)}
    end
  end

  defp normalize_pull_list_entry(
         %{deck_card_id: deck_card_id, collection_item_id: item_id} = entry
       ) do
    quantity = entry |> Map.get(:quantity, 1) |> Util.parse_quantity()

    with {:ok, deck_card_id} <- normalize_positive_id(deck_card_id),
         {:ok, item_id} <- normalize_positive_id(item_id),
         true <- quantity > 0 do
      {:ok, %{deck_card_id: deck_card_id, collection_item_id: item_id, quantity: quantity}}
    else
      _invalid -> :error
    end
  end

  defp normalize_pull_list_entry(_entry), do: :error

  defp normalize_positive_id(item_id) when is_integer(item_id) and item_id > 0, do: {:ok, item_id}

  defp normalize_positive_id(item_id) when is_binary(item_id) do
    case Integer.parse(item_id) do
      {item_id, ""} when item_id > 0 -> {:ok, item_id}
      _invalid -> :error
    end
  end

  defp normalize_positive_id(_item_id), do: :error
end
