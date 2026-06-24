defmodule Manavault.Catalog.Decks.Workflows do
  @moduledoc false

  alias Manavault.Catalog.EDHRec

  alias Manavault.Catalog.Decks.{
    Allocations,
    AllocationStatus,
    Buylist,
    Cards,
    DecklistIO,
    Queries,
    Records,
    Statistics
  }

  defdelegate list_decks(), to: Queries
  defdelegate list_deck_summaries(), to: Queries
  defdelegate count_decks(), to: Queries
  defdelegate get_deck_by_share_token(token, opts \\ []), to: Queries
  defdelegate get_deck!(id, opts \\ []), to: Queries
  defdelegate deck_cards(deck), to: Queries
  defdelegate deck_legality(deck), to: Queries
  defdelegate deck_card_count(deck), to: Queries
  defdelegate deck_unique_card_count(deck), to: Queries
  defdelegate deck_commander_color_identity(deck), to: Queries
  defdelegate deck_cover_image_url(deck), to: Queries

  defdelegate change_deck(deck, attrs \\ %{}), to: Records
  defdelegate create_deck(attrs), to: Records
  defdelegate update_deck(deck, attrs), to: Records
  defdelegate ensure_deck_share_token(deck), to: Records
  defdelegate delete_deck(deck), to: Records
  defdelegate deck_reserves_cards?(deck_or_status), to: Records

  defdelegate change_deck_card(deck_card, attrs \\ %{}), to: Cards
  defdelegate add_card_to_deck(deck, attrs), to: Cards
  defdelegate update_deck_card(deck_card, attrs), to: Cards
  defdelegate update_deck_cards_tag(deck_card_ids, tag), to: Cards
  defdelegate set_deck_commander(deck_card), to: Cards
  defdelegate delete_deck_card(deck_card), to: Cards

  defdelegate deck_allocation_status(deck), to: AllocationStatus
  defdelegate deck_card_allocation_status(deck_card), to: AllocationStatus
  defdelegate put_deck_card_allocation_statuses(deck_cards), to: AllocationStatus

  defdelegate allocate_collection_item_to_deck_card(
                deck_card_id,
                collection_item_id,
                quantity \\ 1
              ),
              to: Allocations

  defdelegate bulk_add_collection_items_to_deck(
                deck_or_id,
                collection_item_ids,
                zone \\ "mainboard"
              ),
              to: Allocations

  defdelegate deallocate_collection_item_from_deck_card(
                deck_card_id,
                collection_item_id,
                quantity \\ 1
              ),
              to: Allocations

  defdelegate allocate_proxy_to_deck_card(deck_card_id, quantity \\ 1), to: Allocations
  defdelegate deallocate_proxy_from_deck_card(deck_card_id, quantity \\ 1), to: Allocations
  defdelegate bulk_allocate_deck(deck, mode), to: Allocations
  defdelegate preview_bulk_allocate_deck(deck, mode), to: Allocations

  defdelegate import_decklist(deck, text, opts \\ []), to: DecklistIO
  defdelegate export_decklist(deck), to: DecklistIO

  defdelegate deck_buylist(deck, opts \\ []), to: Buylist
  defdelegate export_deck_buylist(deck, format, opts \\ []), to: Buylist

  def deck_edhrec(deck, opts \\ []), do: EDHRec.recs(deck, opts)

  defdelegate deck_stats(deck), to: Statistics
end
