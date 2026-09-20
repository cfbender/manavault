defmodule Manavault.Catalog.Collection.SetTradeQuantity do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.CollectionItem
  alias Manavault.Repo

  @id_chunk_size 500

  def run(ids, quantity) when is_list(ids) and is_integer(quantity) and quantity >= 0 do
    Repo.transaction(fn ->
      items = list_items(ids)
      missing_ids = ids |> Enum.uniq() |> missing_ids(items)

      if missing_ids != [], do: Repo.rollback({:not_found, missing_ids})

      total_quantity = Enum.reduce(items, 0, &((&1.quantity || 0) + &2))

      if quantity > total_quantity, do: Repo.rollback(:invalid_for_trade_quantity)

      {updated_items, _remaining} =
        Enum.map_reduce(items, quantity, fn item, remaining ->
          item_quantity = min(item.quantity, remaining)

          case item
               |> CollectionItem.update_changeset(%{for_trade_quantity: item_quantity})
               |> Repo.update() do
            {:ok, updated_item} -> {updated_item, remaining - item_quantity}
            {:error, changeset} -> Repo.rollback(changeset)
          end
        end)

      %{items: updated_items, quantity: quantity, total_quantity: total_quantity}
    end)
  end

  def run(_ids, _quantity), do: {:error, :invalid_for_trade_quantity}

  defp list_items(ids) do
    ids
    |> Enum.uniq()
    |> Enum.chunk_every(@id_chunk_size)
    |> Enum.flat_map(fn chunk ->
      CollectionItem
      |> where([item], item.id in ^chunk)
      |> Repo.all()
    end)
    |> Enum.sort_by(& &1.id)
  end

  defp missing_ids(ids, items) do
    found_ids = MapSet.new(items, & &1.id)
    Enum.reject(ids, &MapSet.member?(found_ids, &1))
  end
end
