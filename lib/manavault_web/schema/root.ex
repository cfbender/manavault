defmodule ManavaultWeb.Schema do
  use Absinthe.Schema

  import_types(ManavaultWeb.Schema.CatalogTypes)

  alias ManavaultWeb.Schema.CatalogResolvers

  query do
    field :home_summary, non_null(:home_summary) do
      resolve(&CatalogResolvers.home_summary/3)
    end

    field :cards, non_null(list_of(non_null(:card))) do
      arg(:q, :string, default_value: "")
      arg(:limit, :integer, default_value: 24)
      resolve(&CatalogResolvers.cards/3)
    end

    field :card_name_suggestions, non_null(list_of(non_null(:string))) do
      arg(:q, :string, default_value: "")
      arg(:limit, :integer, default_value: 5)
      resolve(&CatalogResolvers.card_name_suggestions/3)
    end

    field :card, :card do
      arg(:id, non_null(:id))
      resolve(&CatalogResolvers.card/3)
    end

    field :collection_items, non_null(list_of(non_null(:collection_item))) do
      arg(:filters, :collection_item_filters)
      arg(:limit, :integer, default_value: 100)
      arg(:offset, :integer, default_value: 0)
      resolve(&CatalogResolvers.collection_items/3)
    end

    field :collection_item_count, non_null(:integer) do
      arg(:filters, :collection_item_filters)
      resolve(&CatalogResolvers.collection_item_count/3)
    end

    field :locations, non_null(list_of(non_null(:location))) do
      resolve(&CatalogResolvers.locations/3)
    end

    field :location, :location do
      arg(:id, non_null(:id))
      resolve(&CatalogResolvers.location/3)
    end

    field :decks, non_null(list_of(non_null(:deck))) do
      resolve(&CatalogResolvers.decks/3)
    end

    field :deck, :deck do
      arg(:id, non_null(:id))
      resolve(&CatalogResolvers.deck/3)
    end

    field :scan_sessions, non_null(list_of(non_null(:scan_session))) do
      resolve(&CatalogResolvers.scan_sessions/3)
    end
  end
end
