defmodule ManavaultWeb.Schema.Catalog.CollectionSelector do
  @moduledoc false

  alias Manavault.Catalog
  alias ManavaultWeb.Schema.Catalog.QueryResolvers
  alias ManavaultWeb.Schema.RelayHelpers

  @doc """
  Resolves a :collection_item_selector input to internal collection item ids.

  With all: true the ids are looked up server-side from the selector's filters
  (minus excluded_ids), so "select all" never pages ids through the client.
  """
  def collection_item_ids(selector, resolution) do
    if Map.get(selector, :all, false) do
      all_collection_item_ids(selector, resolution)
    else
      parse_ids(Map.get(selector, :ids) || [], resolution)
    end
  end

  defp all_collection_item_ids(selector, resolution) do
    filter_args = %{filters: Map.get(selector, :filters) || %{}}

    with {:ok, filters} <- QueryResolvers.collection_filters(filter_args, resolution),
         {:ok, excluded_ids} <- parse_ids(Map.get(selector, :excluded_ids) || [], resolution) do
      excluded = MapSet.new(excluded_ids)

      ids =
        filters
        |> Catalog.list_collection_item_ids()
        |> Enum.reject(&MapSet.member?(excluded, &1))

      {:ok, ids}
    end
  end

  defp parse_ids(ids, resolution) do
    ids
    |> Enum.reduce_while({:ok, []}, fn id, {:ok, parsed} ->
      case RelayHelpers.node_id(id, :collection_item, resolution) do
        {:ok, parsed_id} -> {:cont, {:ok, [parsed_id | parsed]}}
        {:error, message} -> {:halt, {:error, message}}
      end
    end)
    |> case do
      {:ok, parsed} -> {:ok, Enum.reverse(parsed)}
      {:error, message} -> {:error, message}
    end
  end
end
