defmodule ManavaultWeb.Schema.CatalogTypes do
  use Absinthe.Schema.Notation

  alias ManavaultWeb.Schema.CatalogResolvers

  object :scryfall_reload_result do
    field :status, non_null(:string)
    field :message, non_null(:string)
  end

  object :card do
    field :oracle_id, non_null(:id)
    field :name, non_null(:string)
    field :type_line, :string
    field :oracle_text, :string
    field :mana_cost, :string
    field :cmc, :float

    field :colors, list_of(:string) do
      resolve(fn card, _, _ ->
        {:ok, CatalogResolvers.decode_json_field(card, :colors, [])}
      end)
    end

    field :color_identity, list_of(:string) do
      resolve(fn card, _, _ ->
        {:ok, CatalogResolvers.decode_json_field(card, :color_identity, [])}
      end)
    end

    field :printings, list_of(:printing)
  end

  object :printing do
    field :scryfall_id, non_null(:id)
    field :oracle_id, non_null(:id)
    field :set_code, :string
    field :set_name, :string
    field :collector_number, :string
    field :lang, :string
    field :rarity, :string

    field :owned_count, non_null(:integer)

    field :finishes, list_of(:string) do
      resolve(fn printing, _, _ ->
        {:ok, CatalogResolvers.decode_json_field(printing, :finishes, [])}
      end)
    end

    field :image_url, :string do
      resolve(&CatalogResolvers.printing_image_url/3)
    end

    field :art_crop_url, :string do
      resolve(&CatalogResolvers.printing_art_crop_url/3)
    end

    field :image_uris, :json do
      resolve(fn printing, _, _ ->
        {:ok, CatalogResolvers.decode_json_field(printing, :image_uris, %{})}
      end)
    end

    field :prices, :json do
      resolve(fn printing, _, _ ->
        {:ok, CatalogResolvers.decode_json_field(printing, :prices, %{})}
      end)
    end

    field :price_text, :string do
      resolve(&CatalogResolvers.printing_price_text/3)
    end

    field :released_at, :string
    field :card, :card
  end

  object :collection_item do
    field :id, non_null(:id)
    field :quantity, non_null(:integer)
    field :condition, non_null(:string)
    field :language, non_null(:string)
    field :finish, non_null(:string)
    field :notes, :string
    field :printing, :printing

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

    field :location, :location do
      resolve(&CatalogResolvers.collection_item_location/3)
    end
  end

  object :location do
    field :id, non_null(:id)
    field :name, non_null(:string)
    field :kind, non_null(:string)
    field :description, :string
    field :cover_printing, :printing

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

  object :deck do
    field :id, non_null(:id)
    field :name, non_null(:string)
    field :format, non_null(:string)
    field :status, non_null(:string)
    field :share_token, :string

    field :cover_image_url, :string do
      resolve(&CatalogResolvers.deck_cover_image_url/3)
    end

    field :commander_color_identity, list_of(:string) do
      resolve(&CatalogResolvers.deck_commander_color_identity/3)
    end

    field :card_count, :integer do
      resolve(&CatalogResolvers.deck_card_count/3)
    end

    field :unique_card_count, :integer do
      resolve(&CatalogResolvers.deck_unique_card_count/3)
    end

    field :deck_cards, list_of(:deck_card) do
      resolve(&CatalogResolvers.deck_cards/3)
    end
  end

  object :deck_card do
    field :id, non_null(:id)
    field :quantity, non_null(:integer)
    field :zone, :string
    field :finish, :string
    field :preferred_printing, :printing
    field :card, :card

    field :allocation_status, non_null(:deck_card_allocation_status) do
      resolve(&CatalogResolvers.deck_card_allocation_status/3)
    end
  end

  object :deck_card_allocation_status do
    field :state, non_null(:string)
    field :required, non_null(:integer)
    field :owned, non_null(:integer)
    field :allocated, non_null(:integer)
    field :proxy_allocated, non_null(:integer)
    field :available, non_null(:integer)
    field :allocated_elsewhere, non_null(:integer)
    field :missing, non_null(:integer)
    field :candidates, non_null(list_of(non_null(:deck_card_allocation_candidate)))
  end

  object :deck_card_allocation_candidate do
    field :item, non_null(:collection_item)
    field :allocated, non_null(:integer)
    field :allocated_elsewhere, non_null(:integer)
    field :available, non_null(:integer)
  end

  object :deck_bulk_allocation_preview do
    field :mode, non_null(:string)
    field :allocated, non_null(:integer)
    field :cards, non_null(:integer)
    field :skipped, non_null(:integer)
    field :entries, non_null(list_of(non_null(:deck_bulk_allocation_entry)))
  end

  object :deck_bulk_allocation_entry do
    field :deck_card, non_null(:deck_card)
    field :item, non_null(:collection_item)
    field :quantity, non_null(:integer)

    field :exact, non_null(:boolean) do
      resolve(&CatalogResolvers.map_exact_value/3)
    end
  end

  object :deck_bulk_allocation_result do
    field :allocated, non_null(:integer)
    field :cards, non_null(:integer)
    field :skipped, non_null(:integer)
  end

  object :deck_import_result do
    field :imported, non_null(:integer)
    field :unresolved, non_null(list_of(non_null(:string)))
    field :skipped_printings, non_null(list_of(non_null(:string)))
  end

  object :deck_buylist_entry do
    field :card_name, non_null(:string) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :quantity, non_null(:integer) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :missing, non_null(:integer) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :unavailable, non_null(:integer) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :reason, non_null(:string) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :finish, :string do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :printing, :printing do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :set_code, :string do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :collector_number, :string do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :language, :string do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :unit_price_cents, :integer do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :total_price_cents, :integer do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :unit_price_text, :string do
      resolve(&CatalogResolvers.buylist_entry_unit_price_text/3)
    end

    field :total_price_text, :string do
      resolve(&CatalogResolvers.buylist_entry_total_price_text/3)
    end
  end

  object :deck_edhrec do
    field :commander_names, non_null(list_of(non_null(:string)))
    field :recommendations, non_null(list_of(non_null(:deck_edhrec_card)))
    field :cuts, non_null(list_of(non_null(:deck_edhrec_card)))
    field :commander_pages, non_null(list_of(non_null(:edhrec_commander_page)))
    field :more, non_null(:boolean)
  end

  object :deck_edhrec_card do
    field :name, non_null(:string)
    field :oracle_id, :id
    field :primary_type, :string
    field :score, :float
    field :salt, :float
    field :edhrec_url, :string
    field :card, :card
    field :collection_status, non_null(:deck_card_allocation_status)
  end

  object :edhrec_commander_page do
    field :name, non_null(:string)
    field :title, non_null(:string)
    field :description, :string
    field :url, non_null(:string)
    field :rank, :integer
    field :deck_count, :integer
    field :salt, :float
    field :avg_price, :float
    field :color_identity, non_null(list_of(non_null(:string)))
    field :similar, non_null(list_of(non_null(:string)))
    field :themes, non_null(list_of(non_null(:edhrec_theme)))
    field :stats, non_null(list_of(non_null(:edhrec_stat)))
    field :sections, non_null(list_of(non_null(:edhrec_card_section)))
  end

  object :edhrec_theme do
    field :name, non_null(:string)
    field :slug, :string
    field :count, :integer
  end

  object :edhrec_stat do
    field :label, non_null(:string)
    field :value, non_null(:string)
  end

  object :edhrec_card_section do
    field :header, non_null(:string)
    field :tag, :string
    field :cards, non_null(list_of(non_null(:edhrec_section_card)))
  end

  object :edhrec_section_card do
    field :name, non_null(:string)
    field :oracle_id, :id
    field :synergy, :float
    field :inclusion, :integer
    field :num_decks, :integer
    field :potential_decks, :integer
    field :url, :string
    field :card, :card
    field :collection_status, non_null(:deck_card_allocation_status)
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

  scalar :json do
    parse(fn
      %{value: value}, _ -> {:ok, value}
      _, _ -> :error
    end)

    serialize(& &1)
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

  input_object :deck_input do
    field :name, non_null(:string)
    field :format, :string
    field :status, :string
  end

  input_object :deck_update_input do
    field :name, :string
    field :format, :string
    field :status, :string
  end

  input_object :deck_card_input do
    field :name, non_null(:string)
    field :quantity, :integer
    field :zone, :string
    field :finish, :string
    field :preferred_printing_id, :id
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

  input_object :deck_card_update_input do
    field :zone, :string
    field :quantity, :integer
    field :finish, :string
    field :preferred_printing_id, :id
  end
end
