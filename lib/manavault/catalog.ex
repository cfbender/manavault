defmodule Manavault.Catalog do
  @moduledoc """
  Public catalog context API.
  """

  alias Manavault.Catalog.{Collection, Dataloader, Decks, Scryfall, ScryfallSyncWorker, Search}

  defdelegate data(), to: Dataloader

  defdelegate search_cards(term, opts \\ []), to: Search
  defdelegate suggest_card_names(term, opts \\ []), to: Search
  defdelegate get_printing_by_scryfall_id(scryfall_id), to: Search
  defdelegate get_printing(set_code, collector_number), to: Search
  defdelegate get_card_with_printings(oracle_id), to: Search
  defdelegate search_printings(filters, opts \\ []), to: Search
  defdelegate search_sets(term, opts \\ []), to: Search

  defdelegate list_collection_items(filters \\ [], opts \\ []), to: Collection
  defdelegate count_collection_items(filters \\ []), to: Collection
  defdelegate collection_value_summary(filters \\ []), to: Collection
  defdelegate get_collection_item!(id), to: Collection
  defdelegate change_collection_item(collection_item, attrs \\ %{}), to: Collection
  defdelegate new_collection_item_for_printing(scryfall_id), to: Collection
  defdelegate create_collection_item(attrs), to: Collection
  defdelegate update_collection_item(collection_item, attrs), to: Collection
  defdelegate list_printings_for_collection_item(collection_item), to: Collection
  defdelegate switch_collection_item_printing(collection_item, scryfall_id), to: Collection
  defdelegate delete_collection_item(collection_item), to: Collection

  defdelegate list_locations(opts \\ []), to: Collection
  defdelegate count_locations(), to: Collection
  defdelegate location_summaries(), to: Collection
  defdelegate list_location_summaries(summaries \\ nil), to: Collection
  defdelegate get_location_summary!(id), to: Collection
  defdelegate unfiled_location_summary(summaries \\ nil), to: Collection
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
  defdelegate preview_collection_import(text, opts \\ []), to: Collection
  defdelegate import_collection(text, opts \\ []), to: Collection
  defdelegate import_collection_preview(preview), to: Collection
  defdelegate export_collection_csv(filters \\ []), to: Collection
  defdelegate export_collection_text(filters \\ []), to: Collection

  defdelegate list_decks(), to: Decks
  defdelegate list_deck_summaries(), to: Decks
  defdelegate count_decks(), to: Decks
  defdelegate get_deck!(id, opts \\ []), to: Decks
  defdelegate get_deck_by_share_token(token, opts \\ []), to: Decks
  defdelegate deck_cards(deck), to: Decks
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
  defdelegate deck_reserves_cards?(deck_or_status), to: Decks
  defdelegate change_deck_card(deck_card, attrs \\ %{}), to: Decks
  defdelegate add_card_to_deck(deck, attrs), to: Decks
  defdelegate update_deck_card(deck_card, attrs), to: Decks
  defdelegate update_deck_cards_tag(deck_card_ids, tag), to: Decks
  defdelegate set_deck_commander(deck_card), to: Decks
  defdelegate delete_deck_card(deck_card), to: Decks
  defdelegate deck_allocation_status(deck), to: Decks
  defdelegate deck_card_allocation_status(deck_card), to: Decks
  defdelegate put_deck_card_allocation_statuses(deck_cards), to: Decks

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

  defdelegate allocate_proxy_to_deck_card(deck_card_id, quantity \\ 1), to: Decks
  defdelegate deallocate_proxy_from_deck_card(deck_card_id, quantity \\ 1), to: Decks
  defdelegate bulk_allocate_deck(deck, mode), to: Decks
  defdelegate preview_bulk_allocate_deck(deck, mode), to: Decks
  defdelegate import_decklist(deck, text, opts \\ []), to: Decks
  defdelegate export_decklist(deck), to: Decks
  defdelegate deck_buylist(deck, opts \\ []), to: Decks
  defdelegate deck_edhrec(deck, opts \\ []), to: Decks
  defdelegate export_deck_buylist(deck, format, opts \\ []), to: Decks
  defdelegate deck_stats(deck), to: Decks

  defdelegate latest_sync(), to: Scryfall
  defdelegate sync_scryfall(opts \\ []), to: Scryfall

  defdelegate reload_scryfall_catalog_async(opts \\ []),
    to: ScryfallSyncWorker,
    as: :reload_catalog_async

  defdelegate reload_scryfall_assets_async(opts \\ []),
    to: ScryfallSyncWorker,
    as: :reload_assets_async

  defdelegate import_cards(cards, bulk_uri \\ nil, opts \\ []), to: Scryfall
  defdelegate card_rulings(card, opts \\ []), to: Scryfall
end
