defmodule ManavaultWeb.Schema.Catalog.MutationResolvers do
  @moduledoc false

  alias ManavaultWeb.Schema.Catalog.{
    AllocationResolvers,
    CollectionMutations,
    DeckMutations,
    LocationMutations
  }

  defdelegate create_collection_item(parent, args, resolution), to: CollectionMutations
  defdelegate update_collection_item(parent, args, resolution), to: CollectionMutations
  defdelegate bulk_update_collection_items(parent, args, resolution), to: CollectionMutations
  defdelegate delete_collection_item(parent, args, resolution), to: CollectionMutations

  defdelegate create_deck(parent, args, resolution), to: DeckMutations
  defdelegate update_deck(parent, args, resolution), to: DeckMutations
  defdelegate ensure_deck_share_token(parent, args, resolution), to: DeckMutations
  defdelegate add_deck_card(parent, args, resolution), to: DeckMutations
  defdelegate import_decklist(parent, args, resolution), to: DeckMutations
  defdelegate delete_deck(parent, args, resolution), to: DeckMutations
  defdelegate preview_deck_disassembly(parent, args, resolution), to: DeckMutations
  defdelegate disassemble_deck(parent, args, resolution), to: DeckMutations
  defdelegate update_deck_card(parent, args, resolution), to: DeckMutations
  defdelegate update_deck_cards_tag(parent, args, resolution), to: DeckMutations
  defdelegate optimize_deck_card_printings(parent, args, resolution), to: DeckMutations
  defdelegate delete_deck_card(parent, args, resolution), to: DeckMutations
  defdelegate set_deck_commander(parent, args, resolution), to: DeckMutations

  defdelegate create_location(parent, args, resolution), to: LocationMutations
  defdelegate delete_location(parent, args, resolution), to: LocationMutations
  defdelegate update_location(parent, args, resolution), to: LocationMutations
  defdelegate update_collection_auto_sort_rules(parent, args, resolution), to: LocationMutations
  defdelegate auto_sort_collection(parent, args, resolution), to: LocationMutations

  defdelegate add_collection_item_to_deck(parent, args, resolution), to: AllocationResolvers
  defdelegate bulk_add_collection_items_to_deck(parent, args, resolution), to: AllocationResolvers
  defdelegate allocate_deck_card_item(parent, args, resolution), to: AllocationResolvers
  defdelegate deallocate_deck_card_item(parent, args, resolution), to: AllocationResolvers
  defdelegate allocate_deck_card_proxy(parent, args, resolution), to: AllocationResolvers
  defdelegate deallocate_deck_card_proxy(parent, args, resolution), to: AllocationResolvers
  defdelegate preview_bulk_allocate_deck(parent, args, resolution), to: AllocationResolvers
  defdelegate bulk_allocate_deck(parent, args, resolution), to: AllocationResolvers
end
