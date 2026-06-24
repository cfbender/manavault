defmodule ManavaultWeb.Schema.Catalog.DeckTypes do
  @moduledoc false

  use Absinthe.Schema.Notation

  import Absinthe.Resolution.Helpers, only: [dataloader: 1]

  alias Manavault.Catalog

  alias ManavaultWeb.Schema.CatalogResolvers

  object :deck_legality do
    field :status, non_null(:string) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :issues, non_null(list_of(non_null(:deck_legality_issue))) do
      resolve(&CatalogResolvers.map_value/3)
    end
  end

  object :deck_legality_issue do
    field :code, non_null(:string) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :message, non_null(:string) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :severity, non_null(:string) do
      resolve(&CatalogResolvers.map_value/3)
    end

    field :card_name, :string do
      resolve(&CatalogResolvers.map_value/3)
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

    field :legality, non_null(:deck_legality) do
      resolve(&CatalogResolvers.deck_legality/3)
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
    field :tag, :string
    field :preferred_printing, :printing, resolve: dataloader(Catalog)
    field :card, :card, resolve: dataloader(Catalog)

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
    field :tag, :string
  end

  input_object :deck_card_update_input do
    field :zone, :string
    field :quantity, :integer
    field :finish, :string
    field :preferred_printing_id, :id
    field :tag, :string
  end
end
