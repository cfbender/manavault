defmodule Manavault.Catalog.Collection do
  @moduledoc false

  alias Manavault.Catalog.Collection.{Export, ItemAttrs, Locations}
  alias Manavault.Catalog.Collection.Import, as: CollectionImportWorkflow

  alias Manavault.Catalog.{
    CardCollection,
    CollectionItem,
    Location,
    Printing,
    Search
  }

  alias Manavault.Repo

  def list_collection_items(filters \\ [], opts \\ []) when is_list(filters) do
    CardCollection.list_items(filters, opts)
  end

  def count_collection_items(filters \\ []) when is_list(filters) do
    CardCollection.count_items(filters)
  end

  def collection_value_summary(filters \\ []) when is_list(filters) do
    CardCollection.value_summary(filters)
  end

  def count_locations do
    Locations.count()
  end

  def get_collection_item!(id) do
    CollectionItem
    |> Repo.get!(id)
    |> Repo.preload(printing: :card, location_assoc: [])
  end

  def change_collection_item(collection_item, attrs \\ %{})

  def change_collection_item(%CollectionItem{id: nil} = collection_item, attrs) do
    CollectionItem.create_changeset(collection_item, attrs)
  end

  def change_collection_item(%CollectionItem{} = collection_item, attrs) do
    CollectionItem.update_changeset(collection_item, attrs)
  end

  def new_collection_item_for_printing(scryfall_id) when is_binary(scryfall_id) do
    case Search.get_printing_by_scryfall_id(scryfall_id) do
      nil ->
        nil

      printing ->
        CollectionItem.create_changeset(
          %CollectionItem{},
          ItemAttrs.default_for_printing(printing)
        )
    end
  end

  def create_collection_item(attrs) when is_map(attrs) do
    attrs = attrs |> ItemAttrs.normalize() |> ItemAttrs.put_default_purchase_price()

    %CollectionItem{}
    |> CollectionItem.create_changeset(attrs)
    |> ItemAttrs.validate_finish_available()
    |> Repo.insert()
  end

  def update_collection_item(%CollectionItem{} = collection_item, attrs) when is_map(attrs) do
    attrs = ItemAttrs.normalize(attrs)

    collection_item
    |> CollectionItem.update_changeset(attrs)
    |> ItemAttrs.validate_finish_available()
    |> Repo.update()
  end

  def list_printings_for_collection_item(%CollectionItem{
        printing: %{card: %{oracle_id: oracle_id}}
      }) do
    Search.list_printings_for_oracle_id(oracle_id)
  end

  def list_printings_for_collection_item(%CollectionItem{printing: %{oracle_id: oracle_id}}) do
    Search.list_printings_for_oracle_id(oracle_id)
  end

  def list_printings_for_collection_item(%CollectionItem{scryfall_id: scryfall_id}) do
    case Search.get_printing_by_scryfall_id(scryfall_id) do
      nil -> []
      %Printing{oracle_id: oracle_id} -> Search.list_printings_for_oracle_id(oracle_id)
    end
  end

  def switch_collection_item_printing(%CollectionItem{} = collection_item, scryfall_id)
      when is_binary(scryfall_id) do
    attrs = ItemAttrs.switch(collection_item, scryfall_id)

    collection_item
    |> CollectionItem.switch_printing_changeset(attrs)
    |> ItemAttrs.validate_finish_available()
    |> Repo.update()
  end

  def delete_collection_item(%CollectionItem{} = collection_item) do
    Repo.delete(collection_item)
  end

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

  def delete_location(%Location{} = location) do
    Locations.delete(location)
  end

  def add_printing_to_collection(scryfall_id, attrs \\ %{})
      when is_binary(scryfall_id) and is_map(attrs) do
    attrs
    |> Map.new(fn {key, value} -> {to_string(key), value} end)
    |> Map.put("scryfall_id", scryfall_id)
    |> create_collection_item()
  end

  def preview_collection_import(text, opts \\ []) when is_binary(text) and is_list(opts) do
    CollectionImportWorkflow.preview(text, opts)
  end

  def import_collection(text, opts \\ []) when is_binary(text) and is_list(opts) do
    CollectionImportWorkflow.run(text, opts, &create_collection_item/1)
  end

  def import_collection_preview(%{rows: rows} = preview) when is_list(rows) do
    CollectionImportWorkflow.import_preview(preview, &create_collection_item/1)
  end

  def export_collection_csv(filters \\ []) when is_list(filters) do
    filters
    |> list_collection_items(limit: 100_000)
    |> Export.csv()
  end

  def export_collection_text(filters \\ []) when is_list(filters) do
    filters
    |> list_collection_items(limit: 100_000)
    |> Export.text()
  end
end
