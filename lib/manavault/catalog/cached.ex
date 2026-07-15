defmodule Manavault.Catalog.Cached do
  @moduledoc false

  alias Manavault.Catalog.{
    Cache,
    Collection,
    CollectionItem,
    Scryfall,
    Search
  }

  def search_cards(term, opts \\ []) do
    cached(Cache.cards_tag(), {:search_cards, term, opts}, fn ->
      Search.search_cards(term, opts)
    end)
  end

  def suggest_card_names(term, opts \\ []) do
    Search.suggest_card_names(term, opts)
  end

  def get_printing_by_scryfall_id(scryfall_id) do
    cached(Cache.catalog_tag(), {:printing, scryfall_id}, fn ->
      Search.get_printing_by_scryfall_id(scryfall_id)
    end)
  end

  def get_printing(set_code, collector_number) do
    cached(Cache.catalog_tag(), {:printing_by_set_number, set_code, collector_number}, fn ->
      Search.get_printing(set_code, collector_number)
    end)
  end

  def get_card_with_printings(oracle_id) do
    cached(Cache.cards_tag(), {:card_with_printings, oracle_id}, fn ->
      Search.get_card_with_printings(oracle_id)
    end)
  end

  def search_printings(filters, opts \\ []) do
    cached(Cache.catalog_tag(), {:search_printings, filters, opts}, fn ->
      Search.search_printings(filters, opts)
    end)
  end

  def search_sets(term, opts \\ []) do
    cached(Cache.catalog_tag(), {:search_sets, term, opts}, fn ->
      Search.search_sets(term, opts)
    end)
  end

  def list_collection_items(filters \\ [], opts \\ []) when is_list(filters) do
    cached(Cache.collection_tag(), {:list_collection_items, filters, opts}, fn ->
      Collection.list_collection_items(filters, opts)
    end)
  end

  def list_collection_item_ids(filters \\ []) when is_list(filters) do
    cached(Cache.collection_tag(), {:list_collection_item_ids, filters}, fn ->
      Collection.list_collection_item_ids(filters)
    end)
  end

  def count_collection_items(filters \\ []) when is_list(filters) do
    cached(Cache.collection_tag(), {:count_collection_items, filters}, fn ->
      Collection.count_collection_items(filters)
    end)
  end

  def count_collection_item_entries(filters \\ []) when is_list(filters) do
    cached(Cache.collection_tag(), {:count_collection_item_entries, filters}, fn ->
      Collection.count_collection_item_entries(filters)
    end)
  end

  def collection_value_summary(filters \\ []) when is_list(filters) do
    cached(Cache.collection_tag(), {:collection_value_summary, filters}, fn ->
      Collection.collection_value_summary(filters)
    end)
  end

  def get_collection_item!(id) do
    cached(Cache.collection_tag(), {:collection_item, id}, fn ->
      Collection.get_collection_item!(id)
    end)
  end

  defdelegate change_collection_item(collection_item, attrs \\ %{}), to: Collection
  defdelegate new_collection_item_for_printing(scryfall_id), to: Collection

  def create_collection_item(attrs) do
    attrs
    |> Collection.create_collection_item()
    |> invalidate_on_ok(&Cache.invalidate_collection/0)
  end

  def update_collection_item(collection_item, attrs) do
    collection_item
    |> Collection.update_collection_item(attrs)
    |> invalidate_on_ok(&Cache.invalidate_collection/0)
  end

  def update_collection_items(ids, attrs) do
    ids
    |> Collection.update_collection_items(attrs)
    |> invalidate_on_ok(&Cache.invalidate_collection/0)
  end

  def list_printings_for_collection_item(%CollectionItem{} = collection_item) do
    cached(
      Cache.catalog_tag(),
      {:collection_item_printings, collection_item_printing_key(collection_item)},
      fn ->
        Collection.list_printings_for_collection_item(collection_item)
      end
    )
  end

  def switch_collection_item_printing(collection_item, scryfall_id) do
    collection_item
    |> Collection.switch_collection_item_printing(scryfall_id)
    |> invalidate_on_ok(&Cache.invalidate_collection/0)
  end

  def delete_collection_item(collection_item) do
    collection_item
    |> Collection.delete_collection_item()
    |> invalidate_on_ok(&Cache.invalidate_collection/0)
  end

  def delete_collection_items(ids) do
    ids
    |> Collection.delete_collection_items()
    |> invalidate_on_ok(&Cache.invalidate_collection/0)
  end

  def list_locations(opts \\ []) do
    cached(Cache.locations_tag(), {:list_locations, opts}, fn ->
      Collection.list_locations(opts)
    end)
  end

  def count_locations do
    cached(Cache.locations_tag(), :count_locations, fn ->
      Collection.count_locations()
    end)
  end

  def location_summaries do
    cached(Cache.locations_tag(), :location_summaries, fn ->
      Collection.location_summaries()
    end)
  end

  def list_location_summaries(summaries \\ nil)

  def list_location_summaries(nil) do
    cached(Cache.locations_tag(), :list_location_summaries, fn ->
      Collection.list_location_summaries(nil)
    end)
  end

  # Passed summaries make this a light transform; caching by the whole (large,
  # churning) map costs more than it saves, so compute directly.
  def list_location_summaries(summaries) do
    Collection.list_location_summaries(summaries)
  end

  def get_location_summary!(id) do
    cached(Cache.locations_tag(), {:location_summary, id}, fn ->
      Collection.get_location_summary!(id)
    end)
  end

  def unfiled_location_summary(summaries \\ nil)

  def unfiled_location_summary(nil) do
    cached(Cache.locations_tag(), :unfiled_location_summary, fn ->
      Collection.unfiled_location_summary(nil)
    end)
  end

  def unfiled_location_summary(summaries) do
    Collection.unfiled_location_summary(summaries)
  end

  def list_location_options do
    cached(Cache.locations_tag(), :location_options, fn ->
      Collection.list_location_options()
    end)
  end

  def get_location!(id) do
    cached(Cache.locations_tag(), {:location, id}, fn ->
      Collection.get_location!(id)
    end)
  end

  def get_location_with_items!(id) do
    cached(Cache.locations_tag(), {:location_with_items, id}, fn ->
      Collection.get_location_with_items!(id)
    end)
  end

  def list_collection_items_by_location(location_id, filters \\ [], opts \\ [])
      when is_list(filters) do
    cached(
      Cache.collection_tag(),
      {:list_collection_items_by_location, location_id, filters, opts},
      fn ->
        Collection.list_collection_items_by_location(location_id, filters, opts)
      end
    )
  end

  defdelegate change_location(location, attrs \\ %{}), to: Collection

  def create_location(attrs \\ %{}) do
    attrs
    |> Collection.create_location()
    |> invalidate_on_ok(&Cache.invalidate_locations/0)
  end

  def update_location(location, attrs) do
    location
    |> Collection.update_location(attrs)
    |> invalidate_on_ok(&Cache.invalidate_locations/0)
  end

  def list_collection_auto_sort_rules do
    cached(Cache.auto_sort_rules_tag(), :collection_auto_sort_rules, fn ->
      Collection.list_collection_auto_sort_rules()
    end)
  end

  def update_collection_auto_sort_rules(inputs) do
    inputs
    |> Collection.update_collection_auto_sort_rules()
    |> invalidate_on_ok(&Cache.invalidate_auto_sort_rules/0)
  end

  def auto_sort_collection(opts \\ []) do
    opts
    |> Collection.auto_sort_collection()
    |> invalidate_on_ok(&Cache.invalidate_collection/0)
  end

  def delete_location(location) do
    location
    |> Collection.delete_location()
    |> invalidate_on_ok(&Cache.invalidate_locations/0)
  end

  def add_printing_to_collection(scryfall_id, attrs \\ %{}) do
    scryfall_id
    |> Collection.add_printing_to_collection(attrs)
    |> invalidate_on_ok(&Cache.invalidate_collection/0)
  end

  defdelegate preview_collection_import(text, opts \\ []), to: Collection

  def import_collection(text, opts \\ []) do
    text
    |> Collection.import_collection(opts)
    |> invalidate_on_ok(&Cache.invalidate_collection/0)
  end

  def import_collection_preview(preview, opts \\ []) do
    preview
    |> Collection.import_collection_preview(opts)
    |> invalidate_on_ok(&Cache.invalidate_collection/0)
  end

  defdelegate preview_collection_import_auto_sort(preview, opts \\ []), to: Collection

  def export_collection_csv(filters \\ []) when is_list(filters) do
    cached(Cache.collection_tag(), {:export_collection_csv, filters}, fn ->
      Collection.export_collection_csv(filters)
    end)
  end

  def export_collection_text(filters \\ []) when is_list(filters) do
    cached(Cache.collection_tag(), {:export_collection_text, filters}, fn ->
      Collection.export_collection_text(filters)
    end)
  end

  def sync_scryfall(opts \\ []) do
    opts
    |> Scryfall.sync_scryfall()
    |> invalidate_on_ok(&Cache.invalidate_catalog/0)
  end

  def import_cards(cards, bulk_uri \\ nil, opts \\ [])

  def import_cards(cards, opts, []) when is_list(cards) and is_list(opts) do
    cards
    |> Scryfall.import_cards(opts, [])
    |> invalidate_on_ok(&Cache.invalidate_catalog/0)
  end

  def import_cards(cards, bulk_uri, opts) do
    cards
    |> Scryfall.import_cards(bulk_uri, opts)
    |> invalidate_on_ok(&Cache.invalidate_catalog/0)
  end

  def card_rulings(card, opts \\ [])

  def card_rulings(%{rulings_uri: rulings_uri} = card, opts) when is_binary(rulings_uri) do
    if Keyword.has_key?(opts, :fetcher) do
      Scryfall.card_rulings(card, opts)
    else
      Cache.external_cached({:card_rulings, rulings_uri}, [tag: Cache.catalog_tag()], fn ->
        Scryfall.card_rulings(card, opts)
      end)
    end
  end

  def card_rulings(card, opts), do: Scryfall.card_rulings(card, opts)

  defp cached(tag, key, fun) do
    Cache.cached(key, [tag: tag], fun)
  end

  defp invalidate_on_ok({:ok, _value} = result, invalidate) do
    invalidate.()
    result
  end

  defp invalidate_on_ok(result, _invalidate), do: result

  defp collection_item_printing_key(%{printing: %{card: %{oracle_id: oracle_id}}})
       when is_binary(oracle_id) do
    {:oracle_id, oracle_id}
  end

  defp collection_item_printing_key(%{printing: %{oracle_id: oracle_id}})
       when is_binary(oracle_id) do
    {:oracle_id, oracle_id}
  end

  defp collection_item_printing_key(%{scryfall_id: scryfall_id}) when is_binary(scryfall_id) do
    {:scryfall_id, scryfall_id}
  end
end
