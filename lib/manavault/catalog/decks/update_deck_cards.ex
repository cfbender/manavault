defmodule Manavault.Catalog.Decks.UpdateDeckCards do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{DeckCard, Printing}

  alias Manavault.Catalog.Decks.{
    ClearDeckCardAllocations,
    DeleteDeckCard,
    EditGuard,
    Printings,
    UpdateDeckCard
  }

  alias Manavault.Repo

  def tags(deck_card_ids, tag) when is_list(deck_card_ids) do
    bulk(deck_card_ids, %{"tag" => normalize_tag(tag)})
  end

  def bulk(deck_card_ids, attrs) when is_list(deck_card_ids) and is_map(attrs) do
    update_each(deck_card_ids, &UpdateDeckCard.run(&1, attrs))
  end

  def delete(deck_card_ids) when is_list(deck_card_ids) do
    update_each(deck_card_ids, &DeleteDeckCard.run/1)
  end

  def optimize(deck_card_ids) when is_list(deck_card_ids) do
    deck_card_ids = Enum.uniq(deck_card_ids)

    Repo.transact(fn ->
      with {:ok, deck_cards} <- load_for_optimization(deck_card_ids),
           :ok <- EditGuard.ensure_deck_cards_editable(Map.values(deck_cards)) do
        optimized =
          Enum.reduce(deck_card_ids, [], fn deck_card_id, acc ->
            deck_card = Map.fetch!(deck_cards, deck_card_id)

            case Printings.cheapest_priced_printing(deck_card) do
              %Printing{scryfall_id: scryfall_id}
              when scryfall_id != deck_card.preferred_printing_id ->
                ClearDeckCardAllocations.run!(deck_card)

                case UpdateDeckCard.run(deck_card, %{"preferred_printing_id" => scryfall_id}) do
                  {:ok, deck_card} -> [deck_card | acc]
                  {:error, reason} -> Repo.rollback(reason)
                end

              _no_change ->
                acc
            end
          end)

        {:ok, Enum.reverse(optimized)}
      end
    end)
  end

  defp update_each(deck_card_ids, operation) do
    deck_card_ids = Enum.uniq(deck_card_ids)

    Repo.transact(fn ->
      with {:ok, deck_cards_by_id} <- load_by_id(deck_card_ids) do
        deck_cards =
          Enum.map(deck_card_ids, fn deck_card_id ->
            case operation.(Map.fetch!(deck_cards_by_id, deck_card_id)) do
              {:ok, deck_card} -> deck_card
              {:error, reason} -> Repo.rollback(reason)
            end
          end)

        {:ok, deck_cards}
      end
    end)
  end

  defp load_by_id(deck_card_ids) do
    deck_cards_by_id =
      DeckCard
      |> where([deck_card], deck_card.id in ^deck_card_ids)
      |> Repo.all()
      |> Map.new(&{&1.id, &1})

    if map_size(deck_cards_by_id) == length(deck_card_ids) do
      {:ok, deck_cards_by_id}
    else
      {:error, :not_found}
    end
  end

  defp load_for_optimization(deck_card_ids) do
    case load_by_id(deck_card_ids) do
      {:ok, deck_cards_by_id} ->
        deck_cards_by_id =
          deck_cards_by_id
          |> Map.values()
          |> Repo.preload([:deck_allocations, card: :printings])
          |> Map.new(&{&1.id, &1})

        {:ok, deck_cards_by_id}

      {:error, :not_found} = error ->
        error
    end
  end

  defp normalize_tag(tag) when tag in ["", nil], do: nil
  defp normalize_tag(tag), do: tag
end
