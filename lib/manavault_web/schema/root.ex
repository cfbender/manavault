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
      arg(:sort, :collection_item_sort)
      arg(:limit, :integer, default_value: 100)
      arg(:offset, :integer, default_value: 0)
      resolve(&CatalogResolvers.collection_items/3)
    end

    field :collection_item_count, non_null(:integer) do
      arg(:filters, :collection_item_filters)
      resolve(&CatalogResolvers.collection_item_count/3)
    end

    field :collection_export_csv, non_null(:string) do
      arg(:filters, :collection_item_filters)
      resolve(&CatalogResolvers.collection_export_csv/3)
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

    field :shared_deck, :deck do
      arg(:token, non_null(:string))
      resolve(&CatalogResolvers.shared_deck/3)
    end

    field :deck_export_text, non_null(:string) do
      arg(:id, non_null(:id))
      resolve(&CatalogResolvers.deck_export_text/3)
    end

    field :deck_buylist, non_null(list_of(non_null(:deck_buylist_entry))) do
      arg(:id, non_null(:id))
      arg(:printing_mode, :string, default_value: "none")
      arg(:include_basic_lands, :boolean, default_value: false)
      resolve(&CatalogResolvers.deck_buylist/3)
    end

    field :deck_buylist_export, non_null(:string) do
      arg(:id, non_null(:id))
      arg(:format, :string, default_value: "text")
      arg(:printing_mode, :string, default_value: "none")
      arg(:include_basic_lands, :boolean, default_value: false)
      resolve(&CatalogResolvers.deck_buylist_export/3)
    end

    field :deck_edhrec, non_null(:deck_edhrec) do
      arg(:id, non_null(:id))
      arg(:exclude_lands, :boolean, default_value: false)
      arg(:offset, :integer, default_value: 0)
      resolve(&CatalogResolvers.deck_edhrec/3)
    end

    field :scan_sessions, non_null(list_of(non_null(:scan_session))) do
      resolve(&CatalogResolvers.scan_sessions/3)
    end

    field :scan_session, :scan_session do
      arg(:id, non_null(:id))
      resolve(&CatalogResolvers.scan_session/3)
    end

    field :scan_printings, non_null(list_of(non_null(:printing))) do
      arg(:q, :string, default_value: "")
      arg(:limit, :integer, default_value: 36)
      resolve(&CatalogResolvers.scan_printings/3)
    end

    field :scan_sets, non_null(list_of(non_null(:scan_set_option))) do
      arg(:q, :string, default_value: "")
      resolve(&CatalogResolvers.scan_sets/3)
    end
  end

  mutation do
    field :create_scan_session, :scan_session do
      arg(:input, non_null(:scan_session_input))
      resolve(&CatalogResolvers.create_scan_session/3)
    end

    field :delete_scan_session, :scan_session do
      arg(:id, non_null(:id))
      resolve(&CatalogResolvers.delete_scan_session/3)
    end

    field :capture_scan_item, :scan_capture_result do
      arg(:scan_session_id, non_null(:id))
      arg(:image_data, non_null(:string))
      arg(:force, :boolean, default_value: false)
      arg(:last_oracle_id, :id)
      arg(:prefer_foil, :boolean, default_value: false)
      arg(:set_codes, list_of(non_null(:string)), default_value: [])
      resolve(&CatalogResolvers.capture_scan_item/3)
    end

    field :update_scan_item, :scan_item do
      arg(:id, non_null(:id))
      arg(:input, non_null(:scan_item_update_input))
      resolve(&CatalogResolvers.update_scan_item/3)
    end

    field :delete_scan_item, :scan_item do
      arg(:id, non_null(:id))
      resolve(&CatalogResolvers.delete_scan_item/3)
    end

    field :set_scan_item_printing, :scan_item do
      arg(:id, non_null(:id))
      arg(:scryfall_id, non_null(:id))
      resolve(&CatalogResolvers.set_scan_item_printing/3)
    end

    field :move_scan_session_items, :scan_bulk_move_result do
      arg(:id, non_null(:id))
      arg(:location_id, :id)
      resolve(&CatalogResolvers.move_scan_session_items/3)
    end

    field :create_collection_item, :collection_item do
      arg(:input, non_null(:collection_item_input))
      resolve(&CatalogResolvers.create_collection_item/3)
    end

    field :update_collection_item, :collection_item do
      arg(:id, non_null(:id))
      arg(:input, non_null(:collection_item_update_input))
      resolve(&CatalogResolvers.update_collection_item/3)
    end

    field :delete_collection_item, :collection_item do
      arg(:id, non_null(:id))
      resolve(&CatalogResolvers.delete_collection_item/3)
    end

    field :add_collection_item_to_deck, :deck_card do
      arg(:id, non_null(:id))
      arg(:deck_id, non_null(:id))
      arg(:zone, :string, default_value: "mainboard")
      resolve(&CatalogResolvers.add_collection_item_to_deck/3)
    end

    field :create_deck, :deck do
      arg(:input, non_null(:deck_input))
      resolve(&CatalogResolvers.create_deck/3)
    end

    field :create_location, :location do
      arg(:input, non_null(:location_input))
      resolve(&CatalogResolvers.create_location/3)
    end

    field :preview_collection_import, :collection_import_preview do
      arg(:input, non_null(:collection_import_preview_input))
      resolve(&CatalogResolvers.preview_collection_import/3)
    end

    field :commit_collection_import, :collection_import_result do
      arg(:input, non_null(:collection_import_commit_input))
      resolve(&CatalogResolvers.commit_collection_import/3)
    end

    field :update_deck, :deck do
      arg(:id, non_null(:id))
      arg(:input, non_null(:deck_update_input))
      resolve(&CatalogResolvers.update_deck/3)
    end

    field :ensure_deck_share_token, :deck do
      arg(:id, non_null(:id))
      resolve(&CatalogResolvers.ensure_deck_share_token/3)
    end

    field :add_deck_card, :deck_card do
      arg(:deck_id, non_null(:id))
      arg(:input, non_null(:deck_card_input))
      resolve(&CatalogResolvers.add_deck_card/3)
    end

    field :import_decklist, :deck_import_result do
      arg(:id, non_null(:id))
      arg(:text, non_null(:string))
      resolve(&CatalogResolvers.import_decklist/3)
    end

    field :update_location, :location do
      arg(:id, non_null(:id))
      arg(:input, non_null(:location_update_input))
      resolve(&CatalogResolvers.update_location/3)
    end

    field :update_deck_card, :deck_card do
      arg(:id, non_null(:id))
      arg(:input, non_null(:deck_card_update_input))
      resolve(&CatalogResolvers.update_deck_card/3)
    end

    field :delete_deck_card, :deck_card do
      arg(:id, non_null(:id))
      resolve(&CatalogResolvers.delete_deck_card/3)
    end

    field :set_deck_commander, :deck_card do
      arg(:id, non_null(:id))
      resolve(&CatalogResolvers.set_deck_commander/3)
    end

    field :allocate_deck_card_item, :deck_card do
      arg(:deck_card_id, non_null(:id))
      arg(:collection_item_id, non_null(:id))
      resolve(&CatalogResolvers.allocate_deck_card_item/3)
    end

    field :deallocate_deck_card_item, :deck_card do
      arg(:deck_card_id, non_null(:id))
      arg(:collection_item_id, non_null(:id))
      resolve(&CatalogResolvers.deallocate_deck_card_item/3)
    end

    field :allocate_deck_card_proxy, :deck_card do
      arg(:deck_card_id, non_null(:id))
      arg(:quantity, :integer, default_value: 1)
      resolve(&CatalogResolvers.allocate_deck_card_proxy/3)
    end

    field :deallocate_deck_card_proxy, :deck_card do
      arg(:deck_card_id, non_null(:id))
      arg(:quantity, :integer, default_value: 1)
      resolve(&CatalogResolvers.deallocate_deck_card_proxy/3)
    end

    field :preview_bulk_allocate_deck, :deck_bulk_allocation_preview do
      arg(:id, non_null(:id))
      arg(:mode, non_null(:string))
      resolve(&CatalogResolvers.preview_bulk_allocate_deck/3)
    end

    field :bulk_allocate_deck, :deck_bulk_allocation_result do
      arg(:id, non_null(:id))
      arg(:mode, non_null(:string))
      resolve(&CatalogResolvers.bulk_allocate_deck/3)
    end
  end
end
