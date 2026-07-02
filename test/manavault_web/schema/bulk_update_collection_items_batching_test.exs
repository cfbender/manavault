defmodule ManavaultWeb.Schema.BulkUpdateCollectionItemsBatchingTest do
  use ManavaultWeb.ConnCase

  alias Absinthe.Relay.Node
  alias Manavault.Catalog

  @item_count 6

  test "bulk update fetches targets in one query and doesn't re-fetch per item", %{conn: conn} do
    assert {:ok, %{cards_count: 1, printings_count: 1}} =
             Catalog.import_cards([
               %{
                 "id" => "scryfall-bulk-batch",
                 "oracle_id" => "oracle-bulk-batch",
                 "name" => "Bulk Batch",
                 "type_line" => "Artifact",
                 "collector_number" => "1",
                 "set" => "bbt",
                 "set_name" => "Bulk Batch Set",
                 "lang" => "en",
                 "image_uris" => %{},
                 "finishes" => ["nonfoil", "foil"],
                 "legalities" => %{}
               }
             ])

    ids =
      for _index <- 1..@item_count do
        {:ok, item} =
          Catalog.create_collection_item(%{scryfall_id: "scryfall-bulk-batch", quantity: 1})

        Node.to_global_id(:collection_item, item.id, ManavaultWeb.Schema)
      end

    {resp, query_count} =
      count_repo_queries(fn ->
        post(conn, "/api/graphql", %{
          "query" => """
          mutation Bulk($ids: [ID!]!, $input: CollectionItemUpdateInput!) {
            bulkUpdateCollectionItems(ids: $ids, input: $input) {
              collectionItems { id finish }
            }
          }
          """,
          "variables" => %{"ids" => ids, "input" => %{"finish" => "foil"}}
        })
      end)

    items =
      get_in(json_response(resp, 200), ["data", "bulkUpdateCollectionItems", "collectionItems"])

    assert length(items) == @item_count
    assert Enum.all?(items, &(&1["finish"] == "foil"))

    # One fetch + per-item update/validate + a couple of batched preloads. The
    # old path additionally re-fetched each item (get + 2 preloads) per item,
    # pushing this to ~6 queries/item (~36 here); staying under 3x guards that.
    assert query_count <= @item_count * 3 + 4
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
