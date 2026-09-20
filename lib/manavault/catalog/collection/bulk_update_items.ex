defmodule Manavault.Catalog.Collection.BulkUpdateItems do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.Collection.ItemAttrs
  alias Manavault.Catalog.CollectionItem
  alias Manavault.Repo

  @id_chunk_size 500

  def run(ids, attrs) when is_list(ids) and is_map(attrs) do
    attrs = ItemAttrs.normalize(attrs)

    Repo.transaction(fn ->
      items_by_id = items_by_id(ids)
      missing_ids = ids |> Enum.uniq() |> Enum.reject(&Map.has_key?(items_by_id, &1))

      if missing_ids != [], do: Repo.rollback({:not_found, missing_ids})

      Enum.map(ids, &update_item(Map.fetch!(items_by_id, &1), attrs))
    end)
  end

  defp items_by_id(ids) do
    ids
    |> Enum.chunk_every(@id_chunk_size)
    |> Enum.flat_map(fn chunk ->
      CollectionItem
      |> where([item], item.id in ^chunk)
      |> Repo.all()
    end)
    |> Map.new(&{&1.id, &1})
  end

  defp update_item(item, attrs) do
    item
    |> CollectionItem.update_changeset(attrs)
    |> ItemAttrs.validate_finish_available()
    |> Repo.update()
    |> case do
      {:ok, updated_item} -> updated_item
      {:error, changeset} -> Repo.rollback(changeset)
    end
  end
end
