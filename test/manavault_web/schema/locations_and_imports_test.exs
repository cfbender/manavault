defmodule ManavaultWeb.Schema.LocationsAndImportsTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog

  test "create location mutation creates a location with optional cover", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-3",
          "oracle_id" => "oracle-3",
          "name" => "Location Cover",
          "type_line" => "Artifact",
          "collector_number" => "3",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "image_uris" => %{"art_crop" => "https://example.test/location-cover.jpg"},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation CreateLocation($input: LocationInput!) {
          createLocation(input: $input) {
            id
            name
            kind
            description
            coverPrinting { scryfallId artCropUrl card { name } }
          }
        }
        """,
        "variables" => %{
          "input" => %{
            "name" => "New Box",
            "kind" => "box",
            "description" => "Sealed cards",
            "coverScryfallId" => "scryfall-printing-3"
          }
        }
      })

    assert %{
             "data" => %{
               "createLocation" => %{
                 "name" => "New Box",
                 "kind" => "box",
                 "description" => "Sealed cards",
                 "coverPrinting" => %{
                   "scryfallId" => "scryfall-printing-3",
                   "artCropUrl" => "https://example.test/location-cover.jpg",
                   "card" => %{"name" => "Location Cover"}
                 }
               }
             }
           } = json_response(conn, 200)
  end

  test "collection import preview commit and export are available over GraphQL", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-import",
          "oracle_id" => "oracle-import",
          "name" => "Imported Card",
          "type_line" => "Creature",
          "collector_number" => "9",
          "set" => "imp",
          "set_name" => "Import Set",
          "lang" => "en",
          "rarity" => "rare",
          "image_uris" => %{"normal" => "https://example.test/import.jpg"},
          "finishes" => ["nonfoil"],
          "prices" => %{"usd" => "4.25"},
          "legalities" => %{}
        }
      ])

    {:ok, location} = Catalog.create_location(%{name: "Import Binder", kind: "binder"})

    csv = """
    Quantity,Card Name,Set Code,Collector Number,Finish,Condition,Language,Purchase Price
    3,Imported Card,imp,9,nonfoil,NM,en,3.00
    """

    preview_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation PreviewCollectionImport($input: CollectionImportPreviewInput!) {
          previewCollectionImport(input: $input) {
            locationId
            total
            exact
            ambiguous
            unresolved
            rows {
              rowNumber
              status
              attrs { quantity finish condition language scryfallId locationId purchasePriceCents }
              printing { scryfallId card { name } }
              candidates { scryfallId }
            }
          }
        }
        """,
        "variables" => %{
          "input" => %{"text" => csv, "format" => "csv", "locationId" => location.id}
        }
      })

    assert %{
             "data" => %{
               "previewCollectionImport" => %{
                 "locationId" => _location_id,
                 "total" => 1,
                 "exact" => 1,
                 "ambiguous" => 0,
                 "unresolved" => 0,
                 "rows" =>
                   [
                     %{
                       "rowNumber" => 2,
                       "status" => "exact",
                       "attrs" => %{
                         "quantity" => 3,
                         "finish" => "nonfoil",
                         "condition" => "near_mint",
                         "language" => "en",
                         "scryfallId" => "scryfall-printing-import",
                         "purchasePriceCents" => 300
                       },
                       "printing" => %{
                         "scryfallId" => "scryfall-printing-import",
                         "card" => %{"name" => "Imported Card"}
                       }
                     }
                   ] = rows
               }
             }
           } = json_response(preview_conn, 200)

    commit_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation CommitCollectionImport($input: CollectionImportCommitInput!) {
          commitCollectionImport(input: $input) {
            imported
            skipped
          }
        }
        """,
        "variables" => %{
          "input" => %{
            "rows" =>
              Enum.map(rows, fn row ->
                %{
                  "rowNumber" => row["rowNumber"],
                  "status" => row["status"],
                  "attrs" => row["attrs"]
                }
              end)
          }
        }
      })

    assert %{
             "data" => %{
               "commitCollectionImport" => %{"imported" => 1, "skipped" => 0}
             }
           } = json_response(commit_conn, 200)

    export_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          collectionExportCsv
        }
        """
      })

    assert %{"data" => %{"collectionExportCsv" => export_csv}} = json_response(export_conn, 200)

    assert export_csv =~
             "Quantity,Card Name,Set Code,Collector Number,Finish,Condition,Language,Location,Purchase Price"

    assert export_csv =~ "3,Imported Card,imp,9,nonfoil,near_mint,en,Import Binder,$3"

    text_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query CollectionExportText($filters: CollectionItemFilters) {
          collectionExportText(filters: $filters)
        }
        """,
        "variables" => %{"filters" => %{"locationId" => location.id}}
      })

    assert %{"data" => %{"collectionExportText" => export_text}} = json_response(text_conn, 200)
    assert export_text == "3x Imported Card (IMP) 9"
  end

  test "update location mutation updates location fields", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-2",
          "oracle_id" => "oracle-2",
          "name" => "Cover Card",
          "type_line" => "Creature",
          "collector_number" => "2",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "image_uris" => %{"art_crop" => "https://example.test/cover-art.jpg"},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, location} = Catalog.create_location(%{name: "Old Box", kind: "box"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation UpdateLocation($id: ID!, $input: LocationUpdateInput!) {
          updateLocation(id: $id, input: $input) {
            id
            name
            kind
            description
            coverPrinting { artCropUrl card { name } }
          }
        }
        """,
        "variables" => %{
          "id" => location.id,
          "input" => %{
            "name" => "New Binder",
            "kind" => "binder",
            "description" => "Trade cards",
            "coverScryfallId" => "scryfall-printing-2"
          }
        }
      })

    assert %{
             "data" => %{
               "updateLocation" => %{
                 "id" => _id,
                 "name" => "New Binder",
                 "kind" => "binder",
                 "description" => "Trade cards",
                 "coverPrinting" => %{
                   "artCropUrl" => "https://example.test/cover-art.jpg",
                   "card" => %{"name" => "Cover Card"}
                 }
               }
             }
           } = json_response(conn, 200)
  end

  test "update location mutation rejects unfiled pseudo-location", %{conn: conn} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation UpdateLocation($id: ID!, $input: LocationUpdateInput!) {
          updateLocation(id: $id, input: $input) {
            id
          }
        }
        """,
        "variables" => %{
          "id" => "unfiled",
          "input" => %{"coverScryfallId" => "anything"}
        }
      })

    assert %{"errors" => [%{"message" => "Unfiled cannot be edited"}]} = json_response(conn, 200)
  end

  test "delete location mutation deletes location and unfiles cards", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-delete-location",
          "oracle_id" => "oracle-delete-location",
          "name" => "Delete Location Card",
          "type_line" => "Artifact",
          "collector_number" => "1",
          "set" => "loc",
          "set_name" => "Location Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, location} = Catalog.create_location(%{"name" => "Delete Location", "kind" => "box"})

    {:ok, item} =
      Catalog.create_collection_item(%{
        "scryfall_id" => "scryfall-delete-location",
        "quantity" => 1,
        "location_id" => location.id
      })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation DeleteLocation($id: ID!) {
          deleteLocation(id: $id) {
            id
            name
          }
        }
        """,
        "variables" => %{"id" => location.id}
      })

    assert %{
             "data" => %{
               "deleteLocation" => %{"id" => _id, "name" => "Delete Location"}
             }
           } = json_response(conn, 200)

    assert_raise Ecto.NoResultsError, fn -> Catalog.get_location!(location.id) end
    assert Catalog.get_collection_item!(item.id).location_id == nil
  end
end
