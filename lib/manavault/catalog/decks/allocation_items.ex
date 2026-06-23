defmodule Manavault.Catalog.Decks.AllocationItems do
  @moduledoc false

  alias Manavault.Catalog.{Collection, CollectionItem}
  alias Manavault.Repo

  def move_to_deck!(%CollectionItem{} = item, quantity) do
    cond do
      item.quantity == quantity ->
        update_collection_item_or_rollback!(item, %{"location_id" => nil})

      item.quantity > quantity ->
        update_collection_item_or_rollback!(item, %{"quantity" => item.quantity - quantity})
        create_collection_item_or_rollback!(collection_item_clone_attrs(item, quantity, nil))

      true ->
        Repo.rollback(:not_enough_available)
    end
  end

  def restore_from_deck!(%CollectionItem{} = item, quantity, source_location_id) do
    cond do
      item.quantity == quantity ->
        update_collection_item_or_rollback!(item, %{"location_id" => source_location_id})

      item.quantity > quantity ->
        update_collection_item_or_rollback!(item, %{"quantity" => item.quantity - quantity})

        create_collection_item_or_rollback!(
          collection_item_clone_attrs(item, quantity, source_location_id)
        )

      true ->
        Repo.rollback(:allocation_quantity_mismatch)
    end
  end

  defp update_collection_item_or_rollback!(%CollectionItem{} = item, attrs) do
    case Collection.update_collection_item(item, attrs) do
      {:ok, item} -> item
      {:error, changeset} -> Repo.rollback(changeset)
    end
  end

  defp create_collection_item_or_rollback!(attrs) do
    case Collection.create_collection_item(attrs) do
      {:ok, item} -> item
      {:error, changeset} -> Repo.rollback(changeset)
    end
  end

  defp collection_item_clone_attrs(%CollectionItem{} = item, quantity, location_id) do
    %{
      "scryfall_id" => item.scryfall_id,
      "quantity" => quantity,
      "condition" => item.condition,
      "language" => item.language,
      "finish" => item.finish,
      "location_id" => location_id,
      "notes" => item.notes
    }
  end
end
