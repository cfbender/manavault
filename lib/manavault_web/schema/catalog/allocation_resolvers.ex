defmodule ManavaultWeb.Schema.Catalog.AllocationResolvers do
  @moduledoc false

  alias Manavault.Catalog
  alias Manavault.Catalog.DeckCard
  alias Manavault.Repo
  alias ManavaultWeb.Schema.Catalog.{CollectionSelector, Errors}
  alias ManavaultWeb.Schema.RelayHelpers

  def add_collection_item_to_deck(_parent, %{id: id, deck_id: deck_id} = args, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :collection_item, resolution),
         {:ok, deck_id} <- RelayHelpers.node_id(deck_id, :deck, resolution) do
      item = Catalog.get_collection_item!(id)
      deck = Catalog.get_deck!(deck_id)
      zone = Map.get(args, :zone, "mainboard")

      attrs = %{
        "oracle_id" => item.printing.card.oracle_id,
        "preferred_printing_id" => item.scryfall_id,
        "finish" => item.finish,
        "quantity" => 1,
        "zone" => zone
      }

      with {:ok, deck_card} <- Catalog.add_card_to_deck(deck, attrs),
           {:ok, _allocation} <-
             Catalog.allocate_collection_item_to_deck_card(deck_card.id, item.id, 1) do
        {:ok, Repo.preload(deck_card, [:card, :preferred_printing])}
      else
        {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
          {:error, Errors.changeset_error_message(changeset)}

        {:error, reason} ->
          {:error, Errors.deck_allocation_error(reason)}
      end
    end
  end

  def bulk_add_collection_items_to_deck(
        _parent,
        %{selector: selector, deck_id: deck_id} = args,
        resolution
      ) do
    with {:ok, ids} <- CollectionSelector.collection_item_ids(selector, resolution),
         {:ok, deck_id} <- RelayHelpers.node_id(deck_id, :deck, resolution) do
      zone = Map.get(args, :zone, "mainboard")

      case Catalog.bulk_add_collection_items_to_deck(deck_id, ids, zone) do
        {:ok, deck_cards} ->
          {:ok, deck_cards}

        {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
          {:error, Errors.changeset_error_message(changeset)}

        {:error, reason} ->
          {:error, Errors.deck_allocation_error(reason)}
      end
    end
  end

  def allocate_deck_card_item(
        _parent,
        %{deck_card_id: deck_card_id, collection_item_id: collection_item_id},
        resolution
      ) do
    with {:ok, deck_card_id} <- RelayHelpers.node_id(deck_card_id, :deck_card, resolution),
         {:ok, collection_item_id} <-
           RelayHelpers.node_id(collection_item_id, :collection_item, resolution) do
      case Catalog.allocate_collection_item_to_deck_card(deck_card_id, collection_item_id) do
        {:ok, _allocation} ->
          {:ok, DeckCard |> Repo.get!(deck_card_id) |> Repo.preload([:card, :preferred_printing])}

        {:error, reason} ->
          {:error, Errors.deck_allocation_error(reason)}
      end
    end
  end

  def deallocate_deck_card_item(
        _parent,
        %{deck_card_id: deck_card_id, collection_item_id: collection_item_id},
        resolution
      ) do
    with {:ok, deck_card_id} <- RelayHelpers.node_id(deck_card_id, :deck_card, resolution),
         {:ok, collection_item_id} <-
           RelayHelpers.node_id(collection_item_id, :collection_item, resolution) do
      case Catalog.deallocate_collection_item_from_deck_card(deck_card_id, collection_item_id) do
        {:ok, _allocation} ->
          {:ok, DeckCard |> Repo.get!(deck_card_id) |> Repo.preload([:card, :preferred_printing])}

        {:error, reason} ->
          {:error, Errors.deck_allocation_error(reason)}
      end
    end
  end

  def allocate_deck_card_proxy(_parent, %{deck_card_id: deck_card_id} = args, resolution) do
    with {:ok, deck_card_id} <- RelayHelpers.node_id(deck_card_id, :deck_card, resolution) do
      quantity = Map.get(args, :quantity, 1)

      case Catalog.allocate_proxy_to_deck_card(deck_card_id, quantity) do
        {:ok, _deck_card} ->
          {:ok, DeckCard |> Repo.get!(deck_card_id) |> Repo.preload([:card, :preferred_printing])}

        {:error, reason} ->
          {:error, Errors.deck_allocation_error(reason)}
      end
    end
  end

  def deallocate_deck_card_proxy(_parent, %{deck_card_id: deck_card_id} = args, resolution) do
    with {:ok, deck_card_id} <- RelayHelpers.node_id(deck_card_id, :deck_card, resolution) do
      quantity = Map.get(args, :quantity, 1)

      case Catalog.deallocate_proxy_from_deck_card(deck_card_id, quantity) do
        {:ok, _deck_card} ->
          {:ok, DeckCard |> Repo.get!(deck_card_id) |> Repo.preload([:card, :preferred_printing])}

        {:error, reason} ->
          {:error, Errors.deck_allocation_error(reason)}
      end
    end
  end

  def preview_bulk_allocate_deck(_parent, %{id: id, mode: mode}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :deck, resolution) do
      deck = Catalog.get_deck!(id)

      case Catalog.preview_bulk_allocate_deck(deck, mode) do
        {:ok, preview} -> {:ok, %{preview | mode: to_string(preview.mode)}}
        {:error, reason} -> {:error, Errors.deck_allocation_error(reason)}
      end
    end
  end

  def bulk_allocate_deck(_parent, %{id: id, mode: mode}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :deck, resolution) do
      deck = Catalog.get_deck!(id)

      case Catalog.bulk_allocate_deck(deck, mode) do
        {:ok, result} -> {:ok, result}
        {:error, reason} -> {:error, Errors.deck_allocation_error(reason)}
      end
    end
  end

  def allocate_deck_pull_list(_parent, %{deck_id: deck_id, entries: entries}, resolution) do
    with {:ok, deck_id} <- RelayHelpers.node_id(deck_id, :deck, resolution),
         {:ok, entries} <- decode_pull_list_entries(entries, resolution) do
      case Catalog.allocate_deck_pull_list(deck_id, entries) do
        {:ok, result} -> {:ok, result}
        {:error, reason} -> {:error, Errors.deck_allocation_error(reason)}
      end
    end
  end

  defp decode_pull_list_entries(entries, resolution) do
    entries
    |> Enum.reduce_while({:ok, []}, fn entry, {:ok, decoded} ->
      with {:ok, deck_card_id} <-
             RelayHelpers.node_id(entry.deck_card_id, :deck_card, resolution),
           {:ok, collection_item_id} <-
             RelayHelpers.node_id(entry.collection_item_id, :collection_item, resolution) do
        entry = %{entry | deck_card_id: deck_card_id, collection_item_id: collection_item_id}
        {:cont, {:ok, [entry | decoded]}}
      else
        error -> {:halt, error}
      end
    end)
    |> case do
      {:ok, decoded} -> {:ok, Enum.reverse(decoded)}
      error -> error
    end
  end
end
