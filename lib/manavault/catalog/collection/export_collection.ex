defmodule Manavault.Catalog.Collection.ExportCollection do
  @moduledoc false

  alias Manavault.Catalog.CardCollection.ItemQueries
  alias Manavault.Catalog.Collection.Export
  alias Manavault.Repo

  @stream_batch_size 100

  def csv(filters) when is_list(filters), do: render(filters, &Export.csv/1)
  def text(filters) when is_list(filters), do: render(filters, &Export.text/1)

  defp render(filters, formatter) do
    Repo.transaction(fn ->
      filters
      |> ItemQueries.stream_items(max_rows: @stream_batch_size)
      |> formatter.()
    end)
  end
end
