defmodule ManavaultWeb.Schema.ScryfallTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog.ScryfallSyncWorker

  test "Scryfall reload mutations queue worker jobs", %{conn: conn} do
    test_pid = self()

    start_supervised!(
      {ScryfallSyncWorker,
       [
         initial_delay: :timer.hours(24),
         sync_fun: fn ->
           send(test_pid, :catalog_sync)
           {:ok, %{printings_count: 10}}
         end,
         asset_sync_fun: fn ->
           send(test_pid, :asset_sync)
           {:ok, %{symbols_count: 2, sets_count: 3}}
         end
       ]}
    )

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation {
          reloadScryfallCatalog { status message }
          reloadScryfallAssets { status message }
        }
        """
      })

    assert %{
             "data" => %{
               "reloadScryfallCatalog" => %{
                 "status" => "queued",
                 "message" => catalog_message
               },
               "reloadScryfallAssets" => %{
                 "status" => "queued",
                 "message" => asset_message
               }
             }
           } = json_response(conn, 200)

    assert catalog_message == "Scryfall catalog reload queued."
    assert asset_message =~ "set icon"
    assert_receive :catalog_sync
    assert_receive :asset_sync
  end
end
