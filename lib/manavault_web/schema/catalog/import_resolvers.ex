defmodule ManavaultWeb.Schema.Catalog.ImportResolvers do
  @moduledoc false

  alias Manavault.Catalog
  alias ManavaultWeb.Schema.Catalog.Errors
  alias ManavaultWeb.Schema.RelayHelpers

  def preview_collection_import(_parent, %{input: input}, resolution) do
    with {:ok, location_id} <- import_location_id(Map.get(input, :location_id), resolution) do
      case Catalog.preview_collection_import(input.text,
             format: Map.get(input, :format, :auto),
             file_name: Map.get(input, :file_name),
             location_id: location_id
           ) do
        {:ok, preview} -> {:ok, preview}
        {:error, reason} -> {:error, Errors.import_error(reason)}
      end
    end
  end

  def commit_collection_import(_parent, %{input: %{rows: rows} = input}, resolution) do
    with {:ok, rows} <- collection_import_rows(rows, resolution) do
      case Catalog.import_collection_preview(%{rows: rows},
             auto_sort: Map.get(input, :auto_sort, false)
           ) do
        {:ok, result} ->
          {:ok,
           %{
             imported: result.imported,
             skipped: result.skipped,
             auto_sorted: Map.get(result, :auto_sorted, 0)
           }}

        {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
          {:error, Errors.changeset_error_message(changeset)}

        {:error, reason} ->
          {:error, Errors.import_error(reason)}
      end
    end
  end

  defp collection_import_rows(rows, resolution) do
    Enum.reduce_while(rows, {:ok, []}, fn row, {:ok, parsed_rows} ->
      case collection_import_row(row, resolution) do
        {:ok, parsed_row} -> {:cont, {:ok, [parsed_row | parsed_rows]}}
        {:error, message} -> {:halt, {:error, message}}
      end
    end)
    |> case do
      {:ok, parsed_rows} -> {:ok, Enum.reverse(parsed_rows)}
      {:error, message} -> {:error, message}
    end
  end

  defp collection_import_row(row, resolution) do
    attrs =
      row.attrs
      |> Map.new(fn {key, value} -> {to_string(key), value} end)

    with {:ok, attrs} <- put_import_location_id(attrs, resolution) do
      {:ok,
       %{
         row_number: row.row_number,
         status: collection_import_status(row.status),
         attrs: attrs,
         candidates: [],
         printing: nil
       }}
    end
  end

  defp put_import_location_id(attrs, resolution) do
    with {:ok, location_id} <- import_location_id(Map.get(attrs, "location_id"), resolution) do
      {:ok, Map.put(attrs, "location_id", location_id)}
    end
  end

  defp import_location_id(nil, _resolution), do: {:ok, nil}
  defp import_location_id("", _resolution), do: {:ok, nil}
  defp import_location_id("unfiled", _resolution), do: {:ok, nil}
  defp import_location_id(id, _resolution) when is_integer(id), do: {:ok, id}

  defp import_location_id(id, resolution) when is_binary(id) do
    case Integer.parse(id) do
      {parsed, ""} ->
        {:ok, parsed}

      _not_integer ->
        with {:ok, id} <- RelayHelpers.optional_node_id(id, :location, resolution) do
          {:ok, normalize_unfiled_location_id(id)}
        end
    end
  end

  defp normalize_unfiled_location_id("unfiled"), do: nil
  defp normalize_unfiled_location_id(id), do: id

  defp collection_import_status(status) when status in [:exact, :ambiguous, :unresolved],
    do: status

  defp collection_import_status("exact"), do: :exact
  defp collection_import_status("ambiguous"), do: :ambiguous
  defp collection_import_status("unresolved"), do: :unresolved
  defp collection_import_status(_status), do: :unresolved
end
