defmodule Manavault.Catalog.Collection do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.Collection.{AutoSort, Export, ItemAttrs, Locations}
  alias Manavault.Catalog.Collection.Import, as: CollectionImportWorkflow

  alias Manavault.Catalog.{
    AutoSortRule,
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

  def list_collection_item_ids(filters \\ []) when is_list(filters) do
    CardCollection.list_item_ids(filters)
  end

  def count_collection_items(filters \\ []) when is_list(filters) do
    CardCollection.count_items(filters)
  end

  def count_collection_item_entries(filters \\ []) when is_list(filters) do
    CardCollection.count_item_entries(filters)
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
    attrs =
      attrs
      |> ItemAttrs.normalize()
      |> ItemAttrs.coerce_finish_to_available()
      |> ItemAttrs.put_default_purchase_price()

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

  # Chunk `id in ^ids` queries so selector-driven bulk operations over an
  # entire collection stay under SQLite's bound-parameter limit.
  @bulk_id_chunk 500

  def update_collection_items(ids, attrs) when is_list(ids) and is_map(attrs) do
    attrs = ItemAttrs.normalize(attrs)

    Repo.transaction(fn ->
      # Fetch every target in chunked queries instead of a Repo.get! per id.
      items_by_id =
        ids
        |> Enum.chunk_every(@bulk_id_chunk)
        |> Enum.flat_map(fn chunk ->
          CollectionItem
          |> where([item], item.id in ^chunk)
          |> Repo.all()
        end)
        |> Map.new(&{&1.id, &1})

      Enum.map(ids, fn id ->
        item = Map.get(items_by_id, id) || raise Ecto.NoResultsError, queryable: CollectionItem

        item
        |> CollectionItem.update_changeset(attrs)
        |> ItemAttrs.validate_finish_available()
        |> Repo.update()
        |> case do
          {:ok, item} -> item
          {:error, changeset} -> Repo.rollback(changeset)
        end
      end)
    end)
  end

  def delete_collection_items(ids) when is_list(ids) do
    Repo.transaction(fn ->
      ids
      |> Enum.chunk_every(@bulk_id_chunk)
      |> Enum.reduce(0, fn chunk, deleted ->
        {count, _returning} =
          CollectionItem
          |> where([item], item.id in ^chunk)
          |> Repo.delete_all()

        deleted + count
      end)
    end)
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

  def list_collection_auto_sort_rules do
    AutoSortRule
    |> order_auto_sort_rules()
    |> Repo.all()
    |> Repo.preload(:target_location)
  end

  def update_collection_auto_sort_rules(inputs) when is_list(inputs) do
    Repo.transact(fn ->
      Repo.delete_all(AutoSortRule)

      rules =
        inputs
        |> Enum.map(&rule_attrs/1)
        |> Enum.map(fn attrs ->
          case target_location(attrs) do
            {:ok, _location} ->
              %AutoSortRule{}
              |> AutoSortRule.changeset(attrs)
              |> Repo.insert()
              |> case do
                {:ok, rule} -> rule
                {:error, changeset} -> Repo.rollback(changeset)
              end

            {:error, reason} ->
              Repo.rollback(reason)
          end
        end)

      {:ok, Repo.preload(rules, :target_location)}
    end)
  end

  def auto_sort_collection(opts \\ []) do
    opts
    |> auto_sort_opts()
    |> AutoSort.run()
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

  def import_collection_preview(%{rows: rows} = preview, opts \\ []) when is_list(rows) do
    CollectionImportWorkflow.import_preview(preview, &create_collection_item/1, opts)
  end

  def preview_collection_import_auto_sort(%{rows: rows} = preview, opts \\ [])
      when is_list(rows) do
    CollectionImportWorkflow.preview_auto_sort(preview, &create_collection_item/1, opts)
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

  defp order_auto_sort_rules(queryable) do
    from(rule in queryable, order_by: [asc: rule.priority, asc: rule.id])
  end

  defp rule_attrs(input) when is_map(input) do
    %{}
    |> put_rule_attr(input, :name)
    |> put_rule_attr(input, :enabled, true)
    |> put_rule_attr(input, :priority)
    |> put_rule_attr(input, :target_location_id)
    |> put_rule_attr(input, :color_mode, "any")
    |> put_rule_attr(input, :colors, [])
    |> put_rule_attr(input, :type_line_includes, [])
    |> put_rule_attr(input, :type_line_excludes, [])
    |> put_rule_attr(input, :rarities, [])
    |> put_rule_attr(input, :min_price_cents)
    |> put_rule_attr(input, :max_price_cents)
  end

  defp put_rule_attr(map, input, field, default \\ nil) do
    case input_value(input, field) do
      {:ok, nil} -> Map.put(map, field, default)
      {:ok, value} -> Map.put(map, field, value)
      :error -> Map.put(map, field, default)
    end
  end

  defp target_location(%{target_location_id: nil}), do: {:error, :auto_sort_target_not_found}

  defp target_location(%{target_location_id: id}) do
    case Repo.get(Location, id) do
      %Location{kind: kind} when kind in ["box", "binder"] -> {:ok, id}
      %Location{} -> {:error, :invalid_auto_sort_target}
      nil -> {:error, :auto_sort_target_not_found}
    end
  end

  defp target_location(_attrs), do: {:error, :auto_sort_target_not_found}

  defp input_value(input, field) do
    string_field = Atom.to_string(field)
    camel_field = snake_to_camel(string_field)

    cond do
      Map.has_key?(input, field) -> {:ok, Map.fetch!(input, field)}
      Map.has_key?(input, string_field) -> {:ok, Map.fetch!(input, string_field)}
      Map.has_key?(input, camel_field) -> {:ok, Map.fetch!(input, camel_field)}
      true -> :error
    end
  end

  defp snake_to_camel(value) do
    value
    |> String.split("_")
    |> then(fn [head | tail] -> head <> Enum.map_join(tail, "", &String.capitalize/1) end)
  end

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
