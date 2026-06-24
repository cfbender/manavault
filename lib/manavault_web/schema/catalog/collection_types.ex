defmodule ManavaultWeb.Schema.Catalog.CollectionTypes do
  @moduledoc false

  use Absinthe.Schema.Notation

  import Absinthe.Resolution.Helpers, only: [dataloader: 1, dataloader: 2]

  alias Manavault.Catalog

  alias ManavaultWeb.Schema.Catalog.CollectionFields
  alias ManavaultWeb.Schema.CatalogResolvers

  object :collection_item do
    field :id, non_null(:id)
    field :quantity, non_null(:integer)
    field :condition, non_null(:string)
    field :language, non_null(:string)
    field :finish, non_null(:string)
    field :notes, :string
    field :printing, :printing, resolve: dataloader(Catalog)

    field :current_price_cents, :integer do
      resolve(&CatalogResolvers.collection_item_current_price_cents/3)
    end

    field :purchase_price_cents, :integer do
      resolve(&CatalogResolvers.collection_item_purchase_price_cents/3)
    end

    field :price_text, :string do
      resolve(&CatalogResolvers.collection_item_price_text/3)
    end

    field :purchase_price_text, :string do
      resolve(&CatalogResolvers.collection_item_purchase_price_text/3)
    end

    field :value_gain_cents, :integer do
      resolve(&CatalogResolvers.collection_item_value_gain_cents/3)
    end

    field :value_gain_text, :string do
      resolve(&CatalogResolvers.collection_item_value_gain_text/3)
    end

    field :value_gain_percent, :float do
      resolve(&CatalogResolvers.collection_item_value_gain_percent/3)
    end

    field :value_gain_percent_text, :string do
      resolve(&CatalogResolvers.collection_item_value_gain_percent_text/3)
    end

    field :allocated_quantity, non_null(:integer) do
      resolve(&CatalogResolvers.collection_item_allocated_quantity/3)
    end

    field :location, :location, resolve: dataloader(Catalog, :location_assoc)
  end

  object :location do
    field :id, non_null(:id)
    field :name, non_null(:string)
    field :kind, non_null(:string)
    field :description, :string

    field :cover_printing, :printing do
      resolve(&CollectionFields.location_cover_printing/3)
    end

    field :item_count, :integer do
      resolve(&CatalogResolvers.location_item_count/3)
    end

    field :total_price_cents, :integer do
      resolve(&CatalogResolvers.location_total_price_cents/3)
    end

    field :total_price_text, :string do
      resolve(&CatalogResolvers.location_total_price_text/3)
    end

    field :purchase_price_cents, :integer do
      resolve(&CatalogResolvers.location_purchase_price_cents/3)
    end

    field :purchase_price_text, :string do
      resolve(&CatalogResolvers.location_purchase_price_text/3)
    end

    field :value_gain_cents, :integer do
      resolve(&CatalogResolvers.location_value_gain_cents/3)
    end

    field :value_gain_text, :string do
      resolve(&CatalogResolvers.location_value_gain_text/3)
    end

    field :value_gain_percent, :float do
      resolve(&CatalogResolvers.location_value_gain_percent/3)
    end

    field :value_gain_percent_text, :string do
      resolve(&CatalogResolvers.location_value_gain_percent_text/3)
    end

    field :value_summary, non_null(:collection_value_summary) do
      resolve(&CatalogResolvers.location_value_summary/3)
    end

    field :collection_items, list_of(:collection_item) do
      arg(:limit, :integer, default_value: 100)
      arg(:offset, :integer, default_value: 0)
      resolve(&CatalogResolvers.location_collection_items/3)
    end
  end

  object :home_summary do
    field :collection_count, non_null(:integer)
    field :location_count, non_null(:integer)
    field :deck_count, non_null(:integer)
  end

  object :collection_value_summary do
    field :total_price_cents, non_null(:integer)
    field :total_price_text, :string
    field :purchase_price_cents, non_null(:integer)
    field :purchase_price_text, :string
    field :value_gain_cents, non_null(:integer)
    field :value_gain_text, :string
    field :value_gain_percent, :float
    field :value_gain_percent_text, :string
  end

  object :collection_import_attrs do
    field :name, :string do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :set_code, :string do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :collector_number, :string do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :quantity, :integer do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :finish, :string do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :condition, :string do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :language, :string do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :scryfall_id, :id do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :location_id, :id do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :purchase_price_cents, :integer do
      resolve(&CatalogResolvers.map_value/3)
    end
  end

  object :collection_import_row do
    field :row_number, non_null(:integer)
    field :status, non_null(:string)
    field :attrs, non_null(:collection_import_attrs)
    field :printing, :printing
    field :candidates, non_null(list_of(non_null(:printing)))
  end

  object :collection_import_preview do
    field :location_id, :id
    field :total, non_null(:integer)
    field :exact, non_null(:integer)
    field :ambiguous, non_null(:integer)
    field :unresolved, non_null(:integer)
    field :rows, non_null(list_of(non_null(:collection_import_row)))
  end

  object :collection_import_result do
    field :imported, non_null(:integer)
    field :skipped, non_null(:integer)
  end

  input_object :collection_item_filters do
    field :q, :string
    field :condition, :string
    field :language, :string
    field :finish, :string
    field :location_id, :id
  end

  input_object :collection_item_sort do
    field :field, :string
    field :direction, :string
  end

  input_object :collection_item_input do
    field :scryfall_id, non_null(:id)
    field :quantity, :integer
    field :condition, :string
    field :language, :string
    field :finish, :string
    field :location_id, :id
    field :notes, :string
    field :purchase_price_cents, :integer
  end

  input_object :collection_item_update_input do
    field :quantity, :integer
    field :condition, :string
    field :language, :string
    field :finish, :string
    field :location_id, :id
    field :notes, :string
    field :purchase_price_cents, :integer
  end

  input_object :collection_import_preview_input do
    field :text, non_null(:string)
    field :format, :string
    field :file_name, :string
    field :location_id, :id
  end

  input_object :collection_import_attrs_input do
    field :name, :string
    field :set_code, :string
    field :collector_number, :string
    field :quantity, :integer
    field :finish, :string
    field :condition, :string
    field :language, :string
    field :scryfall_id, :id
    field :location_id, :id
    field :purchase_price_cents, :integer
  end

  input_object :collection_import_row_input do
    field :row_number, non_null(:integer)
    field :status, non_null(:string)
    field :attrs, non_null(:collection_import_attrs_input)
  end

  input_object :collection_import_commit_input do
    field :rows, non_null(list_of(non_null(:collection_import_row_input)))
  end

  input_object :location_update_input do
    field :name, :string
    field :kind, :string
    field :description, :string
    field :cover_scryfall_id, :id
  end

  input_object :location_input do
    field :name, non_null(:string)
    field :kind, :string
    field :description, :string
    field :cover_scryfall_id, :id
  end
end
