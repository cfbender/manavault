defmodule ManavaultWeb.Schema.CollectionItemSelectorTest do
  use ManavaultWeb.ConnCase

  alias Absinthe.Relay.Node
  alias Manavault.Catalog

  defp import_selector_cards do
    cards =
      for index <- 1..3 do
        %{
          "id" => "scryfall-selector-#{index}",
          "oracle_id" => "oracle-selector-#{index}",
          "name" => "Selector Card #{index}",
          "type_line" => "Artifact",
          "collector_number" => "#{index}",
          "set" => "sel",
          "set_name" => "Selector Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil", "foil"],
          "legalities" => %{}
        }
      end

    assert {:ok, %{cards_count: 3, printings_count: 3}} = Catalog.import_cards(cards)
  end

  defp create_items(location_id, quantity \\ 1) do
    for index <- 1..3 do
      {:ok, item} =
        Catalog.create_collection_item(%{
          scryfall_id: "scryfall-selector-#{index}",
          quantity: quantity,
          finish: "nonfoil",
          location_id: location_id
        })

      item
    end
  end

  defp global_id(type, id), do: Node.to_global_id(type, id, ManavaultWeb.Schema)

  test "all selector updates every filtered item except exclusions", %{conn: conn} do
    import_selector_cards()
    {:ok, inside} = Catalog.create_location(%{name: "Inside Box", kind: "box"})
    {:ok, outside} = Catalog.create_location(%{name: "Outside Box", kind: "box"})

    [first, second, third] = create_items(inside.id)

    {:ok, other_location_item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-selector-1",
        quantity: 1,
        finish: "nonfoil",
        location_id: outside.id
      })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation Bulk($selector: CollectionItemSelector!, $input: CollectionItemUpdateInput!) {
          bulkUpdateCollectionItems(selector: $selector, input: $input) {
            updatedCount
          }
        }
        """,
        "variables" => %{
          "selector" => %{
            "all" => true,
            "filters" => %{"locationId" => global_id(:location, inside.id)},
            "excludedIds" => [global_id(:collection_item, second.id)]
          },
          "input" => %{"finish" => "foil"}
        }
      })

    assert %{
             "data" => %{"bulkUpdateCollectionItems" => %{"updatedCount" => 2}}
           } = json_response(conn, 200)

    assert Catalog.get_collection_item!(first.id).finish == "foil"
    assert Catalog.get_collection_item!(second.id).finish == "nonfoil"
    assert Catalog.get_collection_item!(third.id).finish == "foil"
    assert Catalog.get_collection_item!(other_location_item.id).finish == "nonfoil"
  end

  test "all selector bulk delete removes filtered items and reports the count", %{conn: conn} do
    import_selector_cards()
    {:ok, location} = Catalog.create_location(%{name: "Delete Box", kind: "box"})
    [_first, second, _third] = create_items(location.id)

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation BulkDelete($selector: CollectionItemSelector!) {
          bulkDeleteCollectionItems(selector: $selector) {
            deletedCount
          }
        }
        """,
        "variables" => %{
          "selector" => %{
            "all" => true,
            "filters" => %{"locationId" => global_id(:location, location.id)},
            "excludedIds" => [global_id(:collection_item, second.id)]
          }
        }
      })

    assert %{
             "data" => %{"bulkDeleteCollectionItems" => %{"deletedCount" => 2}}
           } = json_response(conn, 200)

    assert [remaining] = Catalog.list_collection_items()
    assert remaining.id == second.id
  end

  test "explicit ids selector bulk delete removes exactly those items", %{conn: conn} do
    import_selector_cards()
    [first, second, third] = create_items(nil)

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation BulkDelete($selector: CollectionItemSelector!) {
          bulkDeleteCollectionItems(selector: $selector) {
            deletedCount
          }
        }
        """,
        "variables" => %{
          "selector" => %{
            "ids" => [
              global_id(:collection_item, first.id),
              global_id(:collection_item, third.id)
            ]
          }
        }
      })

    assert %{
             "data" => %{"bulkDeleteCollectionItems" => %{"deletedCount" => 2}}
           } = json_response(conn, 200)

    assert [remaining] = Catalog.list_collection_items()
    assert remaining.id == second.id
  end

  test "all selector adds filtered items to a deck", %{conn: conn} do
    import_selector_cards()
    {:ok, location} = Catalog.create_location(%{name: "Deck Box", kind: "box"})
    create_items(location.id)
    {:ok, deck} = Catalog.create_deck(%{"name" => "Selector Deck"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation BulkAdd($deckId: ID!, $selector: CollectionItemSelector!) {
          bulkAddCollectionItemsToDeck(deckId: $deckId, selector: $selector) {
            deckCards {
              id
              quantity
            }
          }
        }
        """,
        "variables" => %{
          "deckId" => global_id(:deck, deck.id),
          "selector" => %{
            "all" => true,
            "filters" => %{"locationId" => global_id(:location, location.id)}
          }
        }
      })

    assert %{
             "data" => %{"bulkAddCollectionItemsToDeck" => %{"deckCards" => deck_cards}}
           } = json_response(conn, 200)

    assert length(deck_cards) == 3
  end

  test "pagination uses row count, so quantity sums can't produce phantom pages", %{conn: conn} do
    import_selector_cards()
    # 3 rows, but a quantity sum of 12: the old pagination kept hasNextPage
    # true until the offset crossed 12, serving empty pages 2 and 3.
    create_items(nil, 4)

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query Page {
          collectionItems(first: 5) {
            pageInfo {
              hasNextPage
            }
            edges {
              node {
                id
              }
            }
          }
          collectionItemCount
          collectionItemEntryCount
        }
        """
      })

    assert %{
             "data" => %{
               "collectionItems" => %{
                 "pageInfo" => %{"hasNextPage" => false},
                 "edges" => edges
               },
               "collectionItemCount" => 12,
               "collectionItemEntryCount" => 3
             }
           } = json_response(conn, 200)

    assert length(edges) == 3
  end
end
