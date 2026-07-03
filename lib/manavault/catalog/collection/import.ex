defmodule Manavault.Catalog.Collection.Import do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.Collection.AutoSort
  alias Manavault.Catalog.{CollectionImport, Finishes, Location, Printing, Search}
  alias Manavault.Repo

  def preview(text, opts \\ []) when is_binary(text) and is_list(opts) do
    location_id = Keyword.get(opts, :location_id)
    format = Keyword.get(opts, :format, :auto)
    file_name = Keyword.get(opts, :file_name)
    purchase_price_cents = Keyword.get(opts, :purchase_price_cents)

    with {:ok, normalized_location_id} <- normalize_location_id(location_id),
         {:ok, default_purchase_price_cents} <-
           normalize_purchase_price_cents(purchase_price_cents),
         {:ok, rows} <- CollectionImport.parse(text, format: format, file_name: file_name) do
      prepared_rows =
        Enum.map(rows, fn {row, row_number} ->
          attrs =
            row
            |> CollectionImport.attrs()
            |> put_default_import_purchase_price(default_purchase_price_cents)

          {attrs, row_number}
        end)

      # Resolve every scryfall_id row in a single query instead of one lookup
      # (plus a card preload) per row.
      printings_by_scryfall_id = bulk_printings_by_scryfall_id(prepared_rows)

      import_rows =
        Enum.map(prepared_rows, fn {attrs, row_number} ->
          preview_row(attrs, row_number, normalized_location_id, printings_by_scryfall_id)
        end)

      {:ok, preview_result(import_rows, normalized_location_id)}
    end
  end

  defp bulk_printings_by_scryfall_id(prepared_rows) do
    scryfall_ids =
      prepared_rows
      |> Enum.map(fn {attrs, _row_number} -> Map.get(attrs, "scryfall_id") end)
      |> Enum.reject(&(&1 in ["", nil]))
      |> Enum.uniq()

    case scryfall_ids do
      [] ->
        %{}

      ids ->
        Printing
        |> where([printing], printing.scryfall_id in ^ids)
        |> preload(:card)
        |> Repo.all()
        |> Map.new(&{&1.scryfall_id, &1})
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
      result = import_preview_rows(rows, create_item)
      result = maybe_auto_sort_imported(result, opts)

      {:ok, result}
    end)
    |> case do
      {:ok, result} -> {:ok, Map.merge(preview, result)}
      {:error, reason} -> {:error, reason}
    end
  end

  def preview_auto_sort(%{rows: rows}, create_item, opts \\ [])
      when is_list(rows) and is_function(create_item, 1) and is_list(opts) do
    Repo.transact(fn ->
      result = import_preview_rows(rows, create_item)
      auto_sort_opts = Keyword.merge(opts, item_ids: Enum.reverse(result.item_ids), dry_run: true)

      case AutoSort.run(auto_sort_opts) do
        {:ok, auto_sort_result} ->
          Repo.rollback({:auto_sort_preview, auto_sort_result})

        {:error, reason} ->
          Repo.rollback(reason)
      end
    end)
    |> case do
      {:error, {:auto_sort_preview, auto_sort_result}} -> {:ok, auto_sort_result}
      {:error, reason} -> {:error, reason}
      {:ok, auto_sort_result} -> {:ok, auto_sort_result}
    end
  end

  defp import_preview_rows(rows, create_item) do
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

  defp put_default_import_purchase_price(attrs, cents) when is_integer(cents) do
    case Map.get(attrs, "purchase_price_cents") do
      nil -> Map.put(attrs, "purchase_price_cents", cents)
      _value -> attrs
    end
  end

  defp put_default_import_purchase_price(attrs, _cents), do: attrs

  defp preview_row(attrs, row_number, location_id, printings_by_scryfall_id) do
    attrs = Map.put(attrs, "location_id", location_id)

    # Both candidate sources (the bulk scryfall_id load and Search.search_printings)
    # already preload :card, so no per-row preload is needed here.
    case resolve_candidates(attrs, printings_by_scryfall_id) do
      [%Printing{} = printing] ->
        %{
          row_number: row_number,
          status: :exact,
          attrs:
            attrs
            |> Map.put("scryfall_id", printing.scryfall_id)
            |> Map.put("finish", Finishes.preferred(printing, Map.get(attrs, "finish"))),
          printing: printing,
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
          candidates: candidates
        }
    end
  end

  defp resolve_candidates(%{"scryfall_id" => scryfall_id}, printings_by_scryfall_id)
       when scryfall_id not in ["", nil] do
    case Map.get(printings_by_scryfall_id, scryfall_id) do
      nil -> []
      printing -> [printing]
    end
  end

  defp resolve_candidates(attrs, _printings_by_scryfall_id), do: candidates(attrs)

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

  defp candidates(_attrs), do: []

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

  defp normalize_purchase_price_cents(nil), do: {:ok, nil}
  defp normalize_purchase_price_cents(""), do: {:ok, nil}

  defp normalize_purchase_price_cents(cents) when is_integer(cents) and cents >= 0,
    do: {:ok, cents}

  defp normalize_purchase_price_cents(_cents), do: {:error, :invalid_purchase_price}

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
