defmodule ManavaultWeb.Schema.PricingTest do
  use ManavaultWeb.ConnCase
  use Oban.Testing, repo: Manavault.Repo, engine: Oban.Engines.Lite

  alias Manavault.Pricing.VendorSyncWorker

  test "vendor price sync mutation queues an Oban job", %{conn: conn} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation {
          syncVendorPrices {
            pricingSettings { source }
          }
        }
        """
      })

    assert %{
             "data" => %{
               "syncVendorPrices" => %{
                 "pricingSettings" => %{"source" => _source}
               }
             }
           } = json_response(conn, 200)

    assert_enqueued(worker: VendorSyncWorker, args: %{force: true})
  end
end
