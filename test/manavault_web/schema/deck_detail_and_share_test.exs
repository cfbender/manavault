defmodule ManavaultWeb.Schema.DeckDetailAndShareTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog

  test "deck legality is exposed on deck detail and summaries", %{conn: conn} do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([
               %{
                 "id" => "scryfall-legality-commander",
                 "oracle_id" => "oracle-legality-commander",
                 "name" => "Legality Commander",
                 "type_line" => "Legendary Creature",
                 "color_identity" => ["G"],
                 "collector_number" => "1",
                 "set" => "leg",
                 "set_name" => "Legality Set",
                 "lang" => "en",
                 "image_uris" => %{},
                 "finishes" => ["nonfoil"],
                 "legalities" => %{"commander" => "legal"}
               },
               %{
                 "id" => "scryfall-legality-duplicate",
                 "oracle_id" => "oracle-legality-duplicate",
                 "name" => "Duplicate Nonbasic",
                 "type_line" => "Creature",
                 "color_identity" => ["G"],
                 "collector_number" => "2",
                 "set" => "leg",
                 "set_name" => "Legality Set",
                 "lang" => "en",
                 "image_uris" => %{},
                 "finishes" => ["nonfoil"],
                 "legalities" => %{"commander" => "legal"}
               }
             ])

    assert {:ok, deck} =
             Catalog.create_deck(%{"name" => "Illegal Commander", "format" => "commander"})

    assert {:ok, _commander} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Legality Commander",
               "quantity" => 1,
               "zone" => "commander"
             })

    assert {:ok, _duplicate} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Duplicate Nonbasic",
               "quantity" => 2,
               "zone" => "mainboard"
             })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query DeckLegality($id: ID!) {
          deck(id: $id) {
            legality {
              status
              issues {
                code
                message
                severity
                cardName
              }
            }
          }
          decks(first: 10) {
            pageInfo {
              endCursor
              hasNextPage
            }
            edges {
              node {
                name
                legality {
                  status
                  issues {
                    code
                    message
                    severity
                    cardName
                  }
                }
              }
            }
          }
        }
        """,
        "variables" => %{"id" => global_deck_id(deck)}
      })

    assert %{
             "data" => %{
               "deck" => %{
                 "legality" => %{
                   "status" => "illegal",
                   "issues" => detail_issues
                 }
               },
               "decks" => %{
                 "pageInfo" => %{"endCursor" => _cursor, "hasNextPage" => false},
                 "edges" => [
                   %{
                     "node" => %{
                       "name" => "Illegal Commander",
                       "legality" => %{
                         "status" => "illegal",
                         "issues" => summary_issues
                       }
                     }
                   }
                 ]
               }
             }
           } = json_response(conn, 200)

    assert Enum.any?(detail_issues, fn issue ->
             is_binary(issue["code"]) and is_binary(issue["message"]) and
               is_binary(issue["severity"]) and issue["cardName"] == "Duplicate Nonbasic"
           end)

    assert Enum.any?(summary_issues, fn issue ->
             is_binary(issue["code"]) and is_binary(issue["message"]) and
               is_binary(issue["severity"]) and issue["cardName"] == "Duplicate Nonbasic"
           end)
  end

  test "deck share mutation creates a public token and public share query resolves it", %{
    conn: conn
  } do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-share-card",
          "oracle_id" => "oracle-share-card",
          "name" => "Shared Card",
          "type_line" => "Artifact",
          "collector_number" => "9",
          "set" => "shr",
          "set_name" => "Share Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "prices" => %{"usd" => "2.50"},
          "legalities" => %{},
          "game_changer" => true
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Shared Deck"})

    {:ok, _deck_card} =
      Catalog.add_card_to_deck(deck, %{
        "name" => "Shared Card",
        "preferred_printing_id" => "scryfall-share-card",
        "quantity" => 2
      })

    {:ok, _owned_item} =
      Catalog.create_collection_item(%{
        "scryfall_id" => "scryfall-share-card",
        "quantity" => 2,
        "condition" => "near_mint",
        "language" => "en",
        "finish" => "nonfoil"
      })

    share_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation ShareDeck($id: ID!) {
          ensureDeckShareToken(id: $id) {
            deck {
              id
              shareToken
            }
          }
        }
        """,
        "variables" => %{"id" => global_deck_id(deck)}
      })

    assert %{
             "data" => %{
               "ensureDeckShareToken" => %{
                 "deck" => %{
                   "id" => _id,
                   "shareToken" => share_token
                 }
               }
             }
           } = json_response(share_conn, 200)

    assert is_binary(share_token)
    assert String.length(share_token) > 20
    refute share_token == to_string(deck.id)

    public_conn =
      post(conn, "/share/graphql", %{
        "query" => """
        query SharedDeck($id: ID!) {
          deck(id: $id) {
            name
            shareToken
            cardCount
            uniqueCardCount
            legality {
              status
              issues {
                code
                message
                severity
                cardName
              }
            }
            deckCards(first: 20) {
              pageInfo {
                endCursor
                hasNextPage
              }
              edges {
                node {
                  id
                  quantity
                  zone
                  finish
                  priceCents
                  card { name gameChanger }
                  preferredPrinting {
                    scryfallId
                    imageUrl
                    artCropUrl
                    setCode
                    setName
                    collectorNumber
                    rarity
                    finishes
                  }
                  allocationStatus {
                    state
                    required
                    owned
                    allocated
                    available
                    allocatedElsewhere
                    missing
                    candidates {
                      allocated
                      allocatedElsewhere
                      available
                      item {
                        id
                        quantity
                        finish
                        condition
                        language
                        priceText
                        location {
                          id
                          name
                        }
                        printing {
                          scryfallId
                          setCode
                          setName
                          collectorNumber
                          rarity
                          card { name }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          deckBuylist(id: $id, printingMode: "exact", includeBasicLands: true) {
            cardName
            quantity
            missing
            unavailable
            reason
            setCode
            collectorNumber
            totalPriceCents
            totalPriceText
          }
          deckBuylistExport(id: $id, format: "text", printingMode: "exact", includeBasicLands: true)
        }
        """,
        "variables" => %{"id" => share_token}
      })

    assert %{
             "data" => %{
               "deck" => %{
                 "name" => "Shared Deck",
                 "shareToken" => ^share_token,
                 "cardCount" => 2,
                 "uniqueCardCount" => 1,
                 "legality" => %{
                   "status" => "illegal",
                   "issues" => public_share_issues
                 },
                 "deckCards" => %{
                   "pageInfo" => %{"endCursor" => _deck_cards_cursor, "hasNextPage" => false},
                   "edges" => [
                     %{
                       "node" => %{
                         "quantity" => 2,
                         "priceCents" => 250,
                         "card" => %{"name" => "Shared Card", "gameChanger" => true},
                         "allocationStatus" => %{
                           "state" => "shared",
                           "required" => 2,
                           "owned" => 0,
                           "allocated" => 0,
                           "available" => 0,
                           "allocatedElsewhere" => 0,
                           "missing" => 0,
                           "candidates" => []
                         }
                       }
                     }
                   ]
                 }
               }
             }
           } = json_response(public_conn, 200)

    assert %{
             "data" => %{
               "deckBuylist" => [
                 %{
                   "cardName" => "Shared Card",
                   "quantity" => 2,
                   "missing" => 2,
                   "unavailable" => 0,
                   "reason" => "missing",
                   "setCode" => "shr",
                   "collectorNumber" => "9",
                   "totalPriceCents" => 500,
                   "totalPriceText" => "$5"
                 }
               ],
               "deckBuylistExport" => "2 Shared Card (SHR 9)"
             }
           } = json_response(public_conn, 200)

    assert Enum.any?(public_share_issues, fn issue ->
             is_binary(issue["code"]) and is_binary(issue["message"]) and
               is_binary(issue["severity"]) and issue["cardName"] == "Shared Card"
           end)
  end

  defp global_deck_id(deck) do
    Absinthe.Relay.Node.to_global_id(:deck, deck.id, ManavaultWeb.Schema)
  end
end
