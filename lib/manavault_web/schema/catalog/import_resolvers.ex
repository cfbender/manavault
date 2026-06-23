defmodule ManavaultWeb.Schema.Catalog.ImportResolvers do
  @moduledoc false

  alias Manavault.Catalog
  alias ManavaultWeb.Schema.Catalog.Errors

  def preview_collection_import(_parent, %{input: input}, _resolution) do
    case Catalog.preview_collection_import(input.text,
           format: Map.get(input, :format, :auto),
           file_name: Map.get(input, :file_name),
           location_id: Map.get(input, :location_id)
         ) do
      {:ok, preview} -> {:ok, preview}
      {:error, reason} -> {:error, Errors.import_error(reason)}
    end
  end

  def commit_collection_import(_parent, %{input: %{rows: rows}}, _resolution) do
    case Catalog.import_collection_preview(%{rows: Enum.map(rows, &collection_import_row/1)}) do
      {:ok, result} ->
        {:ok, %{imported: result.imported, skipped: result.skipped}}

      {:error, changeset} when is_struct(changeset, Ecto.Changeset) ->
        {:error, Errors.changeset_error_message(changeset)}

      {:error, reason} ->
        {:error, Errors.import_error(reason)}
    end
  end

  defp collection_import_row(row) do
    %{
      row_number: row.row_number,
      status: collection_import_status(row.status),
      attrs:
        row.attrs
        |> Map.new(fn {key, value} -> {to_string(key), value} end)
        |> Map.update("location_id", nil, &location_import_id/1),
      candidates: [],
      printing: nil
    }
  end

  defp location_import_id(nil), do: nil
  defp location_import_id(""), do: nil
  defp location_import_id(id), do: id

  defp collection_import_status(status) when status in [:exact, :ambiguous, :unresolved],
    do: status

  defp collection_import_status("exact"), do: :exact
  defp collection_import_status("ambiguous"), do: :ambiguous
  defp collection_import_status("unresolved"), do: :unresolved
  defp collection_import_status(_status), do: :unresolved
end
