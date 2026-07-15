defmodule ManavaultWeb.Schema.Catalog.LocationOperations do
  @moduledoc false

  use Absinthe.Schema.Notation
  use Absinthe.Relay.Schema.Notation, :modern

  alias ManavaultWeb.Schema.Catalog.{MutationResolvers, QueryResolvers}

  object :location_queries do
    connection field :locations, node_type: :location, non_null: true do
      resolve(&QueryResolvers.locations/3)
    end

    field :location, :location do
      arg(:id, non_null(:id))
      resolve(&QueryResolvers.location/3)
    end
  end

  object :location_mutations do
    payload field :create_location do
      arg(:input, non_null(:location_input))

      output do
        field :location, :location
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.create_location/3, :location)
      end)
    end

    payload field :update_location do
      arg(:id, non_null(:id))
      arg(:input, non_null(:location_update_input))

      output do
        field :location, :location
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.update_location/3, :location)
      end)
    end

    payload field :delete_location do
      arg(:id, non_null(:id))

      output do
        field :location, :location
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &MutationResolvers.delete_location/3, :location)
      end)
    end
  end

  defp payload(parent, args, resolution, resolver, field) do
    case resolver.(parent, args, resolution) do
      {:ok, value} when is_map(value) ->
        if Map.has_key?(value, field), do: {:ok, value}, else: {:ok, %{field => value}}

      {:ok, value} ->
        {:ok, %{field => value}}

      other ->
        other
    end
  end
end
