defmodule ManavaultWeb.Schema.ScannerPrintingsTest do
  use ManavaultWeb.ConnCase
  use Manavault.CatalogTestFixtures

  alias Manavault.Catalog

  test "returns every card printing with illustration matches first and owned counts", %{
    conn: conn
  } do
    cards = [
      printing("scan-base", "art-a", "2020-01-01", "1"),
      printing("same-art", "art-a", "2022-01-01", "2"),
      printing("other-art", "art-b", "2024-01-01", "3")
    ]

    {:ok, _result} = Catalog.import_cards(cards)
    {:ok, _item} = Catalog.create_collection_item(%{scryfall_id: "same-art", quantity: 2})
    {:ok, list} = Catalog.create_location(%{name: "Wishlist", kind: "list"})

    {:ok, _item} =
      Catalog.create_collection_item(%{
        scryfall_id: "same-art",
        quantity: 4,
        location_id: list.id
      })

    results = query(conn, "scan-base-1", "art-a")

    assert Enum.map(results, & &1["scryfallId"]) == ["same-art", "scan-base", "other-art"]
    assert Enum.map(results, & &1["ownedCount"]) == [2, 0, 0]
    assert Enum.all?(results, &(&1["card"]["name"] == "Black Lotus"))
    assert Enum.all?(results, &(&1["promo"] == false))
  end

  test "resolves scanned tokens with their layout and both faces", %{conn: conn} do
    single =
      Map.merge(printing("token-single", "art-single", "2024-01-01", "1"), %{
        "oracle_id" => "oracle-token-single",
        "name" => "Treasure",
        "layout" => "token",
        "set" => "tfdc",
        "set_type" => "token",
        "image_uris" => %{"normal" => "https://example.test/treasure.jpg"}
      })

    # Scryfall puts a double-faced card's images on its faces, never at the top level.
    double =
      "token-double"
      |> printing("art-double", "2024-01-01", "2")
      |> Map.delete("image_uris")
      |> Map.merge(%{
        "oracle_id" => "oracle-token-double",
        "name" => "Angel // Soldier",
        "layout" => "double_faced_token",
        "set" => "tfdc",
        "set_type" => "token",
        "card_faces" => [
          %{"name" => "Angel", "image_uris" => %{"normal" => "https://example.test/angel.jpg"}},
          %{
            "name" => "Soldier",
            "image_uris" => %{"normal" => "https://example.test/soldier.jpg"}
          }
        ]
      })

    {:ok, _result} = Catalog.import_cards([single, double])

    assert [
             %{
               "scryfallId" => "token-single",
               "backImageUrl" => nil,
               "card" => %{"layout" => "token"}
             }
           ] = query(conn, "token-single", nil)

    assert [
             %{
               "scryfallId" => "token-double",
               "imageUrl" => "https://example.test/angel.jpg",
               "backImageUrl" => "https://example.test/soldier.jpg",
               "card" => %{"layout" => "double_faced_token"}
             }
           ] = query(conn, "token-double", nil)
  end

  test "exposes promo flags and finish prices", %{conn: conn} do
    {:ok, _result} =
      Catalog.import_cards([
        "promo-art"
        |> printing("promo-art", "2024-01-01", "1p")
        |> Map.merge(%{"promo" => true, "prices" => %{"usd" => "1.50", "usd_foil" => "12.25"}})
      ])

    assert [%{"promo" => true, "foilCents" => 1225}] = query(conn, "promo-art", nil)
  end

  test "falls back from an unknown Scryfall ID to its illustration", %{conn: conn} do
    {:ok, _result} =
      Catalog.import_cards([
        printing("fallback", "fallback-art", "2023-01-01", "1"),
        printing("older", "other-art", "2020-01-01", "2")
      ])

    assert ["fallback", "older"] ==
             conn
             |> query("unknown", "fallback-art")
             |> Enum.map(& &1["scryfallId"])
  end

  test "strips only a face suffix that follows a complete UUID", %{conn: conn} do
    digits_uuid = "0a1b2c3d-0000-4000-8000-123456789012"

    {:ok, _result} =
      Catalog.import_cards([printing(digits_uuid, "digits-art", "2021-01-01", "1")])

    assert [%{"scryfallId" => ^digits_uuid}] = query(conn, digits_uuid, nil)
    assert [%{"scryfallId" => ^digits_uuid}] = query(conn, digits_uuid <> "-1", nil)
  end

  test "returns an empty list when neither identifier resolves", %{conn: conn} do
    assert [] = query(conn, "unknown", "missing-art")
  end

  test "lists the illustrations printed in the locked sets", %{conn: conn} do
    {:ok, _result} =
      Catalog.import_cards([
        printing("fra-1", "art-fra", "2026-08-01", "1") |> Map.put("set", "fra"),
        printing("spg-1", "art-spg", "2026-08-01", "2") |> Map.put("set", "spg"),
        printing("dsk-1", "art-dsk", "2024-09-01", "3") |> Map.put("set", "dsk")
      ])

    body =
      conn
      |> post("/api/graphql", %{
        "query" => "query($s: [String!]!) { scannerSetIllustrations(setCodes: $s) }",
        "variables" => %{"s" => ["FRA", "spg", "none"]}
      })
      |> json_response(200)

    assert Enum.sort(body["data"]["scannerSetIllustrations"]) == ["art-fra", "art-spg"]
  end

  defp query(conn, scryfall_id, illustration_id) do
    body =
      conn
      |> post("/api/graphql", %{
        "query" => """
        query ScannerPrintings($scryfallId: ID!, $illustrationId: ID) {
          scannerPrintings(scryfallId: $scryfallId, illustrationId: $illustrationId) {
            scryfallId illustrationId ownedCount promo imageUrl backImageUrl
            foilCents: priceCents(finish: "foil")
            card { name layout }
          }
        }
        """,
        "variables" => %{"scryfallId" => scryfall_id, "illustrationId" => illustration_id}
      })
      |> json_response(200)

    assert is_nil(body["errors"])
    body["data"]["scannerPrintings"]
  end

  defp printing(id, illustration_id, released_at, collector_number) do
    black_lotus()
    |> Map.merge(%{
      "id" => id,
      "illustration_id" => illustration_id,
      "released_at" => released_at,
      "collector_number" => collector_number
    })
  end
end
