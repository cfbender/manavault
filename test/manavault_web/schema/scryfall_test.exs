defmodule ManavaultWeb.Schema.ScryfallTest do
  use ManavaultWeb.ConnCase
  use Oban.Testing, repo: Manavault.Repo, engine: Oban.Engines.Lite

  alias Manavault.Catalog.{ScryfallAssetsWorker, ScryfallCatalogWorker}

  test "Scryfall reload mutations queue worker jobs", %{conn: conn} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation {
          reloadScryfallCatalog { reloadResult { status message } }
          reloadScryfallAssets { reloadResult { status message } }
        }
        """
      })

    assert %{
             "data" => %{
               "reloadScryfallCatalog" => %{
                 "reloadResult" => %{
                   "status" => "queued",
                   "message" => catalog_message
                 }
               },
               "reloadScryfallAssets" => %{
                 "reloadResult" => %{
                   "status" => "queued",
                   "message" => asset_message
                 }
               }
             }
           } = json_response(conn, 200)

    assert catalog_message == "Scryfall catalog reload queued."
    assert asset_message =~ "set icon"
    assert_enqueued(worker: ScryfallCatalogWorker, args: %{force: true})
    assert_enqueued(worker: ScryfallAssetsWorker, args: %{force: true})
  end
end
