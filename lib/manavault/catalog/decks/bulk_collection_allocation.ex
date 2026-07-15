defmodule Manavault.Catalog.Decks.BulkCollectionAllocation do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{CollectionItem, Deck, DeckCard}

  alias Manavault.Catalog.Decks.{
    AllocationStatus,
    DeckCardAllocation,
    EditGuard
  }

  alias Manavault.Repo

  def bulk_add_collection_items_to_deck(deck_or_id, collection_item_ids, zone \\ "mainboard")

  def bulk_add_collection_items_to_deck(deck_or_id, [], _zone) do
    Repo.transact(fn ->
      deck = load_deck!(deck_or_id)

      with :ok <- EditGuard.ensure_deck_editable(deck) do
        {:ok, []}
      end
    end)
  end

  def bulk_add_collection_items_to_deck(deck_or_id, collection_item_ids, zone)
      when is_list(collection_item_ids) do
    with {:ok, item_ids} <- normalize_collection_item_ids(collection_item_ids) do
      Repo.transact(fn ->
        deck = load_deck!(deck_or_id)

        with :ok <- EditGuard.ensure_deck_editable(deck),
             {:ok, items} <- load_ordered_collection_items(item_ids),
             :ok <- validate_single_finish_per_card(items),
             {:ok, deck_cards_by_key} <- upsert_bulk_deck_cards(deck, items, zone),
             :ok <- validate_bulk_deck_card_allocation_room(items, deck_cards_by_key) do
          Enum.each(items, fn item ->
            unless basic_land_item?(item) do
              deck_card = Map.fetch!(deck_cards_by_key, collection_item_deck_card_key(item))
              DeckCardAllocation.insert_deck_allocation!(deck_card, item, 1)
            end
          end)

          deck_cards =
            deck_cards_by_key
            |> Map.values()
            |> Enum.sort_by(& &1.id)
            |> Repo.reload!()
            |> Repo.preload([:card, :preferred_printing], force: true)

          {:ok, deck_cards}
        end
      end)
    end
  end

  defp load_deck!(%Deck{id: id}), do: Repo.get!(Deck, id)
  defp load_deck!(id), do: Repo.get!(Deck, id)

  defp normalize_collection_item_ids(collection_item_ids) do
    result =
      Enum.reduce_while(collection_item_ids, {:ok, []}, fn item_id, {:ok, item_ids} ->
        case normalize_positive_id(item_id) do
          {:ok, item_id} -> {:cont, {:ok, [item_id | item_ids]}}
          :error -> {:halt, {:error, :collection_item_not_found}}
        end
      end)

    case result do
      {:ok, item_ids} -> {:ok, item_ids |> Enum.reverse() |> Enum.uniq()}
      {:error, reason} -> {:error, reason}
    end
  end

  defp normalize_positive_id(item_id) when is_integer(item_id) and item_id > 0, do: {:ok, item_id}

  defp normalize_positive_id(item_id) when is_binary(item_id) do
    case Integer.parse(item_id) do
      {item_id, ""} when item_id > 0 -> {:ok, item_id}
      _invalid -> :error
    end
  end

  defp normalize_positive_id(_item_id), do: :error

  defp load_ordered_collection_items(item_ids) do
    items = load_collection_items(item_ids)

    with :ok <- validate_collection_items_loaded(items, item_ids) do
      items_by_id = Map.new(items, &{&1.id, &1})
      {:ok, Enum.map(item_ids, &Map.fetch!(items_by_id, &1))}
    end
  end

  defp load_collection_items(item_ids) do
    item_ids
    |> Enum.chunk_every(500)
    |> Enum.flat_map(fn chunk ->
      CollectionItem
      |> join(:inner, [item], printing in assoc(item, :printing))
      |> join(:inner, [_item, printing], card in assoc(printing, :card))
      |> join(:left, [item, _printing, _card], location in assoc(item, :location_assoc))
      |> where([item, _printing, _card, _location], item.id in ^chunk)
      |> preload([_item, printing, card, location],
        printing: {printing, card: card},
        location_assoc: location
      )
      |> Repo.all()
    end)
  end

  defp validate_collection_items_loaded(items, item_ids) do
    loaded_ids =
      items
      |> Enum.map(& &1.id)
      |> MapSet.new()

    if Enum.all?(item_ids, &MapSet.member?(loaded_ids, &1)) do
      :ok
    else
      {:error, :collection_item_not_found}
    end
  end

  defp validate_single_finish_per_card(items) do
    items
    |> Enum.group_by(fn item -> item.printing.oracle_id end)
    |> Enum.reduce_while(:ok, fn {_oracle_id, grouped_items}, :ok ->
      finish_count =
        grouped_items
        |> Enum.map(& &1.finish)
        |> Enum.uniq()
        |> length()

      if finish_count == 1 do
        {:cont, :ok}
      else
        {:halt, {:error, :allocation_finish_mismatch}}
      end
    end)
  end

  defp upsert_bulk_deck_cards(%Deck{id: deck_id}, items, zone) do
    existing_by_oracle_id = existing_bulk_deck_cards(deck_id, items, zone)

    items
    |> Enum.group_by(&collection_item_deck_card_key/1)
    |> Enum.reduce_while({:ok, %{}}, fn {{oracle_id, finish} = key, grouped_items},
                                        {:ok, deck_cards_by_key} ->
      result =
        case Map.get(existing_by_oracle_id, oracle_id) do
          nil ->
            insert_bulk_deck_card(deck_id, oracle_id, finish, grouped_items, zone)

          %DeckCard{finish: ^finish} = deck_card ->
            update_bulk_deck_card(deck_card, finish, grouped_items)

          %DeckCard{} ->
            {:error, :allocation_finish_mismatch}
        end

      case result do
        {:ok, deck_card} -> {:cont, {:ok, Map.put(deck_cards_by_key, key, deck_card)}}
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
  end

  defp existing_bulk_deck_cards(deck_id, items, zone) do
    oracle_ids =
      items
      |> Enum.map(fn item -> item.printing.oracle_id end)
      |> Enum.uniq()

    DeckCard
    |> where(
      [deck_card],
      deck_card.deck_id == ^deck_id and deck_card.zone == ^zone and
        deck_card.oracle_id in ^oracle_ids
    )
    |> Repo.all()
    |> Map.new(&{&1.oracle_id, &1})
  end

  defp insert_bulk_deck_card(deck_id, oracle_id, finish, grouped_items, zone) do
    attrs = %{
      "deck_id" => deck_id,
      "oracle_id" => oracle_id,
      "preferred_printing_id" => List.first(grouped_items).scryfall_id,
      "quantity" => length(grouped_items),
      "zone" => zone,
      "finish" => finish
    }

    %DeckCard{}
    |> DeckCard.changeset(attrs)
    |> Repo.insert()
  end

  defp update_bulk_deck_card(%DeckCard{} = deck_card, finish, grouped_items) do
    attrs = %{
      "quantity" => deck_card.quantity + length(grouped_items),
      "finish" => finish,
      "preferred_printing_id" => List.first(grouped_items).scryfall_id
    }

    deck_card
    |> DeckCard.changeset(attrs)
    |> Repo.update()
  end

  defp validate_bulk_deck_card_allocation_room(items, deck_cards_by_key) do
    allocatable_items = Enum.reject(items, &basic_land_item?/1)

    deck_cards_with_status =
      deck_cards_by_key
      |> Map.values()
      |> AllocationStatus.put_deck_card_allocation_statuses()

    statuses_by_id = Map.new(deck_cards_with_status, &{&1.id, &1.allocation_status})

    with :ok <-
           validate_bulk_deck_card_capacity(allocatable_items, deck_cards_by_key, statuses_by_id) do
      validate_bulk_collection_item_candidates(
        allocatable_items,
        deck_cards_by_key,
        statuses_by_id
      )
    end
  end

  defp validate_bulk_deck_card_capacity(items, deck_cards_by_key, statuses_by_id) do
    items
    |> Enum.reduce(%{}, fn item, counts ->
      deck_card = Map.fetch!(deck_cards_by_key, collection_item_deck_card_key(item))
      Map.update(counts, deck_card.id, 1, &(&1 + 1))
    end)
    |> Enum.reduce_while(:ok, fn {deck_card_id, quantity}, :ok ->
      status = Map.fetch!(statuses_by_id, deck_card_id)

      if status.allocated + quantity > status.required do
        {:halt, {:error, :deck_card_already_allocated}}
      else
        {:cont, :ok}
      end
    end)
  end

  defp validate_bulk_collection_item_candidates(items, deck_cards_by_key, statuses_by_id) do
    Enum.reduce_while(items, :ok, fn item, :ok ->
      deck_card = Map.fetch!(deck_cards_by_key, collection_item_deck_card_key(item))
      status = Map.fetch!(statuses_by_id, deck_card.id)
      candidate = Enum.find(status.candidates, &(&1.item.id == item.id))

      case DeckCardAllocation.validate_loaded_item_matches_deck_card(item, deck_card) do
        :ok ->
          cond do
            is_nil(candidate) ->
              {:halt, {:error, :allocation_card_mismatch}}

            candidate.available < 1 ->
              {:halt, {:error, :not_enough_available}}

            true ->
              {:cont, :ok}
          end

        {:error, reason} ->
          {:halt, {:error, reason}}
      end
    end)
  end

  defp collection_item_deck_card_key(%CollectionItem{} = item) do
    {item.printing.oracle_id, item.finish}
  end

  defp basic_land_item?(%CollectionItem{printing: %{card: %{type_line: type_line}}})
       when is_binary(type_line) do
    String.contains?(type_line, "Basic Land")
  end

  defp basic_land_item?(_item), do: false
end
