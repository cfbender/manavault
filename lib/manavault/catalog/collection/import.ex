defmodule Manavault.Catalog.Collection.Import do
  @moduledoc false

  alias Manavault.Catalog.Collection.AutoSort
  alias Manavault.Catalog.{CollectionImport, Location, Printing, Search}
  alias Manavault.Repo

  def preview(text, opts \\ []) when is_binary(text) and is_list(opts) do
    location_id = Keyword.get(opts, :location_id)
    format = Keyword.get(opts, :format, :auto)
    file_name = Keyword.get(opts, :file_name)

    with {:ok, normalized_location_id} <- normalize_location_id(location_id),
         {:ok, rows} <- CollectionImport.parse(text, format: format, file_name: file_name) do
      import_rows =
        Enum.map(rows, fn {row, row_number} ->
          row
          |> CollectionImport.attrs()
          |> preview_row(row_number, normalized_location_id)
        end)

      {:ok, preview_result(import_rows, normalized_location_id)}
    end
  end

  def run(text, opts, create_item) when is_binary(text) and is_list(opts) do
    with {:ok, %{rows: rows} = preview} <- preview(text, opts) do
      import_preview(%{preview | rows: rows}, create_item, opts)
    end
  end

  def import_preview(%{rows: rows} = preview, create_item, opts \\ [])
      when is_list(rows) and is_function(create_item, 1) and is_list(opts) do
    Repo.transact(fn ->
      result =
        Enum.reduce(rows, %{imported: 0, skipped: 0, item_ids: []}, fn row, result ->
          case row.status do
            :exact ->
              case create_item.(row.attrs) do
                {:ok, item} ->
                  result
                  |> update_in([:imported], &(&1 + 1))
                  |> update_in([:item_ids], &[item.id | &1])

                {:error, changeset} ->
                  Repo.rollback(changeset)
              end

            _status ->
              update_in(result.skipped, &(&1 + 1))
          end
        end)

      result = maybe_auto_sort_imported(result, opts)

      {:ok, result}
    end)
    |> case do
      {:ok, result} -> {:ok, Map.merge(preview, result)}
      {:error, reason} -> {:error, reason}
    end
  end

  defp maybe_auto_sort_imported(%{item_ids: item_ids} = result, opts) do
    auto_sort? = Keyword.get(opts, :auto_sort, false)

    if auto_sort? do
      case AutoSort.run(item_ids: Enum.reverse(item_ids)) do
        {:ok, auto_sort_result} ->
          result
          |> Map.delete(:item_ids)
          |> Map.put(:auto_sorted, auto_sort_result.moved_count)

        {:error, reason} ->
          Repo.rollback(reason)
      end
    else
      result
      |> Map.delete(:item_ids)
      |> Map.put(:auto_sorted, 0)
    end
  end

  defp preview_row(attrs, row_number, location_id) do
    attrs = Map.put(attrs, "location_id", location_id)

    case candidates(attrs) do
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

  defp candidates(%{"scryfall_id" => scryfall_id}) when scryfall_id not in ["", nil] do
    case Search.get_printing_by_scryfall_id(scryfall_id) do
      nil -> []
      printing -> [printing]
    end
  end

  defp candidates(%{
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

  defp preview_result(rows, location_id) do
    %{
      location_id: location_id,
      rows: rows,
      total: length(rows),
      exact: Enum.count(rows, &(&1.status == :exact)),
      ambiguous: Enum.count(rows, &(&1.status == :ambiguous)),
      unresolved: Enum.count(rows, &(&1.status == :unresolved))
    }
  end

  defp normalize_location_id(nil), do: {:ok, nil}
  defp normalize_location_id(""), do: {:ok, nil}

  defp normalize_location_id(location_id) when is_integer(location_id) do
    if Repo.get(Location, location_id),
      do: {:ok, location_id},
      else: {:error, :location_not_found}
  end

  defp normalize_location_id(location_id) when is_binary(location_id) do
    case Integer.parse(location_id) do
      {id, ""} -> normalize_location_id(id)
      _invalid -> {:error, :location_not_found}
    end
  end
end
