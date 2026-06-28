defmodule ManavaultWeb.Schema.CatalogResolvers do
  @moduledoc false

  alias ManavaultWeb.Schema.Catalog.{
    CardFields,
    CollectionFields,
    DeckFields,
    ImportResolvers,
    MutationResolvers,
    QueryResolvers,
    ValueResolvers
  }

  defdelegate node(args, resolution), to: QueryResolvers
  defdelegate home_summary(parent, args, resolution), to: QueryResolvers
  defdelegate cards(parent, args, resolution), to: QueryResolvers
  defdelegate card_name_suggestions(parent, args, resolution), to: QueryResolvers
  defdelegate set_suggestions(parent, args, resolution), to: QueryResolvers
  defdelegate card(parent, args, resolution), to: QueryResolvers
  defdelegate reload_scryfall_catalog(parent, args, resolution), to: QueryResolvers
  defdelegate reload_scryfall_assets(parent, args, resolution), to: QueryResolvers
  defdelegate collection_items(parent, args, resolution), to: QueryResolvers
  defdelegate collection_item_count(parent, args, resolution), to: QueryResolvers
  defdelegate collection_value_summary(parent, args, resolution), to: QueryResolvers
  defdelegate collection_export_csv(parent, args, resolution), to: QueryResolvers
  defdelegate collection_export_text(parent, args, resolution), to: QueryResolvers
  defdelegate locations(parent, args, resolution), to: QueryResolvers
  defdelegate collection_auto_sort_rules(parent, args, resolution), to: QueryResolvers
  defdelegate location(parent, args, resolution), to: QueryResolvers
  defdelegate decks(parent, args, resolution), to: QueryResolvers
  defdelegate deck(parent, args, resolution), to: QueryResolvers
  defdelegate shared_deck(parent, args, resolution), to: QueryResolvers
  defdelegate deck_export_text(parent, args, resolution), to: QueryResolvers
  defdelegate deck_buylist(parent, args, resolution), to: QueryResolvers
  defdelegate deck_buylist_export(parent, args, resolution), to: QueryResolvers
  defdelegate deck_edhrec(parent, args, resolution), to: QueryResolvers

  defdelegate create_deck(parent, args, resolution), to: MutationResolvers
  defdelegate create_collection_item(parent, args, resolution), to: MutationResolvers
  defdelegate update_collection_item(parent, args, resolution), to: MutationResolvers
  defdelegate bulk_update_collection_items(parent, args, resolution), to: MutationResolvers
  defdelegate delete_collection_item(parent, args, resolution), to: MutationResolvers
  defdelegate add_collection_item_to_deck(parent, args, resolution), to: MutationResolvers
  defdelegate bulk_add_collection_items_to_deck(parent, args, resolution), to: MutationResolvers
  defdelegate create_location(parent, args, resolution), to: MutationResolvers
  defdelegate update_deck(parent, args, resolution), to: MutationResolvers
  defdelegate ensure_deck_share_token(parent, args, resolution), to: MutationResolvers
  defdelegate add_deck_card(parent, args, resolution), to: MutationResolvers
  defdelegate import_decklist(parent, args, resolution), to: MutationResolvers
  defdelegate delete_deck(parent, args, resolution), to: MutationResolvers
  defdelegate preview_deck_disassembly(parent, args, resolution), to: MutationResolvers
  defdelegate disassemble_deck(parent, args, resolution), to: MutationResolvers
  defdelegate delete_location(parent, args, resolution), to: MutationResolvers
  defdelegate update_location(parent, args, resolution), to: MutationResolvers
  defdelegate update_collection_auto_sort_rules(parent, args, resolution), to: MutationResolvers
  defdelegate auto_sort_collection(parent, args, resolution), to: MutationResolvers
  defdelegate update_deck_card(parent, args, resolution), to: MutationResolvers
  defdelegate update_deck_cards_tag(parent, args, resolution), to: MutationResolvers
  defdelegate optimize_deck_card_printings(parent, args, resolution), to: MutationResolvers
  defdelegate delete_deck_card(parent, args, resolution), to: MutationResolvers
  defdelegate set_deck_commander(parent, args, resolution), to: MutationResolvers
  defdelegate allocate_deck_card_item(parent, args, resolution), to: MutationResolvers
  defdelegate deallocate_deck_card_item(parent, args, resolution), to: MutationResolvers
  defdelegate allocate_deck_card_proxy(parent, args, resolution), to: MutationResolvers
  defdelegate deallocate_deck_card_proxy(parent, args, resolution), to: MutationResolvers
  defdelegate preview_bulk_allocate_deck(parent, args, resolution), to: MutationResolvers
  defdelegate bulk_allocate_deck(parent, args, resolution), to: MutationResolvers

  defdelegate preview_collection_import(parent, args, resolution), to: ImportResolvers
  defdelegate commit_collection_import(parent, args, resolution), to: ImportResolvers
  defdelegate preview_collection_import_auto_sort(parent, args, resolution), to: ImportResolvers

  defdelegate card_rulings(parent, args, resolution), to: CardFields
  defdelegate card_legalities(parent, args, resolution), to: CardFields
  defdelegate card_printings(parent, args, resolution), to: CardFields
  defdelegate printing_card(parent, args, resolution), to: CardFields
  defdelegate printing_image_url(parent, args, resolution), to: CardFields
  defdelegate printing_back_image_url(parent, args, resolution), to: CardFields
  defdelegate printing_art_crop_url(parent, args, resolution), to: CardFields
  defdelegate printing_price_text(parent, args, resolution), to: CardFields

  defdelegate buylist_entry_unit_price_text(parent, args, resolution), to: DeckFields
  defdelegate buylist_entry_total_price_text(parent, args, resolution), to: DeckFields
  defdelegate deck_card_price_cents(parent, args, resolution), to: DeckFields
  defdelegate deck_cards(parent, args, resolution), to: DeckFields
  defdelegate deck_card_count(parent, args, resolution), to: DeckFields
  defdelegate deck_unique_card_count(parent, args, resolution), to: DeckFields
  defdelegate deck_cover_image_url(parent, args, resolution), to: DeckFields
  defdelegate deck_commander_color_identity(parent, args, resolution), to: DeckFields
  defdelegate deck_legality(parent, args, resolution), to: DeckFields
  defdelegate deck_card_allocation_status(parent, args, resolution), to: DeckFields

  defdelegate location_item_count(parent, args, resolution), to: CollectionFields
  defdelegate location_total_price_cents(parent, args, resolution), to: CollectionFields
  defdelegate location_total_price_text(parent, args, resolution), to: CollectionFields
  defdelegate location_purchase_price_cents(parent, args, resolution), to: CollectionFields
  defdelegate location_purchase_price_text(parent, args, resolution), to: CollectionFields
  defdelegate location_value_gain_cents(parent, args, resolution), to: CollectionFields
  defdelegate location_value_gain_text(parent, args, resolution), to: CollectionFields
  defdelegate location_value_gain_percent(parent, args, resolution), to: CollectionFields
  defdelegate location_value_gain_percent_text(parent, args, resolution), to: CollectionFields
  defdelegate location_value_summary(parent, args, resolution), to: CollectionFields
  defdelegate location_collection_items(parent, args, resolution), to: CollectionFields
  defdelegate collection_item_printing(parent, args, resolution), to: CollectionFields
  defdelegate collection_item_location(parent, args, resolution), to: CollectionFields
  defdelegate collection_item_current_price_cents(parent, args, resolution), to: CollectionFields
  defdelegate collection_item_purchase_price_cents(parent, args, resolution), to: CollectionFields
  defdelegate collection_item_price_text(parent, args, resolution), to: CollectionFields
  defdelegate collection_item_purchase_price_text(parent, args, resolution), to: CollectionFields
  defdelegate collection_item_value_gain_cents(parent, args, resolution), to: CollectionFields
  defdelegate collection_item_value_gain_text(parent, args, resolution), to: CollectionFields
  defdelegate collection_item_value_gain_percent(parent, args, resolution), to: CollectionFields

  defdelegate collection_item_value_gain_percent_text(parent, args, resolution),
    to: CollectionFields

  defdelegate collection_item_allocated_quantity(parent, args, resolution), to: CollectionFields

  defdelegate collection_item_total_owned_copies(parent, args, resolution), to: CollectionFields

  defdelegate collection_item_allocation_decks(parent, args, resolution), to: CollectionFields

  defdelegate decode_json_field(parent, key, fallback), to: ValueResolvers
  defdelegate map_value(parent, args, resolution), to: ValueResolvers
  defdelegate map_exact_value(parent, args, resolution), to: ValueResolvers
end
