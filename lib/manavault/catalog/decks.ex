defmodule Manavault.Catalog.Decks do
  @moduledoc false

  alias Manavault.Catalog.{Cache, Deck, DeckCard, DeckSummaries, EDHRec}

  alias Manavault.Catalog.Decks.{
    AllocationStatus,
    BulkCollectionAllocation,
    BulkDeckAllocation,
    Buylist,
    Cards,
    DeckCardAllocation,
    DeckCardDeallocation,
    DecklistIO,
    DefaultTags,
    Disassembly,
    ProxyAllocation,
    PullListAllocation,
    Queries,
    Records,
    ShareToken,
    Statistics,
    Tags
  }

  def list_decks do
    cached(:list_decks, &Queries.list_decks/0)
  end

  def list_deck_summaries(opts \\ []) do
    offset = Keyword.get(opts, :offset, 0)
    limit = Keyword.get(opts, :limit)

    cached({:list_deck_summaries, offset, limit}, fn ->
      Queries.list_deck_summaries(opts)
    end)
  end

  def count_decks do
    cached(:count_decks, &Queries.count_decks/0)
  end

  def get_deck_by_share_token(token, opts \\ []) do
    if ShareToken.valid?(token) do
      cached_share_deck_by_token(token, opts)
    end
  end

  def get_deck!(id, opts \\ []) do
    cached({:deck, id, opts}, fn ->
      Queries.get_deck!(id, opts)
    end)
  end

  def get_deck_card!(id) do
    cached({:deck_card, id}, fn ->
      Queries.get_deck_card!(id)
    end)
  end

  def deck_cards(deck) do
    cached_deck_read(deck, :deck_cards, fn ->
      Queries.deck_cards(deck)
    end)
  end

  def fetch_cached_deck_cards(deck) do
    fetch_cached_deck_read(deck, :deck_cards)
  end

  def put_cached_deck_cards(deck, deck_cards) do
    put_cached_deck_read(deck, :deck_cards, deck_cards)
  end

  def deck_legality(deck) do
    cached_deck_read(deck, :deck_legality, fn ->
      Queries.deck_legality(deck)
    end)
  end

  def deck_card_count(deck) do
    cached_deck_read(deck, :deck_card_count, fn ->
      Queries.deck_card_count(deck)
    end)
  end

  def deck_unique_card_count(deck) do
    cached_deck_read(deck, :deck_unique_card_count, fn ->
      Queries.deck_unique_card_count(deck)
    end)
  end

  def deck_commander_color_identity(deck) do
    cached_deck_read(deck, :deck_commander_color_identity, fn ->
      Queries.deck_commander_color_identity(deck)
    end)
  end

  def deck_cover_image_url(deck) do
    cached_deck_read(deck, :deck_cover_image_url, fn ->
      Queries.deck_cover_image_url(deck)
    end)
  end

  defdelegate change_deck(deck, attrs \\ %{}), to: Records

  def create_deck(attrs) do
    attrs
    |> Records.create_deck()
    |> invalidate_decks_on_ok()
  end

  def update_deck(deck, attrs) do
    deck
    |> Records.update_deck(attrs)
    |> invalidate_decks_on_ok()
  end

  def ensure_deck_share_token(deck) do
    deck
    |> Records.ensure_deck_share_token()
    |> invalidate_decks_on_ok()
  end

  def delete_deck(deck) do
    deck
    |> Records.delete_deck()
    |> invalidate_decks_on_ok()
  end

  def preview_deck_disassembly(deck) do
    cached_deck_read(deck, :preview_deck_disassembly, fn ->
      Disassembly.preview_deck_disassembly(deck)
    end)
  end

  def disassemble_deck(deck) do
    deck
    |> Disassembly.disassemble_deck()
    |> invalidate_decks_on_ok()
  end

  defdelegate deck_reserves_cards?(deck_or_status), to: Records
  defdelegate change_deck_card(deck_card, attrs \\ %{}), to: Cards

  def add_card_to_deck(deck, attrs) do
    deck
    |> Cards.add_card_to_deck(attrs)
    |> invalidate_decks_on_ok()
  end

  def update_deck_card(deck_card, attrs) do
    deck_card
    |> Cards.update_deck_card(attrs)
    |> invalidate_decks_on_ok()
  end

  def update_deck_cards_tag(deck_card_ids, tag) do
    deck_card_ids
    |> Cards.update_deck_cards_tag(tag)
    |> invalidate_decks_on_ok()
  end

  def bulk_update_deck_cards(deck_card_ids, attrs) do
    deck_card_ids
    |> Cards.bulk_update_deck_cards(attrs)
    |> invalidate_decks_on_ok()
  end

  def bulk_delete_deck_cards(deck_card_ids) do
    deck_card_ids
    |> Cards.bulk_delete_deck_cards()
    |> invalidate_decks_on_ok()
  end

  def optimize_deck_card_printings(deck_card_ids) do
    deck_card_ids
    |> Cards.optimize_deck_card_printings()
    |> invalidate_decks_on_ok()
  end

  def set_deck_commander(deck_card) do
    deck_card
    |> Cards.set_deck_commander()
    |> invalidate_decks_on_ok()
  end

  def delete_deck_card(deck_card) do
    deck_card
    |> Cards.delete_deck_card()
    |> invalidate_decks_on_ok()
  end

  def deck_allocation_status(deck) do
    cached_deck_read(deck, :deck_allocation_status, fn ->
      AllocationStatus.deck_allocation_status(deck)
    end)
  end

  def deck_card_allocation_status(%DeckCard{id: id} = deck_card) when not is_nil(id) do
    cached({:deck_card_allocation_status, id}, fn ->
      AllocationStatus.deck_card_allocation_status(deck_card)
    end)
  end

  def deck_card_allocation_status(deck_card) do
    AllocationStatus.deck_card_allocation_status(deck_card)
  end

  defdelegate put_deck_card_allocation_statuses(deck_cards), to: AllocationStatus

  defdelegate put_deck_card_fallback_printings(deck_cards),
    to: DeckSummaries,
    as: :put_fallback_printings

  defdelegate list_deck_tags(deck), to: Tags
  defdelegate put_deck_card_tag_ids(deck_cards), to: Tags

  def create_deck_tag(deck, attrs) do
    deck
    |> Tags.create_deck_tag(attrs)
    |> invalidate_decks_on_ok()
  end

  def update_deck_tag(deck_tag, attrs) do
    deck_tag
    |> Tags.update_deck_tag(attrs)
    |> invalidate_decks_on_ok()
  end

  def delete_deck_tag(deck_tag) do
    deck_tag
    |> Tags.delete_deck_tag()
    |> invalidate_decks_on_ok()
  end

  def reorder_deck_tags(deck, ordered_tag_ids) do
    deck
    |> Tags.reorder_deck_tags(ordered_tag_ids)
    |> invalidate_decks_on_ok()
  end

  def assign_deck_card_tag(deck_card_id, deck_tag_id) do
    deck_card_id
    |> Tags.assign_deck_card_tag(deck_tag_id)
    |> invalidate_decks_on_ok()
  end

  def unassign_deck_card_tag(deck_card_id, deck_tag_id) do
    deck_card_id
    |> Tags.unassign_deck_card_tag(deck_tag_id)
    |> invalidate_decks_on_ok()
  end

  defdelegate list_default_deck_tags(), to: DefaultTags
  defdelegate replace_default_deck_tags(entries), to: DefaultTags
  defdelegate seed_deck_default_tags(deck), to: DefaultTags

  def allocate_collection_item_to_deck_card(deck_card_id, collection_item_id, quantity \\ 1) do
    deck_card_id
    |> DeckCardAllocation.allocate_collection_item_to_deck_card(collection_item_id, quantity)
    |> invalidate_decks_on_ok()
  end

  def bulk_add_collection_items_to_deck(deck_or_id, collection_item_ids, zone \\ "mainboard") do
    deck_or_id
    |> BulkCollectionAllocation.bulk_add_collection_items_to_deck(collection_item_ids, zone)
    |> invalidate_decks_on_ok()
  end

  def deallocate_collection_item_from_deck_card(deck_card_id, collection_item_id, quantity \\ 1) do
    deck_card_id
    |> DeckCardAllocation.deallocate_collection_item_from_deck_card(collection_item_id, quantity)
    |> invalidate_decks_on_ok()
  end

  def bulk_deallocate_deck_cards(deck_card_ids) do
    deck_card_ids
    |> DeckCardDeallocation.bulk_deallocate_deck_cards()
    |> invalidate_decks_on_ok()
  end

  def allocate_proxy_to_deck_card(deck_card_id, quantity \\ 1) do
    deck_card_id
    |> ProxyAllocation.allocate_proxy_to_deck_card(quantity)
    |> invalidate_decks_on_ok()
  end

  def deallocate_proxy_from_deck_card(deck_card_id, quantity \\ 1) do
    deck_card_id
    |> ProxyAllocation.deallocate_proxy_from_deck_card(quantity)
    |> invalidate_decks_on_ok()
  end

  def bulk_allocate_deck(deck, mode) do
    deck
    |> BulkDeckAllocation.bulk_allocate_deck(mode)
    |> invalidate_decks_on_ok()
  end

  def preview_bulk_allocate_deck(deck, mode) do
    cached_deck_read(deck, {:preview_bulk_allocate_deck, mode}, fn ->
      BulkDeckAllocation.preview_bulk_allocate_deck(deck, mode)
    end)
  end

  def allocate_deck_pull_list(deck_or_id, entries) do
    deck_or_id
    |> PullListAllocation.allocate_deck_pull_list(entries)
    |> invalidate_decks_on_ok()
  end

  def import_decklist(deck, text, opts \\ []) do
    deck
    |> DecklistIO.import_decklist(text, opts)
    |> invalidate_decks_on_ok()
  end

  def export_decklist(deck) do
    cached_deck_read(deck, :export_decklist, fn ->
      DecklistIO.export_decklist(deck)
    end)
  end

  def deck_buylist(deck, opts \\ []) do
    cached_deck_read(deck, {:deck_buylist, opts}, fn ->
      Buylist.deck_buylist(deck, opts)
    end)
  end

  def deck_edhrec(deck, opts \\ []) do
    cached_deck_read(deck, {:deck_edhrec, opts}, fn ->
      EDHRec.recs(deck, opts)
    end)
  end

  def export_deck_buylist(deck, format, opts \\ []) do
    cached_deck_read(deck, {:export_deck_buylist, format, opts}, fn ->
      Buylist.export_deck_buylist(deck, format, opts)
    end)
  end

  def deck_stats(deck) do
    cached_deck_read(deck, :deck_stats, fn ->
      Statistics.deck_stats(deck)
    end)
  end

  defp cached_share_deck_by_token(token, opts) do
    key = {:deck_by_share_token, token, opts}

    case Cache.fetch(key) do
      {:ok, %Deck{} = deck} ->
        deck

      _miss ->
        case Queries.get_deck_by_share_token(token, opts) do
          %Deck{} = deck -> Cache.put(key, deck, tag: Cache.decks_tag())
          nil -> nil
        end
    end
  end

  defp cached(key, fun), do: Cache.cached(key, [tag: Cache.decks_tag()], fun)

  defp cached_deck_read(%{id: id}, key, fun) when not is_nil(id) do
    cached({:deck_read, id, key}, fun)
  end

  defp cached_deck_read(_deck, _key, fun), do: fun.()

  defp fetch_cached_deck_read(%{id: id}, key) when not is_nil(id) do
    Cache.fetch({:deck_read, id, key})
  end

  defp fetch_cached_deck_read(_deck, _key), do: :miss

  defp put_cached_deck_read(%{id: id}, key, value) when not is_nil(id) do
    Cache.put({:deck_read, id, key}, value, tag: Cache.decks_tag())
  end

  defp put_cached_deck_read(_deck, _key, value), do: value

  defp invalidate_decks_on_ok({:ok, _value} = result) do
    Cache.invalidate_decks()
    result
  end

  defp invalidate_decks_on_ok(result), do: result
end
