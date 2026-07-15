defmodule ManavaultWeb.Schema.Catalog.CardOperations do
  @moduledoc false

  use Absinthe.Schema.Notation
  use Absinthe.Relay.Schema.Notation, :modern

  alias ManavaultWeb.Schema.Catalog.QueryResolvers

  object :card_queries do
    connection field :cards, node_type: :card, non_null: true do
      arg(:q, :string, default_value: "")
      resolve(&QueryResolvers.cards/3)
    end

    field :card_name_suggestions, non_null(list_of(non_null(:string))) do
      arg(:q, :string, default_value: "")
      arg(:limit, :integer, default_value: 5)
      resolve(&QueryResolvers.card_name_suggestions/3)
    end

    field :set_suggestions, non_null(list_of(non_null(:set_suggestion))) do
      arg(:q, :string, default_value: "")
      arg(:limit, :integer, default_value: 8)
      resolve(&QueryResolvers.set_suggestions/3)
    end

    field :card, :card do
      arg(:id, non_null(:id))
      resolve(&QueryResolvers.card/3)
    end
  end

  object :card_mutations do
    payload field :reload_scryfall_catalog do
      output do
        field :reload_result, :scryfall_reload_result
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &QueryResolvers.reload_scryfall_catalog/3, :reload_result)
      end)
    end

    payload field :reload_scryfall_assets do
      output do
        field :reload_result, :scryfall_reload_result
      end

      resolve(fn parent, args, resolution ->
        payload(parent, args, resolution, &QueryResolvers.reload_scryfall_assets/3, :reload_result)
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
