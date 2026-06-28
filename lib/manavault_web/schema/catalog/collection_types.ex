defmodule ManavaultWeb.Schema.Catalog.CollectionTypes do
  @moduledoc false

  use Absinthe.Schema.Notation
  use Absinthe.Relay.Schema.Notation, :modern

  alias Manavault.Catalog.AutoSortRule
  alias ManavaultWeb.Schema.Catalog.CollectionFields
  alias ManavaultWeb.Schema.CatalogResolvers

  node object(:collection_item) do
    field :quantity, non_null(:integer)
    field :condition, non_null(:string)
    field :language, non_null(:string)
    field :finish, non_null(:string)
    field :notes, :string
    field :printing, :printing, resolve: &CatalogResolvers.collection_item_printing/3

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

    field :total_owned_copies, non_null(:integer) do
      resolve(&CatalogResolvers.collection_item_total_owned_copies/3)
    end

    field :allocation_decks, non_null(list_of(non_null(:collection_item_allocation_deck))) do
      resolve(&CatalogResolvers.collection_item_allocation_decks/3)
    end

    field :location, :location, resolve: &CatalogResolvers.collection_item_location/3
  end

  node object(:location) do
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

    connection field :collection_items, node_type: :collection_item do
      resolve(&CatalogResolvers.location_collection_items/3)
    end
  end

  object :collection_item_allocation_deck do
    field :deck, non_null(:deck)
    field :quantity, non_null(:integer)
  end

  connection(node_type: :collection_item)
  connection(node_type: :location)

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

  object :collection_auto_sort_rule do
    field :id, non_null(:id)
    field :name, non_null(:string)
    field :enabled, non_null(:boolean)
    field :priority, non_null(:integer)
    field :target_location, non_null(:location)
    field :color_mode, non_null(:string)

    field :colors, non_null(list_of(non_null(:string))) do
      resolve(fn rule, _args, _resolution -> {:ok, AutoSortRule.list_field(rule, :colors)} end)
    end

    field :type_line_includes, non_null(list_of(non_null(:string))) do
      resolve(fn rule, _args, _resolution ->
        {:ok, AutoSortRule.list_field(rule, :type_line_includes)}
      end)
    end

    field :type_line_excludes, non_null(list_of(non_null(:string))) do
      resolve(fn rule, _args, _resolution ->
        {:ok, AutoSortRule.list_field(rule, :type_line_excludes)}
      end)
    end

    field :rarities, non_null(list_of(non_null(:string))) do
      resolve(fn rule, _args, _resolution -> {:ok, AutoSortRule.list_field(rule, :rarities)} end)
    end

    field :min_price_cents, :integer
    field :max_price_cents, :integer
  end

  object :collection_auto_sort_move do
    field :collection_item_id, non_null(:id)
    field :card_name, non_null(:string)
    field :card_id, :id
    field :image_url, :string
    field :quantity, non_null(:integer)
    field :finish, non_null(:string)
    field :from_location_id, :id
    field :from_location_name, non_null(:string)
    field :to_location_id, non_null(:id)
    field :to_location_name, non_null(:string)
  end

  object :collection_auto_sort_result do
    field :checked_count, non_null(:integer)
    field :moved_count, non_null(:integer)
    field :skipped_count, non_null(:integer)
    field :dry_run, non_null(:boolean)
    field :moves, non_null(list_of(non_null(:collection_auto_sort_move)))
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
    field :auto_sorted, non_null(:integer)
  end

  input_object :collection_item_filters do
    field :q, :string
    field :condition, :string
    field :language, :string
    field :finish, :string
    field :location_id, :id
    field :card_id, :id
    field :unallocated_only, :boolean
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
    field :purchase_price_cents, :integer
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
    field :auto_sort, :boolean
  end

  input_object :collection_auto_sort_rule_input do
    field :id, :id
    field :name, non_null(:string)
    field :enabled, non_null(:boolean)
    field :priority, non_null(:integer)
    field :target_location_id, non_null(:id)
    field :color_mode, non_null(:string)
    field :colors, non_null(list_of(non_null(:string)))
    field :type_line_includes, non_null(list_of(non_null(:string)))
    field :type_line_excludes, non_null(list_of(non_null(:string)))
    field :rarities, non_null(list_of(non_null(:string)))
    field :min_price_cents, :integer
    field :max_price_cents, :integer
  end

  input_object :auto_sort_collection_input do
    field :source_location_id, :id
    field :dry_run, :boolean
    field :rules, list_of(non_null(:collection_auto_sort_rule_input))
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
