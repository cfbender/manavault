defmodule ManavaultWeb.Schema.CatalogTypes do
  use Absinthe.Schema.Notation

  alias ManavaultWeb.Schema.CatalogResolvers

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

    field :price_text, :string do
      resolve(&CatalogResolvers.collection_item_price_text/3)
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

    field :total_price_text, :string do
      resolve(&CatalogResolvers.location_total_price_text/3)
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

    field :card_count, :integer do
      resolve(&CatalogResolvers.deck_card_count/3)
    end

    field :unique_card_count, :integer do
      resolve(&CatalogResolvers.deck_unique_card_count/3)
    end

    field :deck_cards, list_of(:deck_card)
  end

  object :deck_card do
    field :id, non_null(:id)
    field :quantity, non_null(:integer)
    field :zone, :string
    field :finish, :string
    field :preferred_printing, :printing
    field :card, :card
  end

  object :scan_session do
    field :id, non_null(:id)
    field :name, non_null(:string)
    field :default_condition, non_null(:string)
    field :default_language, non_null(:string)
    field :default_finish, non_null(:string)

    field :item_count, :integer do
      resolve(&CatalogResolvers.scan_item_count/3)
    end

    field :review_count, :integer do
      resolve(&CatalogResolvers.scan_review_count/3)
    end

    field :created_at, :string
  end

  object :home_summary do
    field :collection_count, non_null(:integer)
    field :location_count, non_null(:integer)
    field :deck_count, non_null(:integer)
    field :scan_session_count, non_null(:integer)
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

  input_object :location_update_input do
    field :name, :string
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
