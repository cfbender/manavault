defmodule ManavaultWeb.Schema.CollectionItemsTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog

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
          "prices" => %{"usd" => "1.25", "usd_foil" => "3.50"},
          "legalities" => %{}
        }
      ])

    {:ok, location} = Catalog.create_location(%{name: "Trade Binder", kind: "binder"})

    printing_id =
      Absinthe.Relay.Node.to_global_id(:printing, "scryfall-printing-2", ManavaultWeb.Schema)

    location_id =
      Absinthe.Relay.Node.to_global_id(:location, location.id, ManavaultWeb.Schema)

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation CreateCollectionItem($input: CollectionItemInput!) {
          createCollectionItem(input: $input) {
            collectionItem {
              id
              quantity
              condition
              language
              finish
              notes
              printing { scryfallId card { name } }
              purchasePriceCents
              purchasePriceText
              valueGainText
              valueGainPercentText
              location { id name }
            }
          }
        }
        """,
        "variables" => %{
          "input" => %{
            "scryfallId" => printing_id,
            "quantity" => 2,
            "condition" => "near_mint",
            "language" => "en",
            "finish" => "foil",
            "locationId" => location_id,
            "notes" => "Fresh pull"
          }
        }
      })

    assert %{
             "data" => %{
               "createCollectionItem" => %{
                 "collectionItem" => %{
                   "quantity" => 2,
                   "condition" => "near_mint",
                   "language" => "en",
                   "finish" => "foil",
                   "notes" => "Fresh pull",
                   "purchasePriceCents" => 350,
                   "purchasePriceText" => "$3.50",
                   "valueGainText" => "$0",
                   "valueGainPercentText" => "0%",
                   "printing" => %{
                     "scryfallId" => "scryfall-printing-2",
                     "card" => %{"name" => "New Collection Card"}
                   },
                   "location" => %{"id" => _id, "name" => "Trade Binder"}
                 }
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
          "prices" => %{"usd" => "2.00", "usd_foil" => "5.00"},
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

    item_id =
      Absinthe.Relay.Node.to_global_id(:collection_item, item.id, ManavaultWeb.Schema)

    new_location_id =
      Absinthe.Relay.Node.to_global_id(:location, new_location.id, ManavaultWeb.Schema)

    update_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation UpdateCollectionItem($id: ID!, $input: CollectionItemUpdateInput!) {
          updateCollectionItem(id: $id, input: $input) {
            collectionItem {
              id
              quantity
              condition
              language
              finish
              notes
              purchasePriceCents
              purchasePriceText
              valueGainText
              valueGainPercentText
              location { name }
            }
          }
        }
        """,
        "variables" => %{
          "id" => item_id,
          "input" => %{
            "quantity" => 4,
            "condition" => "lightly_played",
            "language" => "ja",
            "finish" => "foil",
            "locationId" => new_location_id,
            "notes" => "Moved",
            "purchasePriceCents" => 1234
          }
        }
      })

    assert %{
             "data" => %{
               "updateCollectionItem" => %{
                 "collectionItem" => %{
                   "id" => _id,
                   "quantity" => 4,
                   "condition" => "lightly_played",
                   "language" => "ja",
                   "finish" => "foil",
                   "notes" => "Moved",
                   "purchasePriceCents" => 1234,
                   "purchasePriceText" => "$12.34",
                   "valueGainText" => "-$7.34",
                   "valueGainPercentText" => "-59.5%",
                   "location" => %{"name" => "New List"}
                 }
               }
             }
           } = json_response(update_conn, 200)

    delete_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation DeleteCollectionItem($id: ID!) {
          deleteCollectionItem(id: $id) {
            collectionItem {
              id
            }
          }
        }
        """,
        "variables" => %{"id" => item_id}
      })

    assert %{
             "data" => %{
               "deleteCollectionItem" => %{"collectionItem" => %{"id" => _id}}
             }
           } =
             json_response(delete_conn, 200)

    assert [] = Catalog.list_collection_items()
  end

  test "bulk update collection items mutation edits selected item fields", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-bulk-update",
          "oracle_id" => "oracle-bulk-update",
          "name" => "Bulk Update Card",
          "type_line" => "Artifact",
          "collector_number" => "42",
          "set" => "blk",
          "set_name" => "Bulk Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil", "foil"],
          "prices" => %{"usd" => "2.00", "usd_foil" => "5.00"},
          "legalities" => %{}
        }
      ])

    {:ok, first_item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-printing-bulk-update",
        quantity: 1,
        purchase_price_cents: 100
      })

    {:ok, second_item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-printing-bulk-update",
        quantity: 2,
        purchase_price_cents: 200
      })

    ids =
      Enum.map([first_item, second_item], fn item ->
        Absinthe.Relay.Node.to_global_id(:collection_item, item.id, ManavaultWeb.Schema)
      end)

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation BulkUpdateCollectionItems($ids: [ID!]!, $input: CollectionItemUpdateInput!) {
          bulkUpdateCollectionItems(ids: $ids, input: $input) {
            collectionItems {
              id
              quantity
              finish
              purchasePriceCents
              purchasePriceText
            }
          }
        }
        """,
        "variables" => %{
          "ids" => ids,
          "input" => %{
            "finish" => "foil",
            "purchasePriceCents" => 1234
          }
        }
      })

    assert %{
             "data" => %{
               "bulkUpdateCollectionItems" => %{
                 "collectionItems" => [
                   %{
                     "quantity" => 1,
                     "finish" => "foil",
                     "purchasePriceCents" => 1234,
                     "purchasePriceText" => "$12.34"
                   },
                   %{
                     "quantity" => 2,
                     "finish" => "foil",
                     "purchasePriceCents" => 1234,
                     "purchasePriceText" => "$12.34"
                   }
                 ]
               }
             }
           } = json_response(conn, 200)
  end
end
