defmodule ManavaultWeb.Schema.DeckAllocationsTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog

  defp global_id(type, id),
    do: Absinthe.Relay.Node.to_global_id(type, id, ManavaultWeb.Schema)

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
            deckCard {
              id
              quantity
              zone
              finish
              card { name }
              preferredPrinting { scryfallId }
            }
          }
        }
        """,
        "variables" => %{
          "id" => global_id(:collection_item, item.id),
          "deckId" => global_id(:deck, deck.id),
          "zone" => "sideboard"
        }
      })

    assert %{
             "data" => %{
               "addCollectionItemToDeck" => %{
                 "deckCard" => %{
                   "id" => _id,
                   "quantity" => 1,
                   "zone" => "sideboard",
                   "finish" => "nonfoil",
                   "card" => %{"name" => "Deck Add Card"},
                   "preferredPrinting" => %{"scryfallId" => "scryfall-printing-deck-add"}
                 }
               }
             }
           } = json_response(conn, 200)

    [deck_card] = Catalog.get_deck!(deck.id).deck_cards
    status = Catalog.deck_card_allocation_status(deck_card)
    assert status.allocated == 1
  end

  test "deck allocation status and allocation mutations are available over GraphQL", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-allocation-status",
          "oracle_id" => "oracle-allocation-status",
          "name" => "Allocation Status Card",
          "type_line" => "Artifact",
          "collector_number" => "8",
          "set" => "alc",
          "set_name" => "Allocation Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-allocation-status",
        quantity: 1,
        finish: "nonfoil"
      })

    {:ok, deck} = Catalog.create_deck(%{"name" => "Allocation Deck"})
    {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Allocation Status Card"})

    status_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query Deck($id: ID!) {
          deck(id: $id) {
            deckCards(first: 10) {
              pageInfo { endCursor hasNextPage }
              edges {
                node {
                  id
                  allocationStatus {
                    state
                    required
                    owned
                    available
                    allocated
                    missing
                    candidates {
                      available
                      item { id quantity printing { card { name } } }
                    }
                  }
                }
              }
            }
          }
        }
        """,
        "variables" => %{"id" => global_id(:deck, deck.id)}
      })

    assert %{
             "data" => %{
               "deck" => %{
                 "deckCards" => %{
                   "pageInfo" => %{"endCursor" => _end_cursor, "hasNextPage" => false},
                   "edges" => [
                     %{
                       "node" => %{
                         "id" => _id,
                         "allocationStatus" => %{
                           "state" => "available",
                           "required" => 1,
                           "owned" => 1,
                           "available" => 1,
                           "allocated" => 0,
                           "missing" => 0,
                           "candidates" => [
                             %{
                               "available" => 1,
                               "item" => %{
                                 "id" => _item_id,
                                 "quantity" => 1,
                                 "printing" => %{"card" => %{"name" => "Allocation Status Card"}}
                               }
                             }
                           ]
                         }
                       }
                     }
                   ]
                 }
               }
             }
           } = json_response(status_conn, 200)

    allocate_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation Allocate($deckCardId: ID!, $collectionItemId: ID!) {
          allocateDeckCardItem(deckCardId: $deckCardId, collectionItemId: $collectionItemId) {
            deckCard {
              id
              allocationStatus { state allocated available missing }
            }
          }
        }
        """,
        "variables" => %{
          "deckCardId" => global_id(:deck_card, deck_card.id),
          "collectionItemId" => global_id(:collection_item, item.id)
        }
      })

    assert %{
             "data" => %{
               "allocateDeckCardItem" => %{
                 "deckCard" => %{
                   "allocationStatus" => %{
                     "state" => "allocated",
                     "allocated" => 1,
                     "available" => 0,
                     "missing" => 0
                   }
                 }
               }
             }
           } = json_response(allocate_conn, 200)

    visibility_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query Visibility($unfiledId: ID!) {
          location(id: $unfiledId) {
            itemCount
            collectionItems(first: 10) {
              pageInfo { hasNextPage }
              edges { node { id } }
            }
          }
          collectionItems(first: 10) {
            pageInfo { hasNextPage }
            edges {
              node {
                allocatedQuantity
                allocationDecks {
                  quantity
                  deck { name }
                }
                printing { card { name } }
              }
            }
          }
        }
        """,
        "variables" => %{"unfiledId" => global_id(:location, "unfiled")}
      })

    assert %{
             "data" => %{
               "location" => %{
                 "itemCount" => 0,
                 "collectionItems" => %{
                   "pageInfo" => %{"hasNextPage" => false},
                   "edges" => []
                 }
               },
               "collectionItems" => %{
                 "pageInfo" => %{"hasNextPage" => false},
                 "edges" => [
                   %{
                     "node" => %{
                       "allocatedQuantity" => 1,
                       "allocationDecks" => [
                         %{"quantity" => 1, "deck" => %{"name" => "Allocation Deck"}}
                       ],
                       "printing" => %{"card" => %{"name" => "Allocation Status Card"}}
                     }
                   }
                 ]
               }
             }
           } = json_response(visibility_conn, 200)

    [loaded_deck_card] = Catalog.get_deck!(deck.id).deck_cards

    allocated_item_id =
      loaded_deck_card
      |> Catalog.deck_card_allocation_status()
      |> Map.fetch!(:candidates)
      |> Enum.find(&(&1.allocated == 1))
      |> Map.fetch!(:item)
      |> Map.fetch!(:id)

    deallocate_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation Deallocate($deckCardId: ID!, $collectionItemId: ID!) {
          deallocateDeckCardItem(deckCardId: $deckCardId, collectionItemId: $collectionItemId) {
            deckCard {
              id
              allocationStatus { state allocated available missing }
            }
          }
        }
        """,
        "variables" => %{
          "deckCardId" => global_id(:deck_card, deck_card.id),
          "collectionItemId" => global_id(:collection_item, allocated_item_id)
        }
      })

    assert %{
             "data" => %{
               "deallocateDeckCardItem" => %{
                 "deckCard" => %{
                   "allocationStatus" => %{
                     "state" => "available",
                     "allocated" => 0,
                     "available" => 1,
                     "missing" => 0
                   }
                 }
               }
             }
           } = json_response(deallocate_conn, 200)
  end
end
