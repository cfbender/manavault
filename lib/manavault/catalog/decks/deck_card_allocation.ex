defmodule Manavault.Catalog.Decks.DeckCardAllocation do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{
    Collection,
    CollectionItem,
    DeckAllocation,
    DeckCard,
    Location,
    Util
  }

  alias Manavault.Catalog.Decks.{AllocationItems, AllocationStatus, EditGuard}
  alias Manavault.Repo

  def allocate_collection_item_to_deck_card(deck_card_id, collection_item_id, quantity \\ 1) do
    quantity = Util.parse_quantity(quantity)

    Repo.transact(fn ->
      deck_card =
        DeckCard |> Repo.get!(deck_card_id) |> Repo.preload([:deck, :preferred_printing])

      with :ok <- EditGuard.ensure_deck_card_editable(deck_card) do
        item = Collection.get_collection_item!(collection_item_id)
        allocate_loaded_item_to_deck_card(deck_card, item, quantity)
      end
    end)
  end

  def deallocate_collection_item_from_deck_card(deck_card_id, collection_item_id, quantity \\ 1) do
    quantity = Util.parse_quantity(quantity)

    Repo.transact(fn ->
      allocation =
        Repo.one(
          from allocation in DeckAllocation,
            where:
              allocation.deck_card_id == ^deck_card_id and
                allocation.collection_item_id == ^collection_item_id,
            limit: 1
        )

      case allocation do
        nil ->
          {:error, :allocation_not_found}

        %DeckAllocation{quantity: allocation_quantity} when allocation_quantity <= quantity ->
          allocation = Repo.preload(allocation, [:collection_item, deck_card: :deck])

          with :ok <- EditGuard.ensure_deck_card_editable(allocation.deck_card) do
            AllocationItems.restore_from_deck!(
              allocation.collection_item,
              allocation_quantity,
              allocation.source_location_id
            )

            case Repo.delete(allocation) do
              {:ok, _allocation} -> {:ok, allocation}
              {:error, changeset} -> {:error, changeset}
            end
          end

        %DeckAllocation{} = allocation ->
          allocation = Repo.preload(allocation, [:collection_item, deck_card: :deck])

          with :ok <- EditGuard.ensure_deck_card_editable(allocation.deck_card) do
            AllocationItems.restore_from_deck!(
              allocation.collection_item,
              quantity,
              allocation.source_location_id
            )

            case allocation
                 |> DeckAllocation.changeset(%{"quantity" => allocation.quantity - quantity})
                 |> Repo.update() do
              {:ok, updated_allocation} -> {:ok, updated_allocation}
              {:error, changeset} -> {:error, changeset}
            end
          end
      end
    end)
  end

  def allocate_available_preferred_printing_to_deck_card(%DeckCard{} = deck_card, quantity) do
    quantity = Util.parse_quantity(quantity)

    Repo.transact(fn ->
      deck_card =
        DeckCard
        |> Repo.get!(deck_card.id)
        |> Repo.preload([:deck, :preferred_printing])

      with :ok <- EditGuard.ensure_deck_card_editable(deck_card),
           :ok <- validate_positive_allocation_quantity(quantity) do
        status = AllocationStatus.deck_card_allocation_status(deck_card)
        needed = min(quantity, max(status.required - status.allocated, 0))

        {deck_card, _allocated} =
          status.candidates
          |> preferred_printing_candidates(deck_card)
          |> Enum.reduce_while({deck_card, 0}, fn candidate, {deck_card, allocated} ->
            remaining = needed - allocated

            cond do
              remaining <= 0 ->
                {:halt, {deck_card, allocated}}

              candidate.available <= 0 ->
                {:cont, {deck_card, allocated}}

              true ->
                quantity = min(remaining, candidate.available)
                deck_card = put_deck_card_allocation_printing!(deck_card, candidate.item)
                insert_or_update_deck_allocation!(deck_card, candidate.item, quantity)
                {:cont, {deck_card, allocated + quantity}}
            end
          end)

        {:ok, Repo.reload!(deck_card)}
      end
    end)
  end

  def allocate_by_ids_in_transaction(deck_card_id, collection_item_id, quantity) do
    deck_card = Repo.get(DeckCard, deck_card_id)
    item = Repo.get(CollectionItem, collection_item_id)

    cond do
      is_nil(deck_card) ->
        {:error, :deck_card_not_found}

      is_nil(item) ->
        {:error, :collection_item_not_found}

      true ->
        deck_card = Repo.preload(deck_card, [:deck, :preferred_printing])
        item = Repo.preload(item, printing: :card, location_assoc: [])
        allocate_loaded_item_to_deck_card(deck_card, item, quantity)
    end
  end

  def allocate_loaded_item_to_deck_card(%DeckCard{} = deck_card, %CollectionItem{} = item, quantity) do
    with :ok <- validate_collection_item_matches_deck_card(item, deck_card),
         :ok <- validate_deck_card_allocation_room(deck_card, item, quantity),
         {:ok, deck_card} <- put_deck_card_allocation_printing(deck_card, item) do
      {:ok, insert_or_update_deck_allocation!(deck_card, item, quantity)}
    end
  end

  def validate_loaded_item_matches_deck_card(
        %CollectionItem{} = item,
        %DeckCard{} = deck_card
      ) do
    cond do
      match?(%Location{kind: "list"}, item.location_assoc) -> {:error, :allocation_list_location}
      item.printing.oracle_id != deck_card.oracle_id -> {:error, :allocation_card_mismatch}
      true -> :ok
    end
  end

  def insert_deck_allocation!(%DeckCard{} = deck_card, %CollectionItem{} = item, quantity) do
    source_location_id = item.location_id
    allocated_item = AllocationItems.move_to_deck!(item, quantity)

    attrs = %{
      "deck_card_id" => deck_card.id,
      "collection_item_id" => allocated_item.id,
      "source_location_id" => source_location_id,
      "quantity" => quantity
    }

    case %DeckAllocation{}
         |> DeckAllocation.changeset(attrs)
         |> Repo.insert() do
      {:ok, allocation} ->
        clear_getting_tag!(deck_card)
        allocation

      {:error, changeset} ->
        Repo.rollback(changeset)
    end
  end

  defp insert_or_update_deck_allocation!(%DeckCard{} = deck_card, %CollectionItem{} = item, quantity) do
    source_location_id = item.location_id
    allocated_item = AllocationItems.move_to_deck!(item, quantity)

    allocation =
      Repo.one(
        from allocation in DeckAllocation,
          where:
            allocation.deck_card_id == ^deck_card.id and
              allocation.collection_item_id == ^allocated_item.id,
          limit: 1
      )

    attrs = %{
      "deck_card_id" => deck_card.id,
      "collection_item_id" => allocated_item.id,
      "source_location_id" => source_location_id,
      "quantity" => quantity
    }

    result =
      case allocation do
        nil ->
          %DeckAllocation{}
          |> DeckAllocation.changeset(attrs)
          |> Repo.insert()

        %DeckAllocation{} = allocation ->
          allocation
          |> DeckAllocation.changeset(%{"quantity" => allocation.quantity + quantity})
          |> Repo.update()
      end

    case result do
      {:ok, allocation} ->
        clear_getting_tag!(deck_card)
        allocation

      {:error, changeset} ->
        Repo.rollback(changeset)
    end
  end

  defp validate_collection_item_matches_deck_card(
         %CollectionItem{} = item,
         %DeckCard{} = deck_card
       ) do
    item =
      Repo.preload(item,
        printing: [:card],
        location_assoc: []
      )

    validate_loaded_item_matches_deck_card(item, deck_card)
  end

  defp validate_deck_card_allocation_room(
         %DeckCard{} = deck_card,
         %CollectionItem{} = item,
         quantity
       ) do
    status = AllocationStatus.deck_card_allocation_status(deck_card)
    candidate = Enum.find(status.candidates, &(&1.item.id == item.id))

    cond do
      is_nil(candidate) ->
        {:error, :allocation_card_mismatch}

      candidate.available < quantity ->
        {:error, :not_enough_available}

      status.allocated + quantity > status.required ->
        {:error, :deck_card_already_allocated}

      true ->
        :ok
    end
  end

  defp validate_positive_allocation_quantity(quantity) when quantity > 0, do: :ok

  defp validate_positive_allocation_quantity(_quantity), do: {:error, :invalid_allocation_quantity}

  defp preferred_printing_candidates(candidates, %DeckCard{
         finish: finish,
         preferred_printing_id: preferred_printing_id
       })
       when is_binary(preferred_printing_id) do
    candidates
    |> Enum.filter(&(&1.item.scryfall_id == preferred_printing_id))
    |> Enum.sort_by(fn candidate ->
      {if(candidate.item.finish == finish, do: 0, else: 1), candidate.item.id}
    end)
  end

  defp preferred_printing_candidates(_candidates, _deck_card), do: []

  defp put_deck_card_allocation_printing!(%DeckCard{} = deck_card, %CollectionItem{} = item) do
    case put_deck_card_allocation_printing(deck_card, item) do
      {:ok, deck_card} -> deck_card
      {:error, changeset} -> Repo.rollback(changeset)
    end
  end

  defp put_deck_card_allocation_printing(
         %DeckCard{preferred_printing_id: scryfall_id, finish: finish} = deck_card,
         %CollectionItem{scryfall_id: scryfall_id, finish: finish}
       ) do
    {:ok, deck_card}
  end

  defp put_deck_card_allocation_printing(%DeckCard{} = deck_card, %CollectionItem{} = item) do
    deck_card
    |> DeckCard.changeset(%{"preferred_printing_id" => item.scryfall_id, "finish" => item.finish})
    |> Repo.update()
  end

  defp clear_getting_tag!(%DeckCard{tag: "getting"} = deck_card) do
    case deck_card |> DeckCard.changeset(%{"tag" => nil}) |> Repo.update() do
      {:ok, deck_card} -> deck_card
      {:error, changeset} -> Repo.rollback(changeset)
    end
  end

  defp clear_getting_tag!(%DeckCard{} = deck_card), do: deck_card
end
