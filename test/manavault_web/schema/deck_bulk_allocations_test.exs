defmodule ManavaultWeb.Schema.DeckBulkAllocationsTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog

  defp global_id(type, id),
    do: Absinthe.Relay.Node.to_global_id(type, id, ManavaultWeb.Schema)

  test "deck proxy allocation mutations are available over GraphQL", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-proxy-allocation",
          "oracle_id" => "oracle-proxy-allocation",
          "name" => "Proxy Allocation Card",
          "type_line" => "Artifact",
          "collector_number" => "9",
          "set" => "pxy",
          "set_name" => "Proxy Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Proxy Allocation Deck"})
    {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Proxy Allocation Card"})

    allocate_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation AllocateProxy($deckCardId: ID!) {
          allocateDeckCardProxy(deckCardId: $deckCardId) {
            deckCard {
              id
              allocationStatus { state allocated proxyAllocated available missing }
            }
          }
        }
        """,
        "variables" => %{"deckCardId" => global_id(:deck_card, deck_card.id)}
      })

    assert %{
             "data" => %{
               "allocateDeckCardProxy" => %{
                 "deckCard" => %{
                   "allocationStatus" => %{
                     "state" => "allocated",
                     "allocated" => 1,
                     "proxyAllocated" => 1,
                     "available" => 0,
                     "missing" => 0
                   }
                 }
               }
             }
           } = json_response(allocate_conn, 200)

    deallocate_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation DeallocateProxy($deckCardId: ID!) {
          deallocateDeckCardProxy(deckCardId: $deckCardId) {
            deckCard {
              id
              allocationStatus { state allocated proxyAllocated available missing }
            }
          }
        }
        """,
        "variables" => %{"deckCardId" => global_id(:deck_card, deck_card.id)}
      })

    assert %{
             "data" => %{
               "deallocateDeckCardProxy" => %{
                 "deckCard" => %{
                   "allocationStatus" => %{
                     "state" => "missing",
                     "allocated" => 0,
                     "proxyAllocated" => 0,
                     "available" => 0,
                     "missing" => 1
                   }
                 }
               }
             }
           } = json_response(deallocate_conn, 200)
  end

  test "bulk deck allocation preview and mutation are available over GraphQL", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-bulk-allocation",
          "oracle_id" => "oracle-bulk-allocation",
          "name" => "Bulk Allocation Card",
          "type_line" => "Artifact",
          "collector_number" => "9",
          "set" => "alc",
          "set_name" => "Allocation Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, _item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-bulk-allocation",
        quantity: 2,
        finish: "nonfoil"
      })

    {:ok, deck} = Catalog.create_deck(%{"name" => "Bulk Allocation Deck"})

    {:ok, _deck_card} =
      Catalog.add_card_to_deck(deck, %{
        "name" => "Bulk Allocation Card",
        "quantity" => 2,
        "preferred_printing_id" => "scryfall-bulk-allocation"
      })

    preview_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation PreviewBulkAllocateDeck($id: ID!, $mode: String!) {
          previewBulkAllocateDeck(id: $id, mode: $mode) {
            allocationPreview {
              mode
              allocated
              cards
              skipped
              entries {
                quantity
                exact
                deckCard { card { name } preferredPrinting { setCode collectorNumber } }
                item { quantity printing { card { name } setCode collectorNumber } }
              }
            }
          }
        }
        """,
        "variables" => %{"id" => global_id(:deck, deck.id), "mode" => "exact_printings"}
      })

    assert %{
             "data" => %{
               "previewBulkAllocateDeck" => %{
                 "allocationPreview" => %{
                   "mode" => "exact_printings",
                   "allocated" => 2,
                   "cards" => 1,
                   "skipped" => 0,
                   "entries" => [
                     %{
                       "quantity" => 2,
                       "exact" => true,
                       "deckCard" => %{
                         "card" => %{"name" => "Bulk Allocation Card"},
                         "preferredPrinting" => %{"setCode" => "alc", "collectorNumber" => "9"}
                       },
                       "item" => %{
                         "quantity" => 2,
                         "printing" => %{
                           "card" => %{"name" => "Bulk Allocation Card"},
                           "setCode" => "alc",
                           "collectorNumber" => "9"
                         }
                       }
                     }
                   ]
                 }
               }
             }
           } = json_response(preview_conn, 200)

    allocate_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation BulkAllocateDeck($id: ID!, $mode: String!) {
          bulkAllocateDeck(id: $id, mode: $mode) {
            allocationResult {
              allocated
              cards
              skipped
            }
          }
        }
        """,
        "variables" => %{"id" => global_id(:deck, deck.id), "mode" => "exact_printings"}
      })

    assert %{
             "data" => %{
               "bulkAllocateDeck" => %{
                 "allocationResult" => %{
                   "allocated" => 2,
                   "cards" => 1,
                   "skipped" => 0
                 }
               }
             }
           } = json_response(allocate_conn, 200)
  end
end
