defmodule ManavaultWeb.Schema.LocationsAndImportsTest do
  use ManavaultWeb.ConnCase

  alias Absinthe.Relay.Node
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
            location {
              id
              name
              kind
              description
              coverPrinting { scryfallId artCropUrl card { name } }
            }
          }
        }
        """,
        "variables" => %{
          "input" => %{
            "name" => "New Box",
            "kind" => "box",
            "description" => "Sealed cards",
            "coverScryfallId" => global_id(:printing, "scryfall-printing-3")
          }
        }
      })

    assert %{
             "data" => %{
               "createLocation" => %{
                 "location" => %{
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
            importPreview {
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
        }
        """,
        "variables" => %{
          "input" => %{
            "text" => csv,
            "format" => "csv",
            "locationId" => global_id(:location, location.id)
          }
        }
      })

    assert %{
             "data" => %{
               "previewCollectionImport" => %{
                 "importPreview" => %{
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
             }
           } = json_response(preview_conn, 200)

    commit_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation CommitCollectionImport($input: CollectionImportCommitInput!) {
          commitCollectionImport(input: $input) {
            importResult {
              imported
              skipped
            }
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
               "commitCollectionImport" => %{
                 "importResult" => %{"imported" => 1, "skipped" => 0}
               }
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
        "variables" => %{
          "filters" => %{"locationId" => global_id(:location, location.id)}
        }
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
            location {
              id
              name
              kind
              description
              coverPrinting { artCropUrl card { name } }
            }
          }
        }
        """,
        "variables" => %{
          "id" => global_id(:location, location.id),
          "input" => %{
            "name" => "New Binder",
            "kind" => "binder",
            "description" => "Trade cards",
            "coverScryfallId" => global_id(:printing, "scryfall-printing-2")
          }
        }
      })

    assert %{
             "data" => %{
               "updateLocation" => %{
                 "location" => %{
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
             }
           } = json_response(conn, 200)
  end

  test "update location mutation rejects unfiled pseudo-location", %{conn: conn} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation UpdateLocation($id: ID!, $input: LocationUpdateInput!) {
          updateLocation(id: $id, input: $input) {
            location { id }
          }
        }
        """,
        "variables" => %{
          "id" => global_id(:location, "unfiled"),
          "input" => %{"name" => "Cannot Edit"}
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
            location {
              id
              name
            }
          }
        }
        """,
        "variables" => %{"id" => global_id(:location, location.id)}
      })

    assert %{
             "data" => %{
               "deleteLocation" => %{
                 "location" => %{"id" => _id, "name" => "Delete Location"}
               }
             }
           } = json_response(conn, 200)

    assert_raise Ecto.NoResultsError, fn -> Catalog.get_location!(location.id) end
    assert Catalog.get_collection_item!(item.id).location_id == nil
  end

  test "collection auto-sort settings query returns rules and target locations", %{conn: conn} do
    {:ok, binder} = Catalog.create_location(%{name: "Settings Binder", kind: "binder"})

    assert {:ok, [_rule]} =
             Catalog.update_collection_auto_sort_rules([
               %{
                 name: "Binder rares",
                 target_location_id: binder.id,
                 enabled: true,
                 priority: 1,
                 color_mode: "any",
                 colors: [],
                 type_line_includes: [],
                 type_line_excludes: [],
                 rarities: ["rare"],
                 min_price_cents: nil,
                 max_price_cents: nil
               }
             ])

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query CollectionAutoSortSettings {
          collectionAutoSortRules {
            id
            name
            enabled
            priority
            targetLocation { id name kind }
            colorMode
            colors
            typeLineIncludes
            typeLineExcludes
            rarities
            minPriceCents
            maxPriceCents
          }
          locations(first: 100) {
            edges {
              node { id name kind }
            }
          }
        }
        """
      })

    assert %{
             "data" => %{
               "collectionAutoSortRules" => [
                 %{
                   "name" => "Binder rares",
                   "enabled" => true,
                   "priority" => 1,
                   "targetLocation" => %{"name" => "Settings Binder", "kind" => "binder"},
                   "colorMode" => "any",
                   "colors" => [],
                   "typeLineIncludes" => [],
                   "typeLineExcludes" => [],
                   "rarities" => ["rare"],
                   "minPriceCents" => nil,
                   "maxPriceCents" => nil
                 }
               ],
               "locations" => %{"edges" => edges}
             }
           } = json_response(conn, 200)

    assert Enum.any?(edges, &match?(%{"node" => %{"kind" => "unfiled"}}, &1))
  end

  test "collection auto-sort rule fields round-trip over GraphQL", %{conn: conn} do
    {:ok, location} = Catalog.create_location(%{name: "Rules Binder", kind: "binder"})

    rule_input =
      auto_sort_rule_input(location, %{
        "name" => "Izzet rares",
        "enabled" => true,
        "priority" => 7,
        "colorMode" => "include_any",
        "colors" => ["U", "R"],
        "typeLineIncludes" => ["Wizard", "Instant"],
        "typeLineExcludes" => ["Token"],
        "rarities" => ["rare", "mythic"],
        "minPriceCents" => 150,
        "maxPriceCents" => 900
      })

    update_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation UpdateCollectionAutoSortRules($input: [CollectionAutoSortRuleInput!]!) {
          updateCollectionAutoSortRules(input: $input) {
            collectionAutoSortRules {
              id
              name
              enabled
              priority
              targetLocation { id name kind }
              colorMode
              colors
              typeLineIncludes
              typeLineExcludes
              rarities
              minPriceCents
              maxPriceCents
            }
          }
        }
        """,
        "variables" => %{"input" => [rule_input]}
      })

    expected_rule = Map.delete(rule_input, "targetLocationId")

    assert %{
             "data" => %{
               "updateCollectionAutoSortRules" => %{
                 "collectionAutoSortRules" => [
                   %{
                     "targetLocation" => %{"name" => "Rules Binder", "kind" => "binder"}
                   } = returned_rule
                 ]
               }
             }
           } = json_response(update_conn, 200)

    assert Map.take(returned_rule, Map.keys(expected_rule)) == expected_rule

    query_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query CollectionAutoSortRules {
          collectionAutoSortRules {
            name
            enabled
            priority
            targetLocation { id name kind }
            colorMode
            colors
            typeLineIncludes
            typeLineExcludes
            rarities
            minPriceCents
            maxPriceCents
          }
        }
        """
      })

    assert %{
             "data" => %{
               "collectionAutoSortRules" => [
                 %{"targetLocation" => %{"name" => "Rules Binder", "kind" => "binder"}} =
                   queried_rule
               ]
             }
           } = json_response(query_conn, 200)

    assert Map.take(queried_rule, Map.keys(expected_rule)) == expected_rule
  end

  test "update collection auto-sort rules rejects unfiled and non-storage targets", %{conn: conn} do
    {:ok, list} = Catalog.create_location(%{name: "Wishlist", kind: "list"})

    mutation = """
    mutation UpdateCollectionAutoSortRules($input: [CollectionAutoSortRuleInput!]!) {
      updateCollectionAutoSortRules(input: $input) {
        collectionAutoSortRules { id }
      }
    }
    """

    unfiled_conn =
      post(conn, "/api/graphql", %{
        "query" => mutation,
        "variables" => %{
          "input" => [
            auto_sort_rule_input(%{id: "unfiled"}, %{
              "targetLocationId" => global_id(:location, "unfiled")
            })
          ]
        }
      })

    assert %{"errors" => [%{"message" => "Unfiled cannot be an auto-sort target."}]} =
             json_response(unfiled_conn, 200)

    list_conn =
      post(conn, "/api/graphql", %{
        "query" => mutation,
        "variables" => %{"input" => [auto_sort_rule_input(list, %{})]}
      })

    assert %{"errors" => [%{"message" => "Auto-sort target must be a box or binder."}]} =
             json_response(list_conn, 200)
  end

  test "auto-sort collection mutation moves matching source items", %{conn: conn} do
    {:ok, %{cards_count: 2, printings_count: 2}} =
      Catalog.import_cards([
        card_attrs(
          "scryfall-auto-sort-red",
          "oracle-auto-sort-red",
          "Red Sorter",
          "Creature — Goblin",
          ["R"],
          "rare",
          "5.50"
        )
        |> Map.put("image_uris", %{"normal" => "https://example.test/red-sorter.jpg"}),
        card_attrs(
          "scryfall-auto-sort-blue",
          "oracle-auto-sort-blue",
          "Blue Sorter",
          "Creature — Merfolk",
          ["U"],
          "rare",
          "5.50"
        )
        |> Map.put("collector_number", "2")
      ])

    {:ok, source} = Catalog.create_location(%{name: "Sort Source", kind: "box"})
    {:ok, target} = Catalog.create_location(%{name: "Red Auto Binder", kind: "binder"})

    {:ok, matching_item} =
      Catalog.create_collection_item(%{
        "scryfall_id" => "scryfall-auto-sort-red",
        "quantity" => 1,
        "location_id" => source.id
      })

    {:ok, nonmatching_item} =
      Catalog.create_collection_item(%{
        "scryfall_id" => "scryfall-auto-sort-blue",
        "quantity" => 1,
        "location_id" => source.id
      })

    {:ok, [_target]} =
      Catalog.update_collection_auto_sort_rules([
        %{
          name: "Red creatures",
          target_location_id: target.id,
          enabled: true,
          priority: 1,
          color_mode: "exact",
          colors: ["R"],
          type_line_includes: ["Creature"],
          type_line_excludes: [],
          rarities: ["rare"],
          min_price_cents: nil,
          max_price_cents: nil
        }
      ])

    dry_run_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation AutoSortCollection($input: AutoSortCollectionInput) {
          autoSortCollection(input: $input) {
            autoSortResult {
              checkedCount
              movedCount
              skippedCount
              dryRun
              moves {
                collectionItemId
                cardName
                cardId
                imageUrl
                quantity
                finish
                fromLocationId
                fromLocationName
                toLocationId
                toLocationName
              }
            }
          }
        }
        """,
        "variables" => %{
          "input" => %{"sourceLocationId" => global_id(:location, source.id), "dryRun" => true}
        }
      })

    assert %{
             "data" => %{
               "autoSortCollection" => %{
                 "autoSortResult" => %{
                   "checkedCount" => 2,
                   "movedCount" => 1,
                   "skippedCount" => 1,
                   "dryRun" => true,
                   "moves" => [%{"collectionItemId" => preview_item_id, "finish" => "nonfoil"}]
                 }
               }
             }
           } = json_response(dry_run_conn, 200)

    assert preview_item_id == to_string(matching_item.id)
    assert Catalog.get_collection_item!(matching_item.id).location_id == source.id

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation AutoSortCollection($input: AutoSortCollectionInput) {
          autoSortCollection(input: $input) {
            autoSortResult {
              checkedCount
              movedCount
              skippedCount
              dryRun
              moves {
                collectionItemId
                cardName
                cardId
                imageUrl
                quantity
                finish
                fromLocationId
                fromLocationName
                toLocationId
                toLocationName
              }
            }
          }
        }
        """,
        "variables" => %{
          "input" => %{"sourceLocationId" => global_id(:location, source.id), "dryRun" => false}
        }
      })

    assert %{
             "data" => %{
               "autoSortCollection" => %{
                 "autoSortResult" => %{
                   "checkedCount" => 2,
                   "movedCount" => 1,
                   "skippedCount" => 1,
                   "dryRun" => false,
                   "moves" => [
                     %{
                       "collectionItemId" => matching_item_id,
                       "cardName" => "Red Sorter",
                       "cardId" => "oracle-auto-sort-red",
                       "imageUrl" => "https://example.test/red-sorter.jpg",
                       "quantity" => 1,
                       "finish" => "nonfoil",
                       "fromLocationId" => source_id,
                       "fromLocationName" => "Sort Source",
                       "toLocationId" => target_id,
                       "toLocationName" => "Red Auto Binder"
                     }
                   ]
                 }
               }
             }
           } = json_response(conn, 200)

    assert matching_item_id == to_string(matching_item.id)
    assert source_id == to_string(source.id)
    assert target_id == to_string(target.id)

    assert Catalog.get_collection_item!(matching_item.id).location_id == target.id
    assert Catalog.get_collection_item!(nonmatching_item.id).location_id == source.id
  end

  test "auto-sort collection mutation accepts unfiled source", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        card_attrs(
          "scryfall-auto-sort-unfiled",
          "oracle-auto-sort-unfiled",
          "Unfiled Sorter",
          "Artifact Creature",
          [],
          "uncommon",
          "0.50"
        )
      ])

    {:ok, target} = Catalog.create_location(%{name: "Unfiled Auto Box", kind: "box"})

    {:ok, item} =
      Catalog.create_collection_item(%{
        "scryfall_id" => "scryfall-auto-sort-unfiled",
        "quantity" => 1
      })

    {:ok, [_target]} =
      Catalog.update_collection_auto_sort_rules([
        %{
          name: "Unfiled artifacts",
          target_location_id: target.id,
          enabled: true,
          priority: 1,
          color_mode: "colorless",
          colors: [],
          type_line_includes: ["Artifact"],
          type_line_excludes: [],
          rarities: ["uncommon"],
          min_price_cents: nil,
          max_price_cents: nil
        }
      ])

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation AutoSortCollection($input: AutoSortCollectionInput) {
          autoSortCollection(input: $input) {
            autoSortResult {
              checkedCount
              movedCount
              skippedCount
              moves {
                collectionItemId
                cardName
                quantity
                fromLocationId
                fromLocationName
                toLocationId
                toLocationName
              }
            }
          }
        }
        """,
        "variables" => %{"input" => %{"sourceLocationId" => "unfiled"}}
      })

    assert %{
             "data" => %{
               "autoSortCollection" => %{
                 "autoSortResult" => %{
                   "checkedCount" => 1,
                   "movedCount" => 1,
                   "skippedCount" => 0,
                   "moves" => [
                     %{
                       "collectionItemId" => item_id,
                       "cardName" => "Unfiled Sorter",
                       "quantity" => 1,
                       "fromLocationId" => nil,
                       "fromLocationName" => "Unfiled",
                       "toLocationId" => target_id,
                       "toLocationName" => "Unfiled Auto Box"
                     }
                   ]
                 }
               }
             }
           } = json_response(conn, 200)

    assert item_id == to_string(item.id)
    assert target_id == to_string(target.id)

    assert Catalog.get_collection_item!(item.id).location_id == target.id
  end

  test "collection import commit auto-sorts imported cards", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        card_attrs(
          "scryfall-import-auto-sort",
          "oracle-import-auto-sort",
          "Auto Imported Card",
          "Creature — Dragon",
          ["R"],
          "mythic",
          "12.00"
        )
      ])

    {:ok, target} = Catalog.create_location(%{name: "Auto Import Binder", kind: "binder"})

    {:ok, [_target]} =
      Catalog.update_collection_auto_sort_rules([
        %{
          name: "Imported red creatures",
          target_location_id: target.id,
          enabled: true,
          priority: 1,
          color_mode: "include_any",
          colors: ["R"],
          type_line_includes: ["Creature"],
          type_line_excludes: [],
          rarities: ["mythic"],
          min_price_cents: 1_000,
          max_price_cents: nil
        }
      ])

    csv = """
    Quantity,Card Name,Set Code,Collector Number,Finish,Condition,Language
    1,Auto Imported Card,aus,1,nonfoil,NM,en
    """

    preview_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation PreviewCollectionImport($input: CollectionImportPreviewInput!) {
          previewCollectionImport(input: $input) {
            importPreview {
              rows {
                rowNumber
                status
                attrs { quantity finish condition language scryfallId locationId }
              }
            }
          }
        }
        """,
        "variables" => %{"input" => %{"text" => csv, "format" => "csv"}}
      })

    assert %{
             "data" => %{
               "previewCollectionImport" => %{
                 "importPreview" => %{
                   "rows" => rows
                 }
               }
             }
           } = json_response(preview_conn, 200)

    import_rows =
      Enum.map(rows, fn row ->
        %{
          "rowNumber" => row["rowNumber"],
          "status" => row["status"],
          "attrs" => row["attrs"]
        }
      end)

    auto_sort_preview_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation PreviewCollectionImportAutoSort($input: CollectionImportCommitInput!) {
          previewCollectionImportAutoSort(input: $input) {
            autoSortResult {
              checkedCount
              movedCount
              skippedCount
              dryRun
              moves {
                cardName
                cardId
                imageUrl
                quantity
                finish
                fromLocationId
                fromLocationName
                toLocationId
                toLocationName
              }
            }
          }
        }
        """,
        "variables" => %{
          "input" => %{"rows" => import_rows}
        }
      })

    assert %{
             "data" => %{
               "previewCollectionImportAutoSort" => %{
                 "autoSortResult" => %{
                   "checkedCount" => 1,
                   "movedCount" => 1,
                   "skippedCount" => 0,
                   "dryRun" => true,
                   "moves" => [
                     %{
                       "cardName" => "Auto Imported Card",
                       "cardId" => "oracle-import-auto-sort",
                       "imageUrl" => nil,
                       "quantity" => 1,
                       "finish" => "nonfoil",
                       "fromLocationId" => nil,
                       "fromLocationName" => "Unfiled",
                       "toLocationId" => preview_target_id,
                       "toLocationName" => "Auto Import Binder"
                     }
                   ]
                 }
               }
             }
           } = json_response(auto_sort_preview_conn, 200)

    assert preview_target_id == to_string(target.id)
    assert [] = Catalog.list_collection_items([], limit: 10)

    commit_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation CommitCollectionImport($input: CollectionImportCommitInput!) {
          commitCollectionImport(input: $input) {
            importResult {
              imported
              skipped
              autoSorted
            }
          }
        }
        """,
        "variables" => %{
          "input" => %{
            "autoSort" => true,
            "rows" => import_rows
          }
        }
      })

    assert %{
             "data" => %{
               "commitCollectionImport" => %{
                 "importResult" => %{"imported" => 1, "skipped" => 0, "autoSorted" => 1}
               }
             }
           } = json_response(commit_conn, 200)

    [imported_item] =
      Catalog.list_collection_items([location_id: to_string(target.id)], limit: 10)

    assert imported_item.scryfall_id == "scryfall-import-auto-sort"
  end

  defp auto_sort_rule_input(location, overrides) do
    Map.merge(
      %{
        "targetLocationId" => global_id(:location, location.id),
        "name" => "Auto-sort rule",
        "enabled" => false,
        "priority" => 0,
        "colorMode" => "any",
        "colors" => [],
        "typeLineIncludes" => [],
        "typeLineExcludes" => [],
        "rarities" => [],
        "minPriceCents" => nil,
        "maxPriceCents" => nil
      },
      overrides
    )
  end

  defp card_attrs(scryfall_id, oracle_id, name, type_line, colors, rarity, usd_price) do
    %{
      "id" => scryfall_id,
      "oracle_id" => oracle_id,
      "name" => name,
      "type_line" => type_line,
      "collector_number" => "1",
      "set" => "aus",
      "set_name" => "Auto Sort Set",
      "lang" => "en",
      "rarity" => rarity,
      "colors" => colors,
      "color_identity" => colors,
      "image_uris" => %{},
      "finishes" => ["nonfoil"],
      "prices" => %{"usd" => usd_price},
      "legalities" => %{}
    }
  end

  defp global_id(type, id), do: Node.to_global_id(type, id, ManavaultWeb.Schema)
end
