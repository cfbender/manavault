defmodule Manavault.Catalog.Decks.UpdateDeckCard do
  @moduledoc false

  alias Manavault.Catalog.{DeckCard, Printing}

  alias Manavault.Catalog.Decks.{
    ClearDeckCardAllocations,
    DeckCardAllocation,
    EditGuard
  }

  alias Manavault.Repo

  def change(%DeckCard{} = deck_card, attrs \\ %{}), do: DeckCard.changeset(deck_card, attrs)

  def run(%DeckCard{} = deck_card, attrs) when is_map(attrs) do
    attrs =
      attrs
      |> stringify_keys()
      |> normalize_blank_preferred_printing()
      |> normalize_blank_deck_card_tag()
      |> Map.put_new("deck_id", deck_card.deck_id)
      |> Map.put_new("oracle_id", deck_card.oracle_id)

    with :ok <- EditGuard.ensure_deck_card_editable(deck_card),
         {:ok, attrs} <- validate_preferred_printing_identity(attrs) do
      update_with_allocation_switch(deck_card, attrs)
    end
  end

  defp update_with_allocation_switch(%DeckCard{} = deck_card, attrs) do
    cond do
      moving_to_considering?(deck_card, attrs) ->
        Repo.transact(fn ->
          with {:ok, deck_card} <- update_record(deck_card, Map.put(attrs, "proxy_quantity", 0)) do
            ClearDeckCardAllocations.run!(deck_card)
            {:ok, deck_card}
          end
        end)

      should_switch_allocation?(deck_card, attrs) ->
        Repo.transact(fn ->
          with {:ok, deck_card} <- update_record(deck_card, attrs) do
            allocation_quantity = physical_allocation_quantity(deck_card)
            ClearDeckCardAllocations.run!(deck_card)
            allocate_replacement(deck_card, allocation_quantity)
          end
        end)

      true ->
        update_record(deck_card, attrs)
    end
  end

  defp allocate_replacement(deck_card, allocation_quantity) when allocation_quantity > 0 do
    case DeckCardAllocation.allocate_available_preferred_printing_to_deck_card(
           deck_card,
           allocation_quantity
         ) do
      {:ok, deck_card} -> {:ok, Repo.preload(deck_card, [:card, :preferred_printing])}
      {:error, reason} -> Repo.rollback(reason)
    end
  end

  defp allocate_replacement(deck_card, _allocation_quantity), do: {:ok, deck_card}

  defp update_record(%DeckCard{} = deck_card, attrs) do
    deck_card |> DeckCard.changeset(attrs) |> Repo.update()
  end

  defp should_switch_allocation?(%DeckCard{} = deck_card, attrs) do
    (Map.has_key?(attrs, "preferred_printing_id") and
       attrs["preferred_printing_id"] != deck_card.preferred_printing_id) or
      (Map.has_key?(attrs, "finish") and attrs["finish"] != deck_card.finish)
  end

  defp moving_to_considering?(%DeckCard{zone: zone}, %{"zone" => "considering"}),
    do: zone != "considering"

  defp moving_to_considering?(%DeckCard{}, _attrs), do: false

  defp physical_allocation_quantity(%DeckCard{} = deck_card) do
    deck_card
    |> Repo.preload(:deck_allocations, force: true)
    |> Map.fetch!(:deck_allocations)
    |> Enum.reduce(0, &(&1.quantity + &2))
  end

  defp validate_preferred_printing_identity(
         %{"oracle_id" => oracle_id, "preferred_printing_id" => preferred_printing_id} = attrs
       )
       when is_binary(preferred_printing_id) do
    case Repo.get(Printing, preferred_printing_id) do
      %Printing{oracle_id: ^oracle_id} -> {:ok, attrs}
      %Printing{} -> {:error, :preferred_printing_mismatch}
      nil -> {:error, :preferred_printing_not_found}
    end
  end

  defp validate_preferred_printing_identity(attrs), do: {:ok, attrs}
  defp stringify_keys(attrs), do: Map.new(attrs, fn {key, value} -> {to_string(key), value} end)

  defp normalize_blank_preferred_printing(%{"preferred_printing_id" => ""} = attrs),
    do: Map.put(attrs, "preferred_printing_id", nil)

  defp normalize_blank_preferred_printing(attrs), do: attrs

  defp normalize_blank_deck_card_tag(%{"tag" => tag} = attrs),
    do: Map.put(attrs, "tag", if(tag in ["", nil], do: nil, else: tag))

  defp normalize_blank_deck_card_tag(attrs), do: attrs
end
