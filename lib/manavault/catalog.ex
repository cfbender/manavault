defmodule Manavault.Catalog do
  @moduledoc """
  Public catalog context API.
  """

  alias Manavault.Catalog.{
    Cached,
    Collection,
    Dataloader,
    Decks,
    Scryfall,
    ScryfallSyncWorker,
    Search
  }

  defdelegate data(), to: Dataloader

  defdelegate search_cards(term, opts \\ []), to: Cached
  defdelegate suggest_card_names(term, opts \\ []), to: Search
  defdelegate get_printing_by_scryfall_id(scryfall_id), to: Cached
  defdelegate get_printing(set_code, collector_number), to: Cached
  defdelegate get_card_with_printings(oracle_id), to: Cached
  defdelegate search_printings(filters, opts \\ []), to: Cached
  defdelegate search_sets(term, opts \\ []), to: Cached

  defdelegate list_collection_items(filters \\ [], opts \\ []), to: Cached
  defdelegate list_collection_item_ids(filters \\ []), to: Cached
  defdelegate count_collection_items(filters \\ []), to: Cached
  defdelegate count_collection_item_entries(filters \\ []), to: Cached
  defdelegate collection_value_summary(filters \\ []), to: Cached
  defdelegate get_collection_item!(id), to: Cached
  defdelegate change_collection_item(collection_item, attrs \\ %{}), to: Collection
  defdelegate new_collection_item_for_printing(scryfall_id), to: Collection
  defdelegate create_collection_item(attrs), to: Cached
  defdelegate update_collection_item(collection_item, attrs), to: Cached
  defdelegate update_collection_items(ids, attrs), to: Cached
  defdelegate list_printings_for_collection_item(collection_item), to: Cached
  defdelegate switch_collection_item_printing(collection_item, scryfall_id), to: Cached
  defdelegate delete_collection_item(collection_item), to: Cached
  defdelegate delete_collection_items(ids), to: Cached

  defdelegate list_locations(opts \\ []), to: Cached
  defdelegate count_locations(), to: Cached
  defdelegate location_summaries(), to: Cached
  defdelegate list_location_summaries(summaries \\ nil), to: Cached
  defdelegate get_location_summary!(id), to: Cached
  defdelegate unfiled_location_summary(summaries \\ nil), to: Cached
  defdelegate list_location_options(), to: Cached
  defdelegate get_location!(id), to: Cached
  defdelegate get_location_with_items!(id), to: Cached

  defdelegate list_collection_items_by_location(location_id, filters \\ [], opts \\ []),
    to: Cached

  defdelegate change_location(location, attrs \\ %{}), to: Collection
  defdelegate create_location(attrs \\ %{}), to: Cached
  defdelegate update_location(location, attrs), to: Cached
  defdelegate list_collection_auto_sort_rules(), to: Cached
  defdelegate update_collection_auto_sort_rules(inputs), to: Cached
  defdelegate auto_sort_collection(opts \\ []), to: Cached
  defdelegate delete_location(location), to: Cached
  defdelegate add_printing_to_collection(scryfall_id, attrs \\ %{}), to: Cached
  defdelegate preview_collection_import(text, opts \\ []), to: Collection
  defdelegate import_collection(text, opts \\ []), to: Cached
  defdelegate import_collection_preview(preview, opts \\ []), to: Cached
  defdelegate preview_collection_import_auto_sort(preview, opts \\ []), to: Collection
  defdelegate export_collection_csv(filters \\ []), to: Cached
  defdelegate export_collection_text(filters \\ []), to: Cached

  defdelegate list_decks(), to: Decks
  defdelegate list_deck_summaries(), to: Decks
  defdelegate list_deck_summaries(opts), to: Decks
  defdelegate count_decks(), to: Decks
  defdelegate get_deck!(id, opts \\ []), to: Decks
  defdelegate get_deck_card!(id), to: Decks
  defdelegate get_deck_by_share_token(token, opts \\ []), to: Decks
  defdelegate deck_cards(deck), to: Decks
  defdelegate fetch_cached_deck_cards(deck), to: Decks
  defdelegate put_cached_deck_cards(deck, deck_cards), to: Decks
  defdelegate deck_legality(deck), to: Decks
  defdelegate deck_card_count(deck), to: Decks
  defdelegate deck_unique_card_count(deck), to: Decks
  defdelegate deck_commander_color_identity(deck), to: Decks
  defdelegate deck_cover_image_url(deck), to: Decks
  defdelegate change_deck(deck, attrs \\ %{}), to: Decks
  defdelegate create_deck(attrs), to: Decks
  defdelegate update_deck(deck, attrs), to: Decks
  defdelegate ensure_deck_share_token(deck), to: Decks
  defdelegate delete_deck(deck), to: Decks
  defdelegate preview_deck_disassembly(deck), to: Decks
  defdelegate disassemble_deck(deck), to: Decks
  defdelegate deck_reserves_cards?(deck_or_status), to: Decks
  defdelegate change_deck_card(deck_card, attrs \\ %{}), to: Decks
  defdelegate add_card_to_deck(deck, attrs), to: Decks
  defdelegate update_deck_card(deck_card, attrs), to: Decks
  defdelegate update_deck_cards_tag(deck_card_ids, tag), to: Decks
  defdelegate bulk_update_deck_cards(deck_card_ids, attrs), to: Decks
  defdelegate bulk_delete_deck_cards(deck_card_ids), to: Decks
  defdelegate optimize_deck_card_printings(deck_card_ids), to: Decks
  defdelegate set_deck_commander(deck_card), to: Decks
  defdelegate delete_deck_card(deck_card), to: Decks
  defdelegate deck_allocation_status(deck), to: Decks
  defdelegate deck_card_allocation_status(deck_card), to: Decks
  defdelegate put_deck_card_allocation_statuses(deck_cards), to: Decks
  defdelegate put_deck_card_fallback_printings(deck_cards), to: Decks

  defdelegate list_deck_tags(deck), to: Decks
  defdelegate create_deck_tag(deck, attrs), to: Decks
  defdelegate update_deck_tag(deck_tag, attrs), to: Decks
  defdelegate delete_deck_tag(deck_tag), to: Decks
  defdelegate reorder_deck_tags(deck, ordered_tag_ids), to: Decks
  defdelegate assign_deck_card_tag(deck_card_id, deck_tag_id), to: Decks
  defdelegate unassign_deck_card_tag(deck_card_id, deck_tag_id), to: Decks
  defdelegate put_deck_card_tag_ids(deck_cards), to: Decks

  defdelegate list_default_deck_tags(), to: Decks
  defdelegate replace_default_deck_tags(entries), to: Decks

  defdelegate allocate_collection_item_to_deck_card(
                deck_card_id,
                collection_item_id,
                quantity \\ 1
              ),
              to: Decks

  defdelegate bulk_add_collection_items_to_deck(
                deck_or_id,
                collection_item_ids,
                zone \\ "mainboard"
              ),
              to: Decks

  defdelegate deallocate_collection_item_from_deck_card(
                deck_card_id,
                collection_item_id,
                quantity \\ 1
              ),
              to: Decks

  defdelegate bulk_deallocate_deck_cards(deck_card_ids), to: Decks

  defdelegate allocate_proxy_to_deck_card(deck_card_id, quantity \\ 1), to: Decks
  defdelegate deallocate_proxy_from_deck_card(deck_card_id, quantity \\ 1), to: Decks
  defdelegate bulk_allocate_deck(deck, mode), to: Decks
  defdelegate preview_bulk_allocate_deck(deck, mode), to: Decks
  defdelegate allocate_deck_pull_list(deck_or_id, entries), to: Decks
  defdelegate import_decklist(deck, text, opts \\ []), to: Decks
  defdelegate export_decklist(deck), to: Decks
  defdelegate deck_buylist(deck, opts \\ []), to: Decks
  defdelegate deck_edhrec(deck, opts \\ []), to: Decks
  defdelegate export_deck_buylist(deck, format, opts \\ []), to: Decks
  defdelegate deck_stats(deck), to: Decks

  defdelegate latest_sync(), to: Scryfall
  defdelegate sync_scryfall(opts \\ []), to: Cached

  defdelegate reload_scryfall_catalog_async(opts \\ []),
    to: ScryfallSyncWorker,
    as: :reload_catalog_async

  defdelegate reload_scryfall_assets_async(opts \\ []),
    to: ScryfallSyncWorker,
    as: :reload_assets_async

  defdelegate import_cards(cards, bulk_uri \\ nil, opts \\ []), to: Cached
  defdelegate card_rulings(card, opts \\ []), to: Cached
end
