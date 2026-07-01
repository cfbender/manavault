defmodule Manavault.Catalog.Collection.ImportPreviewBatchingTest do
  use Manavault.DataCase, async: true

  alias Manavault.Catalog
  alias Manavault.Catalog.Collection.Import

  @row_count 6

  setup do
    cards =
      for index <- 1..@row_count do
        %{
          "id" => "scryfall-import-batch-#{index}",
          "oracle_id" => "oracle-import-batch-#{index}",
          "name" => "Import Batch #{index}",
          "type_line" => "Artifact",
          "collector_number" => "#{index}",
          "set" => "ibt",
          "set_name" => "Import Batch Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      end

    assert {:ok, %{cards_count: @row_count}} = Catalog.import_cards(cards)
    :ok
  end

  test "scryfall_id preview resolves rows in bulk instead of one query per row" do
    csv =
      "Quantity,Scryfall ID\n" <>
        (1..@row_count
         |> Enum.map_join("\n", fn index -> "1,scryfall-import-batch-#{index}" end)) <> "\n"

    {result, query_count} =
      count_repo_queries(fn -> Import.preview(csv, format: :csv) end)

    assert {:ok, preview} = result
    assert preview.total == @row_count
    assert preview.exact == @row_count

    for row <- preview.rows do
      assert row.status == :exact
      assert %Manavault.Catalog.Card{} = row.printing.card
    end

    # Bulk: a fixed handful of queries regardless of row count. The old path
    # issued ~2 queries per row (Repo.get + card preload).
    assert query_count <= 6
  end

  defp count_repo_queries(fun) when is_function(fun, 0) do
    caller = self()
    ref = make_ref()
    handler_id = {__MODULE__, ref}

    :ok =
      :telemetry.attach(
        handler_id,
        [:manavault, :repo, :query],
        fn _event, _measurements, metadata, _config ->
          unless metadata[:source] == "schema_migrations" do
            send(caller, {ref, :query})
          end
        end,
        nil
      )

    try do
      result = fun.()
      {result, collect_query_count(ref, 0)}
    after
      :telemetry.detach(handler_id)
      collect_query_count(ref, 0)
    end
  end

  defp collect_query_count(ref, count) do
    receive do
      {^ref, :query} -> collect_query_count(ref, count + 1)
    after
      0 -> count
    end
  end
end
