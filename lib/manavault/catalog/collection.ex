defmodule Manavault.Catalog.Collection do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{
    CardCollection,
    CollectionImport,
    CollectionItem,
    CSV,
    Finishes,
    Location,
    Price,
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
        CollectionItem.create_changeset(%CollectionItem{}, default_collection_attrs(printing))
    end
  end

  def create_collection_item(attrs) when is_map(attrs) do
    attrs = attrs |> normalize_collection_item_attrs() |> default_purchase_price_cents()

    %CollectionItem{}
    |> CollectionItem.create_changeset(attrs)
    |> validate_collection_finish_available()
    |> Repo.insert()
  end

  def update_collection_item(%CollectionItem{} = collection_item, attrs) when is_map(attrs) do
    attrs = normalize_collection_item_attrs(attrs)

    collection_item
    |> CollectionItem.update_changeset(attrs)
    |> validate_collection_finish_available()
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
    attrs = switch_collection_attrs(collection_item, scryfall_id)

    collection_item
    |> CollectionItem.switch_printing_changeset(attrs)
    |> validate_collection_finish_available()
    |> Repo.update()
  end

  def delete_collection_item(%CollectionItem{} = collection_item) do
    Repo.delete(collection_item)
  end

  def list_locations(_opts \\ []) do
    Location
    |> order_by(asc: :name)
    |> Repo.all()
    |> Repo.preload(cover_printing: :card)
  end

  def list_location_options do
    Location
    |> order_by(asc: :name)
    |> select([location], %{id: location.id, name: location.name})
    |> Repo.all()
  end

  def get_location!(id) do
    Location |> Repo.get!(id)
  end

  def get_location_with_items!(id) do
    Location
    |> Repo.get!(id)
    |> Repo.preload(
      cover_printing: :card,
      collection_items:
        from(item in CollectionItem,
          join: printing in assoc(item, :printing),
          join: card in assoc(printing, :card),
          preload: [printing: {printing, card: card}],
          order_by: [asc: card.name, asc: printing.set_code, asc: printing.collector_number]
        )
    )
  end

  def list_collection_items_by_location(location_id, filters \\ [], opts \\ [])
      when is_list(filters) do
    CardCollection.list_items_by_location(location_id, filters, opts)
  end

  def change_location(location, attrs \\ %{}) do
    Location.changeset(location, attrs)
  end

  def create_location(attrs \\ %{}) do
    %Location{}
    |> Location.changeset(attrs)
    |> Repo.insert()
  end

  def update_location(%Location{} = location, attrs) do
    location
    |> Location.changeset(attrs)
    |> Repo.update()
  end

  def delete_location(%Location{} = location) do
    Repo.delete(location)
  end

  def add_printing_to_collection(scryfall_id, attrs \\ %{})
      when is_binary(scryfall_id) and is_map(attrs) do
    attrs
    |> Map.new(fn {key, value} -> {to_string(key), value} end)
    |> Map.put("scryfall_id", scryfall_id)
    |> create_collection_item()
  end

  def preview_collection_import(text, opts \\ []) when is_binary(text) and is_list(opts) do
    location_id = Keyword.get(opts, :location_id)
    format = Keyword.get(opts, :format, :auto)
    file_name = Keyword.get(opts, :file_name)

    with {:ok, normalized_location_id} <- normalize_import_location_id(location_id),
         {:ok, rows} <- CollectionImport.parse(text, format: format, file_name: file_name) do
      import_rows =
        Enum.map(rows, fn {row, row_number} ->
          row
          |> CollectionImport.attrs()
          |> preview_collection_import_row(row_number, normalized_location_id)
        end)

      {:ok, collection_import_preview(import_rows, normalized_location_id)}
    end
  end

  def import_collection(text, opts \\ []) when is_binary(text) and is_list(opts) do
    with {:ok, %{rows: rows} = preview} <- preview_collection_import(text, opts) do
      import_collection_preview(%{preview | rows: rows})
    end
  end

  def import_collection_preview(%{rows: rows} = preview) when is_list(rows) do
    Repo.transaction(fn ->
      Enum.reduce(rows, %{imported: 0, skipped: 0}, fn row, result ->
        case row.status do
          :exact ->
            case create_collection_item(row.attrs) do
              {:ok, _item} -> update_in(result.imported, &(&1 + 1))
              {:error, changeset} -> Repo.rollback(changeset)
            end

          _status ->
            update_in(result.skipped, &(&1 + 1))
        end
      end)
    end)
    |> case do
      {:ok, result} -> {:ok, Map.merge(preview, result)}
      {:error, reason} -> {:error, reason}
    end
  end

  def export_collection_csv(filters \\ []) when is_list(filters) do
    rows =
      filters
      |> list_collection_items(limit: 100_000)
      |> Enum.map(fn item ->
        [
          item.quantity,
          item.printing.card.name,
          item.printing.set_code,
          item.printing.collector_number,
          item.finish,
          item.condition,
          item.language,
          if(item.location_assoc, do: item.location_assoc.name, else: ""),
          item |> Price.collection_item_purchase_price_cents() |> Price.format_cents()
        ]
      end)

    [
      [
        "Quantity",
        "Card Name",
        "Set Code",
        "Collector Number",
        "Finish",
        "Condition",
        "Language",
        "Location",
        "Purchase Price"
      ]
      | rows
    ]
    |> Enum.map_join("\n", &CSV.row/1)
  end

  def export_collection_text(filters \\ []) when is_list(filters) do
    filters
    |> list_collection_items(limit: 100_000)
    |> Enum.map_join("\n", &collection_text_line/1)
  end

  defp collection_text_line(%CollectionItem{} = item) do
    [
      "#{item.quantity}x",
      item.printing.card.name,
      collection_text_printing(item.printing),
      collection_text_finish(item.finish),
      collection_text_condition(item.condition),
      collection_text_language(item.language)
    ]
    |> Enum.reject(&(&1 in [nil, ""]))
    |> Enum.join(" ")
  end

  defp collection_text_printing(%Printing{} = printing) do
    "(#{String.upcase(printing.set_code || "")}) #{printing.collector_number}"
  end

  defp collection_text_finish("nonfoil"), do: nil
  defp collection_text_finish(finish) when is_binary(finish), do: "[#{finish}]"
  defp collection_text_finish(_finish), do: nil

  defp collection_text_condition("near_mint"), do: nil
  defp collection_text_condition(condition) when is_binary(condition), do: "{#{condition}}"
  defp collection_text_condition(_condition), do: nil

  defp collection_text_language("en"), do: nil
  defp collection_text_language(language) when is_binary(language), do: "<#{language}>"
  defp collection_text_language(_language), do: nil

  defp preview_collection_import_row(attrs, row_number, location_id) do
    attrs = Map.put(attrs, "location_id", location_id)

    case collection_import_candidates(attrs) do
      [%Printing{} = printing] ->
        %{
          row_number: row_number,
          status: :exact,
          attrs: Map.put(attrs, "scryfall_id", printing.scryfall_id),
          printing: Repo.preload(printing, :card),
          candidates: []
        }

      [] ->
        %{
          row_number: row_number,
          status: :unresolved,
          attrs: attrs,
          printing: nil,
          candidates: []
        }

      candidates ->
        %{
          row_number: row_number,
          status: :ambiguous,
          attrs: attrs,
          printing: nil,
          candidates: Enum.map(candidates, &Repo.preload(&1, :card))
        }
    end
  end

  defp collection_import_candidates(%{"scryfall_id" => scryfall_id})
       when scryfall_id not in ["", nil] do
    case Search.get_printing_by_scryfall_id(scryfall_id) do
      nil -> []
      printing -> [printing]
    end
  end

  defp collection_import_candidates(%{
         "name" => name,
         "set_code" => set_code,
         "collector_number" => collector_number
       }) do
    filters = [name: name, set_code: set_code, collector_number: collector_number]

    filters
    |> Search.search_printings(limit: 6)
    |> Enum.filter(fn printing ->
      (set_code == "" || printing.set_code == String.downcase(set_code)) &&
        (collector_number == "" || printing.collector_number == collector_number)
    end)
  end

  defp collection_import_preview(rows, location_id) do
    %{
      location_id: location_id,
      rows: rows,
      total: length(rows),
      exact: Enum.count(rows, &(&1.status == :exact)),
      ambiguous: Enum.count(rows, &(&1.status == :ambiguous)),
      unresolved: Enum.count(rows, &(&1.status == :unresolved))
    }
  end

  defp normalize_import_location_id(nil), do: {:ok, nil}
  defp normalize_import_location_id(""), do: {:ok, nil}

  defp normalize_import_location_id(location_id) when is_integer(location_id) do
    if Repo.get(Location, location_id),
      do: {:ok, location_id},
      else: {:error, :location_not_found}
  end

  defp normalize_import_location_id(location_id) when is_binary(location_id) do
    case Integer.parse(location_id) do
      {id, ""} -> normalize_import_location_id(id)
      _invalid -> {:error, :location_not_found}
    end
  end

  defp switch_collection_attrs(%CollectionItem{} = collection_item, scryfall_id) do
    case Search.get_printing_by_scryfall_id(scryfall_id) do
      nil ->
        %{
          "scryfall_id" => scryfall_id,
          "language" => collection_item.language,
          "finish" => collection_item.finish
        }

      %Printing{} = printing ->
        %{
          "scryfall_id" => scryfall_id,
          "language" => printing.lang || collection_item.language || "en",
          "finish" => Finishes.preferred(printing, collection_item.finish)
        }
    end
  end

  defp default_collection_attrs(%Printing{} = printing) do
    %{
      scryfall_id: printing.scryfall_id,
      language: printing.lang || "en",
      finish: Finishes.first(printing.finishes),
      quantity: 1,
      condition: "near_mint",
      purchase_price_cents:
        Price.price_cents_for_printing(printing, Finishes.first(printing.finishes))
    }
  end

  defp normalize_collection_item_attrs(attrs) do
    attrs
    |> Map.new(fn {key, value} -> {to_string(key), value} end)
    |> normalize_purchase_price_cents()
  end

  defp normalize_purchase_price_cents(%{"purchase_price_cents" => value} = attrs)
       when is_binary(value) do
    cond do
      String.trim(value) == "" ->
        Map.put(attrs, "purchase_price_cents", nil)

      cents = Price.parse_cents(value) ->
        Map.put(attrs, "purchase_price_cents", cents)

      true ->
        attrs
    end
  end

  defp normalize_purchase_price_cents(attrs), do: attrs

  defp default_purchase_price_cents(%{"purchase_price_cents" => value} = attrs)
       when value not in [nil, ""],
       do: attrs

  defp default_purchase_price_cents(attrs) do
    scryfall_id = Map.get(attrs, "scryfall_id")

    with true <- is_binary(scryfall_id),
         %Printing{} = printing <- Search.get_printing_by_scryfall_id(scryfall_id),
         finish <- Map.get(attrs, "finish") || Finishes.first(printing.finishes),
         cents when is_integer(cents) <- Price.price_cents_for_printing(printing, finish) do
      Map.put(attrs, "purchase_price_cents", cents)
    else
      _unknown -> attrs
    end
  end

  defp validate_collection_finish_available(changeset) do
    scryfall_id = Ecto.Changeset.get_field(changeset, :scryfall_id)
    finish = Ecto.Changeset.get_field(changeset, :finish)

    with true <- changeset.valid?,
         true <- is_binary(scryfall_id),
         true <- is_binary(finish),
         %Printing{} = printing <- Repo.get(Printing, scryfall_id),
         finishes <- Finishes.list(printing.finishes),
         false <- finish in finishes do
      Ecto.Changeset.add_error(changeset, :finish, "is not available for this printing")
    else
      _other -> changeset
    end
  end
end
