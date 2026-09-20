defmodule Manavault.Catalog.Collection do
  @moduledoc false

  alias Manavault.Catalog.Collection.{
    AutoSort,
    BulkUpdateItems,
    DeleteItems,
    ExportCollection,
    Items,
    ListAutoSortRules,
    Locations,
    ReplaceAutoSortRules,
    SetTradeQuantity
  }

  alias Manavault.Catalog.Collection.Import, as: CollectionImportWorkflow

  alias Manavault.Catalog.{CardCollection, Location}

  def list_collection_items(filters \\ [], opts \\ []) when is_list(filters) do
    CardCollection.list_items(filters, opts)
  end

  def list_collection_item_groups(filters \\ [], opts \\ []) when is_list(filters) do
    CardCollection.list_item_groups(filters, opts)
  end

  def list_collection_item_ids(filters \\ []) when is_list(filters) do
    CardCollection.list_item_ids(filters)
  end

  def collection_item_totals(filters \\ []) when is_list(filters) do
    CardCollection.item_totals(filters)
  end

  def count_collection_items(filters \\ []) when is_list(filters) do
    CardCollection.count_items(filters)
  end

  def count_collection_item_entries(filters \\ []) when is_list(filters) do
    CardCollection.count_item_entries(filters)
  end

  def count_collection_item_groups(filters \\ []) when is_list(filters) do
    CardCollection.count_item_groups(filters)
  end

  def collection_value_summary(filters \\ []) when is_list(filters) do
    CardCollection.value_summary(filters)
  end

  def collection_value_dashboard do
    CardCollection.value_dashboard()
  end

  def count_locations do
    Locations.count()
  end

  defdelegate get_collection_item!(id), to: Items, as: :get!
  defdelegate change_collection_item(item, attrs \\ %{}), to: Items, as: :change
  defdelegate new_collection_item_for_printing(scryfall_id), to: Items, as: :new_for_printing
  defdelegate create_collection_item(attrs), to: Items, as: :create
  defdelegate update_collection_item(item, attrs), to: Items, as: :update

  defdelegate update_collection_items(ids, attrs), to: BulkUpdateItems, as: :run

  defdelegate set_collection_items_for_trade_quantity(ids, quantity),
    to: SetTradeQuantity,
    as: :run

  defdelegate delete_collection_items(ids), to: DeleteItems, as: :run

  defdelegate list_printings_for_collection_item(item), to: Items, as: :list_printings
  defdelegate switch_collection_item_printing(item, scryfall_id), to: Items, as: :switch_printing
  defdelegate delete_collection_item(item), to: Items, as: :delete

  def list_locations(opts \\ []) do
    Locations.list(opts)
  end

  def location_summaries do
    Locations.summaries()
  end

  def list_location_summaries(summaries \\ nil) do
    Locations.list_summaries(summaries)
  end

  def get_location_summary!(id) do
    Locations.get_summary!(id)
  end

  def unfiled_location_summary(summaries \\ nil) do
    Locations.unfiled_summary(summaries)
  end

  def list_location_options do
    Locations.options()
  end

  def get_location!(id) do
    Locations.get!(id)
  end

  def get_location_with_items!(id) do
    Locations.get_with_items!(id)
  end

  def list_collection_items_by_location(location_id, filters \\ [], opts \\ [])
      when is_list(filters) do
    Locations.list_items_by_location(location_id, filters, opts)
  end

  def change_location(location, attrs \\ %{}) do
    Locations.change(location, attrs)
  end

  def create_location(attrs \\ %{}) do
    Locations.create(attrs)
  end

  def update_location(%Location{} = location, attrs) do
    Locations.update(location, attrs)
  end

  defdelegate list_collection_auto_sort_rules(), to: ListAutoSortRules, as: :run
  defdelegate update_collection_auto_sort_rules(inputs), to: ReplaceAutoSortRules, as: :run

  def auto_sort_collection(opts \\ []) do
    opts
    |> auto_sort_opts()
    |> AutoSort.run()
  end

  def delete_location(%Location{} = location) do
    Locations.delete(location)
  end

  defdelegate add_printing_to_collection(scryfall_id, attrs \\ %{}), to: Items, as: :add_printing

  def preview_collection_import(text, opts \\ []) when is_binary(text) and is_list(opts) do
    CollectionImportWorkflow.preview(text, opts)
  end

  def import_collection(text, opts \\ []) when is_binary(text) and is_list(opts) do
    CollectionImportWorkflow.run(text, opts, &create_collection_item/1)
  end

  def import_collection_preview(%{rows: rows} = preview, opts \\ []) when is_list(rows) do
    CollectionImportWorkflow.import_preview(preview, &create_collection_item/1, opts)
  end

  def preview_collection_import_auto_sort(%{rows: rows} = preview, opts \\ [])
      when is_list(rows) do
    CollectionImportWorkflow.preview_auto_sort(preview, &create_collection_item/1, opts)
  end

  defdelegate export_collection_csv(filters \\ []), to: ExportCollection, as: :csv
  defdelegate export_collection_text(filters \\ []), to: ExportCollection, as: :text

  defp auto_sort_opts(opts) when is_list(opts), do: opts

  defp auto_sort_opts(%{} = input) do
    cond do
      Map.has_key?(input, :source_location_id) ->
        [source_location_id: Map.fetch!(input, :source_location_id)]

      Map.has_key?(input, "source_location_id") ->
        [source_location_id: Map.fetch!(input, "source_location_id")]

      Map.has_key?(input, "sourceLocationId") ->
        [source_location_id: Map.fetch!(input, "sourceLocationId")]

      true ->
        []
    end
  end

  defp auto_sort_opts(nil), do: []
end
