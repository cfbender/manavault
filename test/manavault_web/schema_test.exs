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
          "rarity" => "rare",
          "image_uris" => %{
            "normal" => "https://example.test/card.jpg",
            "art_crop" => "https://example.test/card-art.jpg"
          },
          "finishes" => ["nonfoil"],
          "prices" => %{"usd" => "12.34"},
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
        location_id: location.id,
        quantity: 3
      })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          locations {
            id
            name
            kind
            itemCount
            totalPriceText
            coverPrinting { imageUrl artCropUrl card { name } }
          }
          collectionItems {
            priceText
            allocatedQuantity
            printing { imageUrl card { name } }
            location { name }
          }
          collectionItemCount
        }
        """
      })

    assert %{
             "data" => %{
               "locations" => [
                 %{
                   "id" => _id,
                   "name" => "Binder",
                   "kind" => "binder",
                   "coverPrinting" => %{
                     "card" => %{"name" => "Test Card"},
                     "artCropUrl" => "https://example.test/card-art.jpg",
                     "imageUrl" => "https://example.test/card.jpg"
                   },
                   "itemCount" => 3,
                   "totalPriceText" => "$37.02"
                 },
                 %{
                   "id" => "unfiled",
                   "name" => "Unfiled",
                   "kind" => "unfiled",
                   "coverPrinting" => nil,
                   "itemCount" => 0,
                   "totalPriceText" => "$0"
                 }
               ],
               "collectionItemCount" => 3,
               "collectionItems" => [
                 %{
                   "allocatedQuantity" => 0,
                   "location" => %{"name" => "Binder"},
                   "priceText" => "$12.34",
                   "printing" => %{
                     "card" => %{"name" => "Test Card"},
                     "imageUrl" => "https://example.test/card.jpg"
                   }
                 }
               ]
             }
           } = json_response(conn, 200)
  end

  test "unfiled location resolves cards without an assigned location", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-unfiled",
          "oracle_id" => "oracle-unfiled",
          "name" => "Loose Card",
          "type_line" => "Creature",
          "collector_number" => "7",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "rarity" => "common",
          "image_uris" => %{},
          "prices" => %{"usd" => "0.50"},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, _item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-unfiled",
        quantity: 4
      })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          location(id: "unfiled") {
            id
            name
            kind
            itemCount
            totalPriceText
            collectionItems { quantity location { name } printing { card { name } } }
          }
        }
        """
      })

    assert %{
             "data" => %{
               "location" => %{
                 "id" => "unfiled",
                 "name" => "Unfiled",
                 "kind" => "unfiled",
                 "itemCount" => 4,
                 "totalPriceText" => "$2",
                 "collectionItems" => [
                   %{
                     "quantity" => 4,
                     "location" => nil,
                     "printing" => %{"card" => %{"name" => "Loose Card"}}
                   }
                 ]
               }
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

  test "create deck mutation creates a deck", %{conn: conn} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation CreateDeck($input: DeckInput!) {
          createDeck(input: $input) {
            id
            name
            format
            status
            cardCount
            uniqueCardCount
          }
        }
        """,
        "variables" => %{
          "input" => %{
            "name" => "Knife Drawer",
            "format" => "commander",
            "status" => "brewing"
          }
        }
      })

    assert %{
             "data" => %{
               "createDeck" => %{
                 "id" => _id,
                 "name" => "Knife Drawer",
                 "format" => "commander",
                 "status" => "brewing",
                 "cardCount" => 0,
                 "uniqueCardCount" => 0
               }
             }
           } = json_response(conn, 200)
  end

  test "create collection item mutation adds a printing to the collection", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-2",
          "oracle_id" => "oracle-2",
          "name" => "New Collection Card",
          "type_line" => "Creature",
          "collector_number" => "2",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "rarity" => "rare",
          "image_uris" => %{"normal" => "https://example.test/new-card.jpg"},
          "finishes" => ["nonfoil", "foil"],
          "legalities" => %{}
        }
      ])

    {:ok, location} = Catalog.create_location(%{name: "Trade Binder", kind: "binder"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation CreateCollectionItem($input: CollectionItemInput!) {
          createCollectionItem(input: $input) {
            id
            quantity
            condition
            language
            finish
            notes
            printing { scryfallId card { name } }
            location { id name }
          }
        }
        """,
        "variables" => %{
          "input" => %{
            "scryfallId" => "scryfall-printing-2",
            "quantity" => 2,
            "condition" => "near_mint",
            "language" => "en",
            "finish" => "foil",
            "locationId" => location.id,
            "notes" => "Fresh pull"
          }
        }
      })

    assert %{
             "data" => %{
               "createCollectionItem" => %{
                 "quantity" => 2,
                 "condition" => "near_mint",
                 "language" => "en",
                 "finish" => "foil",
                 "notes" => "Fresh pull",
                 "printing" => %{
                   "scryfallId" => "scryfall-printing-2",
                   "card" => %{"name" => "New Collection Card"}
                 },
                 "location" => %{"id" => _id, "name" => "Trade Binder"}
               }
             }
           } = json_response(conn, 200)
  end

  test "update and delete collection item mutations change owned printings", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-update",
          "oracle_id" => "oracle-update",
          "name" => "Update Collection Card",
          "type_line" => "Creature",
          "collector_number" => "12",
          "set" => "upd",
          "set_name" => "Update Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil", "foil"],
          "legalities" => %{}
        }
      ])

    {:ok, location} = Catalog.create_location(%{name: "Old Box", kind: "box"})
    {:ok, new_location} = Catalog.create_location(%{name: "New List", kind: "list"})

    {:ok, item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-printing-update",
        quantity: 2,
        location_id: location.id
      })

    update_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation UpdateCollectionItem($id: ID!, $input: CollectionItemUpdateInput!) {
          updateCollectionItem(id: $id, input: $input) {
            id
            quantity
            condition
            language
            finish
            notes
            location { name }
          }
        }
        """,
        "variables" => %{
          "id" => item.id,
          "input" => %{
            "quantity" => 4,
            "condition" => "lightly_played",
            "language" => "ja",
            "finish" => "foil",
            "locationId" => new_location.id,
            "notes" => "Moved"
          }
        }
      })

    assert %{
             "data" => %{
               "updateCollectionItem" => %{
                 "id" => _id,
                 "quantity" => 4,
                 "condition" => "lightly_played",
                 "language" => "ja",
                 "finish" => "foil",
                 "notes" => "Moved",
                 "location" => %{"name" => "New List"}
               }
             }
           } = json_response(update_conn, 200)

    delete_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation DeleteCollectionItem($id: ID!) {
          deleteCollectionItem(id: $id) {
            id
          }
        }
        """,
        "variables" => %{"id" => item.id}
      })

    assert %{"data" => %{"deleteCollectionItem" => %{"id" => _id}}} = json_response(delete_conn, 200)
    assert [] = Catalog.list_collection_items()
  end

  test "add collection item to deck creates a deck card and allocation", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-deck-add",
          "oracle_id" => "oracle-deck-add",
          "name" => "Deck Add Card",
          "type_line" => "Artifact",
          "collector_number" => "7",
          "set" => "dad",
          "set_name" => "Deck Add Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-printing-deck-add",
        quantity: 1
      })

    {:ok, deck} = Catalog.create_deck(%{"name" => "Target Deck"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation AddCollectionItemToDeck($id: ID!, $deckId: ID!, $zone: String) {
          addCollectionItemToDeck(id: $id, deckId: $deckId, zone: $zone) {
            id
            quantity
            zone
            finish
            card { name }
            preferredPrinting { scryfallId }
          }
        }
        """,
        "variables" => %{"id" => item.id, "deckId" => deck.id, "zone" => "sideboard"}
      })

    assert %{
             "data" => %{
               "addCollectionItemToDeck" => %{
                 "id" => _id,
                 "quantity" => 1,
                 "zone" => "sideboard",
                 "finish" => "nonfoil",
                 "card" => %{"name" => "Deck Add Card"},
                 "preferredPrinting" => %{"scryfallId" => "scryfall-printing-deck-add"}
               }
             }
           } = json_response(conn, 200)

    [deck_card] = Catalog.get_deck!(deck.id).deck_cards
    status = Catalog.deck_card_allocation_status(deck_card)
    assert status.allocated == 1
  end

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
          "legalities" => %{}
        }
      ])

    {:ok, location} = Catalog.create_location(%{name: "Import Binder", kind: "binder"})

    csv = """
    Quantity,Card Name,Set Code,Collector Number,Finish,Condition,Language
    3,Imported Card,imp,9,nonfoil,NM,en
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
              attrs { quantity finish condition language scryfallId locationId }
              printing { scryfallId card { name } }
              candidates { scryfallId }
            }
          }
        }
        """,
        "variables" => %{"input" => %{"csv" => csv, "locationId" => location.id}}
      })

    assert %{
             "data" => %{
               "previewCollectionImport" => %{
                 "locationId" => _location_id,
                 "total" => 1,
                 "exact" => 1,
                 "ambiguous" => 0,
                 "unresolved" => 0,
                 "rows" => [
                   %{
                     "rowNumber" => 2,
                     "status" => "exact",
                     "attrs" => %{
                       "quantity" => 3,
                       "finish" => "nonfoil",
                       "condition" => "near_mint",
                       "language" => "en",
                       "scryfallId" => "scryfall-printing-import"
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
    assert export_csv =~ "Quantity,Card Name,Set Code,Collector Number,Finish,Condition,Language,Location"
    assert export_csv =~ "3,Imported Card,imp,9,nonfoil,near_mint,en,Import Binder"
  end

  test "update deck mutation updates deck fields", %{conn: conn} do
    {:ok, deck} = Catalog.create_deck(%{"name" => "Old Deck", "format" => "commander", "status" => "brewing"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation UpdateDeck($id: ID!, $input: DeckUpdateInput!) {
          updateDeck(id: $id, input: $input) {
            id
            name
            format
            status
          }
        }
        """,
        "variables" => %{
          "id" => deck.id,
          "input" => %{"name" => "New Deck", "format" => "modern", "status" => "active"}
        }
      })

    assert %{
             "data" => %{
               "updateDeck" => %{
                 "id" => _id,
                 "name" => "New Deck",
                 "format" => "modern",
                 "status" => "active"
               }
             }
           } = json_response(conn, 200)
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

  test "update deck card mutation moves a card between zones", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
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
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Sideboard Test"})
    {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation MoveDeckCard($id: ID!, $input: DeckCardUpdateInput!) {
          updateDeckCard(id: $id, input: $input) {
            id
            zone
            quantity
            card { name }
          }
        }
        """,
        "variables" => %{
          "id" => deck_card.id,
          "input" => %{"zone" => "sideboard"}
        }
      })

    assert %{
             "data" => %{
               "updateDeckCard" => %{
                 "id" => _id,
                 "zone" => "sideboard",
                 "quantity" => 1,
                 "card" => %{"name" => "Black Lotus"}
               }
             }
           } = json_response(conn, 200)
  end

  test "set deck commander replaces the current commander", %{conn: conn} do
    {:ok, %{cards_count: 2, printings_count: 2}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-1",
          "oracle_id" => "oracle-1",
          "name" => "Old Legend",
          "type_line" => "Legendary Creature — Wizard",
          "collector_number" => "1",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        },
        %{
          "id" => "scryfall-printing-2",
          "oracle_id" => "oracle-2",
          "name" => "New Legend",
          "type_line" => "Legendary Creature — Soldier",
          "collector_number" => "2",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Commander Test"})

    {:ok, old_commander} =
      Catalog.add_card_to_deck(deck, %{"name" => "Old Legend", "zone" => "commander"})

    {:ok, new_commander} = Catalog.add_card_to_deck(deck, %{"name" => "New Legend"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation SetDeckCommander($id: ID!) {
          setDeckCommander(id: $id) {
            id
            zone
            card { name }
          }
        }
        """,
        "variables" => %{"id" => new_commander.id}
      })

    assert %{
             "data" => %{
               "setDeckCommander" => %{
                 "id" => _id,
                 "zone" => "commander",
                 "card" => %{"name" => "New Legend"}
               }
             }
           } = json_response(conn, 200)

    loaded = Catalog.get_deck!(deck.id)

    assert Enum.any?(loaded.deck_cards, &(&1.id == old_commander.id and &1.zone == "mainboard"))
    assert Enum.any?(loaded.deck_cards, &(&1.id == new_commander.id and &1.zone == "commander"))
  end
end
