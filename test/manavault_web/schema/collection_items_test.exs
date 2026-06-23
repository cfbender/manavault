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
            purchasePriceCents
            purchasePriceText
            valueGainText
            valueGainPercentText
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
            purchasePriceCents
            purchasePriceText
            valueGainText
            valueGainPercentText
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
            "notes" => "Moved",
            "purchasePriceCents" => 1234
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
                 "purchasePriceCents" => 1234,
                 "purchasePriceText" => "$12.34",
                 "valueGainText" => "-$7.34",
                 "valueGainPercentText" => "-59.5%",
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

    assert %{"data" => %{"deleteCollectionItem" => %{"id" => _id}}} =
             json_response(delete_conn, 200)

    assert [] = Catalog.list_collection_items()
  end
end
