defmodule Manavault.Catalog do
  @moduledoc """
  Public catalog context API.
  """

  alias Manavault.Catalog.{Collection, Decks, Scans, Scryfall, Search}

  defdelegate search_cards(term, opts \\ []), to: Search
  defdelegate suggest_card_names(term, opts \\ []), to: Search
  defdelegate get_printing_by_scryfall_id(scryfall_id), to: Search
  defdelegate get_printing(set_code, collector_number), to: Search
  defdelegate get_card_with_printings(oracle_id), to: Search
  defdelegate search_printings(filters, opts \\ []), to: Search
  defdelegate search_sets(term, opts \\ []), to: Search

  defdelegate list_collection_items(filters \\ [], opts \\ []), to: Collection
  defdelegate count_collection_items(filters \\ []), to: Collection
  defdelegate get_collection_item!(id), to: Collection
  defdelegate change_collection_item(collection_item, attrs \\ %{}), to: Collection
  defdelegate new_collection_item_for_printing(scryfall_id), to: Collection
  defdelegate create_collection_item(attrs), to: Collection
  defdelegate update_collection_item(collection_item, attrs), to: Collection
  defdelegate list_printings_for_collection_item(collection_item), to: Collection
  defdelegate list_printings_for_scan_item(scan_item), to: Collection
  defdelegate switch_collection_item_printing(collection_item, scryfall_id), to: Collection
  defdelegate delete_collection_item(collection_item), to: Collection

  defdelegate list_locations(opts \\ []), to: Collection
  defdelegate list_location_options(), to: Collection
  defdelegate get_location!(id), to: Collection
  defdelegate get_location_with_items!(id), to: Collection

  defdelegate list_collection_items_by_location(location_id, filters \\ [], opts \\ []),
    to: Collection

  defdelegate change_location(location, attrs \\ %{}), to: Collection
  defdelegate create_location(attrs \\ %{}), to: Collection
  defdelegate update_location(location, attrs), to: Collection
  defdelegate delete_location(location), to: Collection
  defdelegate add_printing_to_collection(scryfall_id, attrs \\ %{}), to: Collection
  defdelegate preview_collection_import_csv(text, opts \\ []), to: Collection
  defdelegate import_collection_csv(text, opts \\ []), to: Collection
  defdelegate import_collection_preview(preview), to: Collection
  defdelegate export_collection_csv(filters \\ []), to: Collection

  defdelegate list_decks(), to: Decks
  defdelegate get_deck!(id), to: Decks
  defdelegate get_deck_by_share_token(token), to: Decks
  defdelegate change_deck(deck, attrs \\ %{}), to: Decks
  defdelegate create_deck(attrs), to: Decks
  defdelegate update_deck(deck, attrs), to: Decks
  defdelegate ensure_deck_share_token(deck), to: Decks
  defdelegate delete_deck(deck), to: Decks
  defdelegate deck_reserves_cards?(deck_or_status), to: Decks
  defdelegate change_deck_card(deck_card, attrs \\ %{}), to: Decks
  defdelegate add_card_to_deck(deck, attrs), to: Decks
  defdelegate update_deck_card(deck_card, attrs), to: Decks
  defdelegate set_deck_commander(deck_card), to: Decks
  defdelegate delete_deck_card(deck_card), to: Decks
  defdelegate deck_allocation_status(deck), to: Decks
  defdelegate deck_card_allocation_status(deck_card), to: Decks

  defdelegate allocate_collection_item_to_deck_card(
                deck_card_id,
                collection_item_id,
                quantity \\ 1
              ),
              to: Decks

  defdelegate deallocate_collection_item_from_deck_card(
                deck_card_id,
                collection_item_id,
                quantity \\ 1
              ),
              to: Decks

  defdelegate allocate_proxy_to_deck_card(deck_card_id, quantity \\ 1), to: Decks
  defdelegate deallocate_proxy_from_deck_card(deck_card_id, quantity \\ 1), to: Decks
  defdelegate bulk_allocate_deck(deck, mode), to: Decks
  defdelegate preview_bulk_allocate_deck(deck, mode), to: Decks
  defdelegate import_decklist(deck, text), to: Decks
  defdelegate export_decklist(deck), to: Decks
  defdelegate deck_buylist(deck, opts \\ []), to: Decks
  defdelegate deck_edhrec(deck, opts \\ []), to: Decks
  defdelegate export_deck_buylist(deck, format, opts \\ []), to: Decks
  defdelegate deck_stats(deck), to: Decks

  defdelegate list_scan_sessions(), to: Scans
  defdelegate get_scan_session!(id), to: Scans
  defdelegate get_scan_session_for_capture!(id), to: Scans
  defdelegate get_scan_session_capture_summary!(id, opts \\ []), to: Scans
  defdelegate change_scan_session(scan_session, attrs \\ %{}), to: Scans
  defdelegate generated_scan_session_name(), to: Scans
  defdelegate create_scan_session(attrs), to: Scans
  defdelegate create_scan_item(scan_session, attrs \\ %{}), to: Scans
  defdelegate create_scan_item_from_capture(scan_session, image_data, opts \\ []), to: Scans

  defdelegate create_recognized_scan_item_from_capture(scan_session, image_data, opts \\ []),
    to: Scans

  defdelegate recognize_scan_item(scan_item, opts \\ []), to: Scans
  defdelegate refine_scan_item_printing_with_image(scan_item_id, opts \\ []), to: Scans
  defdelegate get_scan_item!(id), to: Scans
  defdelegate update_scan_item_review(scan_item, attrs), to: Scans
  defdelegate set_scan_item_printing(scan_item_id, scryfall_id), to: Scans
  defdelegate accept_scan_item(scan_item_id), to: Scans
  defdelegate accept_scan_item_printing(scan_item_id, scryfall_id), to: Scans
  defdelegate move_scan_session_items(scan_session, location_id), to: Scans
  defdelegate reject_scan_item(scan_item_id), to: Scans
  defdelegate undo_scan_item_accept(scan_item_id), to: Scans
  defdelegate scan_session_items_by_review_state(scan_session), to: Scans
  defdelegate delete_scan_item(scan_item), to: Scans
  defdelegate delete_scan_session(scan_session), to: Scans

  defdelegate latest_sync(), to: Scryfall
  defdelegate sync_scryfall(opts \\ []), to: Scryfall
  defdelegate import_cards(cards, bulk_uri \\ nil), to: Scryfall
end
