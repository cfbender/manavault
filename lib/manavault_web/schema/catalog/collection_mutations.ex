defmodule ManavaultWeb.Schema.Catalog.CollectionMutations do
  @moduledoc false

  alias Manavault.Catalog
  alias ManavaultWeb.Schema.Catalog.Errors
  alias ManavaultWeb.Schema.RelayHelpers

  def create_collection_item(_parent, %{input: input}, resolution) do
    with {:ok, input} <- normalize_collection_item_input(input, resolution) do
      case Catalog.create_collection_item(input) do
        {:ok, item} -> {:ok, Catalog.get_collection_item!(item.id)}
        {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
      end
    end
  end

  def update_collection_item(_parent, %{id: id, input: input}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :collection_item, resolution),
         {:ok, input} <- normalize_collection_item_input(input, resolution) do
      item = Catalog.get_collection_item!(id)

      case Catalog.update_collection_item(item, input) do
        {:ok, item} -> {:ok, Catalog.get_collection_item!(item.id)}
        {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
      end
    end
  end

  def bulk_update_collection_items(_parent, %{ids: ids, input: input}, resolution) do
    with {:ok, %{ids: ids}} <-
           RelayHelpers.put_node_ids_arg(%{ids: ids}, :ids, :collection_item, resolution),
         {:ok, input} <- normalize_collection_item_input(input, resolution) do
      case Catalog.update_collection_items(ids, input) do
        {:ok, items} -> {:ok, Enum.map(items, &Catalog.get_collection_item!(&1.id))}
        {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
      end
    end
  end

  def delete_collection_item(_parent, %{id: id}, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(id, :collection_item, resolution) do
      item = Catalog.get_collection_item!(id)

      case Catalog.delete_collection_item(item) do
        {:ok, item} -> {:ok, item}
        {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
      end
    end
  end

  defp normalize_collection_item_input(input, resolution) do
    input
    |> RelayHelpers.put_optional_node_id(:scryfall_id, :printing, resolution)
    |> with_input(&RelayHelpers.put_optional_node_id(&1, :location_id, :location, resolution))
    |> with_input(&normalize_unfiled_location/1)
  end

  defp normalize_unfiled_location(%{location_id: "unfiled"} = input),
    do: {:ok, Map.put(input, :location_id, nil)}

  defp normalize_unfiled_location(input), do: {:ok, input}

  defp with_input({:ok, input}, fun), do: fun.(input)
  defp with_input({:error, message}, _fun), do: {:error, message}
end
