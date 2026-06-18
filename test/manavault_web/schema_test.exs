defmodule ManavaultWeb.SchemaTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog

  test "home summary is available over GraphQL", %{conn: conn} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          homeSummary {
            collectionCount
            locationCount
            deckCount
            scanSessionCount
          }
        }
        """
      })

    assert %{
             "data" => %{
               "homeSummary" => %{
                 "collectionCount" => 0,
                 "locationCount" => 0,
                 "deckCount" => 0,
                 "scanSessionCount" => 0
               }
             }
           } = json_response(conn, 200)
  end

  test "collection query resolves locations and card images", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-1",
          "oracle_id" => "oracle-1",
          "name" => "Test Card",
          "type_line" => "Creature",
          "collector_number" => "1",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "image_uris" => %{"normal" => "https://example.test/card.jpg"},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    printing = Catalog.get_printing_by_scryfall_id("scryfall-printing-1")

    {:ok, location} =
      Catalog.create_location(%{
        name: "Binder",
        kind: "binder",
        cover_scryfall_id: printing.scryfall_id
      })

    {:ok, _item} =
      Catalog.create_collection_item(%{
        scryfall_id: printing.scryfall_id,
        location_id: location.id
      })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          locations {
            name
            coverPrinting { imageUrl card { name } }
          }
          collectionItems {
            printing { imageUrl card { name } }
            location { name }
          }
        }
        """
      })

    assert %{
             "data" => %{
               "locations" => [
                 %{
                   "coverPrinting" => %{
                     "card" => %{"name" => "Test Card"},
                     "imageUrl" => "https://example.test/card.jpg"
                   }
                 }
               ],
               "collectionItems" => [
                 %{
                   "location" => %{"name" => "Binder"},
                   "printing" => %{
                     "card" => %{"name" => "Test Card"},
                     "imageUrl" => "https://example.test/card.jpg"
                   }
                 }
               ]
             }
           } = json_response(conn, 200)
  end

  test "card name suggestions expose fuzzy catalog matches", %{conn: conn} do
    {:ok, %{cards_count: 2, printings_count: 2}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-1",
          "oracle_id" => "oracle-1",
          "name" => "Black Lotus",
          "type_line" => "Artifact",
          "collector_number" => "232",
          "set" => "lea",
          "set_name" => "Limited Edition Alpha",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        },
        %{
          "id" => "scryfall-printing-2",
          "oracle_id" => "oracle-2",
          "name" => "Time Walk",
          "type_line" => "Sorcery",
          "collector_number" => "84",
          "set" => "lea",
          "set_name" => "Limited Edition Alpha",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          cardNameSuggestions(q: "blak lotu", limit: 5)
        }
        """
      })

    assert %{
             "data" => %{
               "cardNameSuggestions" => ["Black Lotus"]
             }
           } = json_response(conn, 200)
  end

  test "scan sessions expose review counts", %{conn: conn} do
    {:ok, session} =
      Catalog.create_scan_session(%{
        name: "Inbox",
        default_condition: "near_mint",
        default_language: "en",
        default_finish: "nonfoil"
      })

    {:ok, _review_item} = Catalog.create_scan_item(session, %{status: "needs_review"})
    {:ok, _accepted_item} = Catalog.create_scan_item(session, %{status: "accepted"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          scanSessions {
            name
            itemCount
            reviewCount
          }
        }
        """
      })

    assert %{
             "data" => %{
               "scanSessions" => [
                 %{"name" => "Inbox", "itemCount" => 2, "reviewCount" => 1}
               ]
             }
           } = json_response(conn, 200)
  end
end
