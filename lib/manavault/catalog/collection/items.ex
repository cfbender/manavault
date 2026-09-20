defmodule Manavault.Catalog.Collection.Items do
  @moduledoc false

  alias Manavault.Catalog.Collection.ItemAttrs
  alias Manavault.Catalog.{CollectionItem, Printing, Search}
  alias Manavault.Repo

  def get!(id) do
    CollectionItem
    |> Repo.get!(id)
    |> Repo.preload(printing: :card, location_assoc: [])
  end

  def change(collection_item, attrs \\ %{})

  def change(%CollectionItem{id: nil} = collection_item, attrs) do
    CollectionItem.create_changeset(collection_item, attrs)
  end

  def change(%CollectionItem{} = collection_item, attrs) do
    CollectionItem.update_changeset(collection_item, attrs)
  end

  def new_for_printing(scryfall_id) when is_binary(scryfall_id) do
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

  def create(attrs) when is_map(attrs) do
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

  def update(%CollectionItem{} = item, attrs) when is_map(attrs) do
    attrs = ItemAttrs.normalize(attrs)

    item
    |> CollectionItem.update_changeset(attrs)
    |> ItemAttrs.validate_finish_available()
    |> Repo.update()
  end

  def list_printings(%CollectionItem{printing: %{card: %{oracle_id: oracle_id}}}) do
    Search.list_printings_for_oracle_id(oracle_id)
  end

  def list_printings(%CollectionItem{printing: %{oracle_id: oracle_id}}) do
    Search.list_printings_for_oracle_id(oracle_id)
  end

  def list_printings(%CollectionItem{scryfall_id: scryfall_id}) do
    case Search.get_printing_by_scryfall_id(scryfall_id) do
      nil -> []
      %Printing{oracle_id: oracle_id} -> Search.list_printings_for_oracle_id(oracle_id)
    end
  end

  def switch_printing(%CollectionItem{} = item, scryfall_id) when is_binary(scryfall_id) do
    attrs = ItemAttrs.switch(item, scryfall_id)

    item
    |> CollectionItem.switch_printing_changeset(attrs)
    |> ItemAttrs.validate_finish_available()
    |> Repo.update()
  end

  def delete(%CollectionItem{} = item), do: Repo.delete(item)

  def add_printing(scryfall_id, attrs \\ %{})
      when is_binary(scryfall_id) and is_map(attrs) do
    attrs
    |> Map.new(fn {key, value} -> {to_string(key), value} end)
    |> Map.put("scryfall_id", scryfall_id)
    |> create()
  end
end
