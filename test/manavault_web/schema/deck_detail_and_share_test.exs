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
    rulings_uri = "https://api.scryfall.com/cards/oracle-share-card/rulings"
    previous_fetcher = Application.fetch_env(:manavault, :scryfall_rulings_fetcher)

    Application.put_env(:manavault, :scryfall_rulings_fetcher, fn ^rulings_uri ->
      {:ok,
       Jason.encode!(%{
         "data" => [
           %{
             "source" => "wotc",
             "published_at" => "2024-04-05",
             "comment" => "Shared card detail exposes public rulings."
           }
         ]
       })}
    end)

    on_exit(fn ->
      case previous_fetcher do
        {:ok, fetcher} -> Application.put_env(:manavault, :scryfall_rulings_fetcher, fetcher)
        :error -> Application.delete_env(:manavault, :scryfall_rulings_fetcher)
      end
    end)

    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-share-card",
          "oracle_id" => "oracle-share-card",
          "name" => "Shared Card",
          "type_line" => "Artifact",
          "oracle_text" => "Shared oracle text.",
          "collector_number" => "9",
          "set" => "shr",
          "set_name" => "Share Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "prices" => %{"usd" => "2.50"},
          "released_at" => "2024-02-03",
          "legalities" => %{"commander" => "legal", "modern" => "not_legal"},
          "rulings_uri" => rulings_uri,
          "game_changer" => true
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Shared Deck"})

    {:ok, deck_card} =
      Catalog.add_card_to_deck(deck, %{
        "name" => "Shared Card",
        "preferred_printing_id" => "scryfall-share-card",
        "quantity" => 2
      })

    {:ok, share_tag} =
      Catalog.create_deck_tag(deck, %{"name" => "Mana Rocks", "color" => "#00ff00"})

    {:ok, _tagged_deck_card} = Catalog.assign_deck_card_tag(deck_card.id, share_tag.id)

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
        query SharedDeck($id: ID!, $deckCardsAfter: String) {
          deck(id: $id) {
            id
            name
            format
            status
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
            tags {
              id
              name
              color
              targetCount
              position
              cardCount
            }
            deckCards(first: 500, after: $deckCardsAfter) {
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
                  tag
                  tagIds
                  priceCents
                  card {
                    id
                    oracleId
                    name
                    typeLine
                    cmc
                    manaCost
                    oracleText
                    colors
                    colorIdentity
                    gameChanger
                    deckCategory
                    deckThemes
                  }
                  preferredPrinting {
                    id
                    scryfallId
                    imageUrl
                    backImageUrl
                    artCropUrl
                    setCode
                    setName
                    collectorNumber
                    rarity
                    finishes
                  }
                  fallbackPrinting {
                    id
                    scryfallId
                    imageUrl
                    backImageUrl
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
                    proxyAllocated
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
                          id
                          scryfallId
                          imageUrl
                          backImageUrl
                          artCropUrl
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
                 "tags" => public_deck_tags,
                 "deckCards" => %{
                   "pageInfo" => %{"endCursor" => _deck_cards_cursor, "hasNextPage" => false},
                   "edges" => [
                     %{
                       "node" => %{
                         "tagIds" => public_deck_card_tag_ids,
                         "quantity" => 2,
                         "priceCents" => 250,
                         "card" => %{
                           "id" => shared_card_id,
                           "name" => "Shared Card",
                           "gameChanger" => true
                         },
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

    assert is_binary(shared_card_id)

    assert Enum.any?(public_deck_tags, fn tag ->
             tag["id"] == to_string(share_tag.id) and tag["name"] == "Mana Rocks" and
               tag["color"] == "#00ff00" and tag["cardCount"] == 2
           end)

    assert to_string(share_tag.id) in public_deck_card_tag_ids

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

    public_card_conn =
      post(conn, "/share/graphql", %{
        "query" => """
        query Card($id: ID!) {
          card(id: $id) {
            id
            oracleId
            name
            typeLine
            manaCost
            oracleText
            colorIdentity
            gameChanger
            deckCategory
            deckThemes
            oracleTags {
              id
              slug
              label
              weight
              annotation
            }
            legalities {
              format
              status
            }
            rulings {
              source
              publishedAt
              comment
            }
            printings(first: 300) {
              pageInfo {
                endCursor
                hasNextPage
              }
              edges {
                node {
                  id
                  scryfallId
                  setCode
                  setName
                  collectorNumber
                  lang
                  rarity
                  ownedCount
                  finishes
                  imageUrl
                  artCropUrl
                  releasedAt
                  prices
                  priceText
                }
              }
            }
          }
        }
        """,
        "variables" => %{"id" => shared_card_id}
      })

    assert %{
             "data" => %{
               "card" => %{
                 "id" => ^shared_card_id,
                 "oracleId" => "oracle-share-card",
                 "name" => "Shared Card",
                 "typeLine" => "Artifact",
                 "manaCost" => nil,
                 "oracleText" => "Shared oracle text.",
                 "colorIdentity" => [],
                 "gameChanger" => true,
                 "deckCategory" => "other",
                 "deckThemes" => ["artifact"],
                 "oracleTags" => [],
                 "legalities" => [
                   %{"format" => "commander", "status" => "legal"},
                   %{"format" => "modern", "status" => "not_legal"}
                 ],
                 "rulings" => [
                   %{
                     "source" => "wotc",
                     "publishedAt" => "2024-04-05",
                     "comment" => "Shared card detail exposes public rulings."
                   }
                 ],
                 "printings" => %{
                   "pageInfo" => %{"endCursor" => _card_printings_cursor, "hasNextPage" => false},
                   "edges" => [
                     %{
                       "node" => %{
                         "id" => _printing_id,
                         "scryfallId" => "scryfall-share-card",
                         "setCode" => "shr",
                         "setName" => "Share Set",
                         "collectorNumber" => "9",
                         "lang" => "en",
                         "rarity" => _rarity,
                         "ownedCount" => 0,
                         "finishes" => ["nonfoil"],
                         "imageUrl" => nil,
                         "artCropUrl" => nil,
                         "releasedAt" => "2024-02-03",
                         "prices" => %{"usd" => "2.50"},
                         "priceText" => "$2.50"
                       }
                     }
                   ]
                 }
               }
             }
           } = json_response(public_card_conn, 200)
  end

  defp global_deck_id(deck) do
    Absinthe.Relay.Node.to_global_id(:deck, deck.id, ManavaultWeb.Schema)
  end
end
