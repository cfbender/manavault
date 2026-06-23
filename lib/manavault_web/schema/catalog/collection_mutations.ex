defmodule ManavaultWeb.Schema.Catalog.CollectionMutations do
  @moduledoc false

  alias Manavault.Catalog
  alias ManavaultWeb.Schema.Catalog.Errors

  def create_collection_item(_parent, %{input: input}, _resolution) do
    input = normalize_blank_location_id(input)

    case Catalog.create_collection_item(input) do
      {:ok, item} -> {:ok, Catalog.get_collection_item!(item.id)}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  def update_collection_item(_parent, %{id: id, input: input}, _resolution) do
    item = Catalog.get_collection_item!(id)
    input = normalize_blank_location_id(input)

    case Catalog.update_collection_item(item, input) do
      {:ok, item} -> {:ok, Catalog.get_collection_item!(item.id)}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  def delete_collection_item(_parent, %{id: id}, _resolution) do
    item = Catalog.get_collection_item!(id)

    case Catalog.delete_collection_item(item) do
      {:ok, item} -> {:ok, item}
      {:error, changeset} -> {:error, Errors.changeset_error_message(changeset)}
    end
  end

  defp normalize_blank_location_id(%{location_id: ""} = input),
    do: Map.put(input, :location_id, nil)

  defp normalize_blank_location_id(input), do: input
end
