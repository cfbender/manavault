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
        location_id: location.id
      })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          locations {
            name
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
                   "coverPrinting" => %{
                     "card" => %{"name" => "Test Card"},
                     "artCropUrl" => "https://example.test/card-art.jpg",
                     "imageUrl" => "https://example.test/card.jpg"
                   },
                   "totalPriceText" => "$12.34"
                 }
               ],
               "collectionItemCount" => 1,
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
