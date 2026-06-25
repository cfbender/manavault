defmodule Manavault.Catalog.Decks do
  @moduledoc false

  alias Manavault.Catalog.Decks.Workflows

  defdelegate list_decks(), to: Workflows
  defdelegate list_deck_summaries(), to: Workflows
  defdelegate count_decks(), to: Workflows
  defdelegate get_deck_by_share_token(token, opts \\ []), to: Workflows
  defdelegate get_deck!(id, opts \\ []), to: Workflows
  defdelegate deck_cards(deck), to: Workflows
  defdelegate deck_legality(deck), to: Workflows
  defdelegate deck_card_count(deck), to: Workflows
  defdelegate deck_unique_card_count(deck), to: Workflows
  defdelegate deck_commander_color_identity(deck), to: Workflows
  defdelegate deck_cover_image_url(deck), to: Workflows
  defdelegate change_deck(deck, attrs \\ %{}), to: Workflows
  defdelegate create_deck(attrs), to: Workflows
  defdelegate update_deck(deck, attrs), to: Workflows
  defdelegate ensure_deck_share_token(deck), to: Workflows
  defdelegate delete_deck(deck), to: Workflows
  defdelegate preview_deck_disassembly(deck), to: Workflows
  defdelegate disassemble_deck(deck), to: Workflows
  defdelegate deck_reserves_cards?(deck_or_status), to: Workflows
  defdelegate change_deck_card(deck_card, attrs \\ %{}), to: Workflows
  defdelegate add_card_to_deck(deck, attrs), to: Workflows
  defdelegate update_deck_card(deck_card, attrs), to: Workflows
  defdelegate update_deck_cards_tag(deck_card_ids, tag), to: Workflows
  defdelegate optimize_deck_card_printings(deck_card_ids), to: Workflows
  defdelegate set_deck_commander(deck_card), to: Workflows
  defdelegate delete_deck_card(deck_card), to: Workflows
  defdelegate deck_allocation_status(deck), to: Workflows
  defdelegate deck_card_allocation_status(deck_card), to: Workflows
  defdelegate put_deck_card_allocation_statuses(deck_cards), to: Workflows

  defdelegate allocate_collection_item_to_deck_card(
                deck_card_id,
                collection_item_id,
                quantity \\ 1
              ),
              to: Workflows

  defdelegate bulk_add_collection_items_to_deck(
                deck_or_id,
                collection_item_ids,
                zone \\ "mainboard"
              ),
              to: Workflows

  defdelegate deallocate_collection_item_from_deck_card(
                deck_card_id,
                collection_item_id,
                quantity \\ 1
              ),
              to: Workflows

  defdelegate allocate_proxy_to_deck_card(deck_card_id, quantity \\ 1), to: Workflows
  defdelegate deallocate_proxy_from_deck_card(deck_card_id, quantity \\ 1), to: Workflows
  defdelegate bulk_allocate_deck(deck, mode), to: Workflows
  defdelegate preview_bulk_allocate_deck(deck, mode), to: Workflows
  defdelegate import_decklist(deck, text, opts \\ []), to: Workflows
  defdelegate export_decklist(deck), to: Workflows
  defdelegate deck_buylist(deck, opts \\ []), to: Workflows
  defdelegate deck_edhrec(deck, opts \\ []), to: Workflows
  defdelegate export_deck_buylist(deck, format, opts \\ []), to: Workflows
  defdelegate deck_stats(deck), to: Workflows
end
