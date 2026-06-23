defmodule ManavaultWeb.Schema.CollectionQueriesTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog

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
            valueSummary {
              totalPriceText
              purchasePriceText
              valueGainText
              valueGainPercentText
            }
          }
          collectionItems {
            priceText
            allocatedQuantity
            printing { imageUrl card { name } }
            purchasePriceText
            valueGainText
            valueGainPercentText
            location { name }
          }
          collectionItemCount
          collectionValueSummary {
            totalPriceText
            purchasePriceText
            valueGainText
            valueGainPercentText
          }
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
                   "totalPriceText" => "$37.02",
                   "valueSummary" => %{
                     "totalPriceText" => "$37.02",
                     "purchasePriceText" => "$37.02",
                     "valueGainText" => "$0",
                     "valueGainPercentText" => "0%"
                   }
                 },
                 %{
                   "id" => "unfiled",
                   "name" => "Unfiled",
                   "kind" => "unfiled",
                   "coverPrinting" => nil,
                   "itemCount" => 0,
                   "totalPriceText" => "$0",
                   "valueSummary" => %{
                     "totalPriceText" => "$0",
                     "purchasePriceText" => "$0",
                     "valueGainText" => "$0",
                     "valueGainPercentText" => nil
                   }
                 }
               ],
               "collectionItemCount" => 3,
               "collectionValueSummary" => %{
                 "totalPriceText" => "$37.02",
                 "purchasePriceText" => "$37.02",
                 "valueGainText" => "$0",
                 "valueGainPercentText" => "0%"
               },
               "collectionItems" => [
                 %{
                   "allocatedQuantity" => 0,
                   "location" => %{"name" => "Binder"},
                   "priceText" => "$12.34",
                   "purchasePriceText" => "$12.34",
                   "valueGainText" => "$0",
                   "valueGainPercentText" => "0%",
                   "printing" => %{
                     "card" => %{"name" => "Test Card"},
                     "imageUrl" => "https://example.test/card.jpg"
                   }
                 }
               ]
             }
           } = json_response(conn, 200)
  end

  test "card query resolves owned counts per printing", %{conn: conn} do
    {:ok, %{printings_count: 2}} =
      Catalog.import_cards(
        [
          %{
            "id" => "scryfall-owned-old",
            "oracle_id" => "oracle-owned-card",
            "name" => "Owned Card",
            "type_line" => "Artifact",
            "collector_number" => "1",
            "set" => "old",
            "set_name" => "Old Set",
            "lang" => "en",
            "rarity" => "rare",
            "image_uris" => %{},
            "prices" => %{"usd" => "1.00"},
            "finishes" => ["nonfoil"],
            "released_at" => "1993-08-05",
            "legalities" => %{}
          },
          %{
            "id" => "scryfall-owned-new",
            "oracle_id" => "oracle-owned-card",
            "name" => "Owned Card",
            "type_line" => "Artifact",
            "collector_number" => "2",
            "set" => "new",
            "set_name" => "New Set",
            "lang" => "en",
            "rarity" => "rare",
            "image_uris" => %{},
            "prices" => %{"usd" => "2.00"},
            "finishes" => ["nonfoil"],
            "released_at" => "1994-08-05",
            "legalities" => %{}
          }
        ],
        nil,
        oracle_tags: [
          %{
            "object" => "tag",
            "id" => "tag-card-draw",
            "slug" => "card-draw",
            "label" => "Card Draw",
            "type" => "function",
            "description" => nil,
            "parent_ids" => [],
            "child_ids" => [],
            "aliases" => [],
            "taggings" => [
              %{
                "oracle_id" => "oracle-owned-card",
                "weight" => 0.72,
                "annotation" => "draws extra cards"
              }
            ]
          }
        ]
      )

    {:ok, binder} = Catalog.create_location(%{name: "Binder", kind: "binder"})
    {:ok, list} = Catalog.create_location(%{name: "Wishlist", kind: "list"})

    {:ok, _item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-owned-old",
        location_id: binder.id,
        quantity: 2
      })

    {:ok, _item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-owned-old",
        quantity: 1
      })

    {:ok, _item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-owned-new",
        location_id: binder.id,
        quantity: 1
      })

    {:ok, _list_item} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-owned-new",
        location_id: list.id,
        quantity: 5
      })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          card(id: "oracle-owned-card") {
            oracleTags {
              id
              slug
              label
              weight
              annotation
            }
            deckCategory
            deckThemes
            printings {
              scryfallId
              ownedCount
            }
          }
        }
        """
      })

    assert %{
             "data" => %{
               "card" => %{
                 "oracleTags" => [
                   %{
                     "id" => "tag-card-draw",
                     "slug" => "card-draw",
                     "label" => "Card Draw",
                     "weight" => "0.72",
                     "annotation" => "draws extra cards"
                   }
                 ],
                 "deckCategory" => "card_advantage",
                 "deckThemes" => deck_themes,
                 "printings" => [
                   %{"scryfallId" => "scryfall-owned-new", "ownedCount" => 1},
                   %{"scryfallId" => "scryfall-owned-old", "ownedCount" => 3}
                 ]
               }
             }
           } = json_response(conn, 200)

    assert "card_advantage" in deck_themes
    assert "artifact" in deck_themes
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
end
