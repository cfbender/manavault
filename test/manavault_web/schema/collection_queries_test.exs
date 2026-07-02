defmodule ManavaultWeb.Schema.CollectionQueriesTest do
  use ManavaultWeb.ConnCase

  import Ecto.Query, only: [from: 2]

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
          locations(first: 10) {
            pageInfo {
              endCursor
              hasNextPage
            }
            edges {
              node {
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
            }
          }
          collectionItems(first: 10) {
            pageInfo {
              endCursor
              hasNextPage
            }
            edges {
              node {
                priceText
                allocatedQuantity
                printing { imageUrl card { name } }
                purchasePriceText
                valueGainText
                valueGainPercentText
                location { name }
              }
            }
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
               "locations" => %{
                 "pageInfo" => %{"endCursor" => _, "hasNextPage" => false},
                 "edges" => [
                   %{
                     "node" => %{
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
                     }
                   },
                   %{
                     "node" => %{
                       "id" => _unfiled_id,
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
                   }
                 ]
               },
               "collectionItemCount" => 3,
               "collectionValueSummary" => %{
                 "totalPriceText" => "$37.02",
                 "purchasePriceText" => "$37.02",
                 "valueGainText" => "$0",
                 "valueGainPercentText" => "0%"
               },
               "collectionItems" => %{
                 "pageInfo" => %{"endCursor" => _, "hasNextPage" => false},
                 "edges" => [
                   %{
                     "node" => %{
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
                   }
                 ]
               }
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

    card_id =
      Absinthe.Relay.Node.to_global_id(:card, "oracle-owned-card", ManavaultWeb.Schema)

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query CardOwnedCounts($id: ID!) {
          card(id: $id) {
            oracleTags {
              id
              slug
              label
              weight
              annotation
            }
            deckCategory
            deckThemes
            printings(first: 10) {
              pageInfo {
                endCursor
                hasNextPage
              }
              edges {
                node {
                  scryfallId
                  ownedCount
                }
              }
            }
          }
          collectionItemCount(filters: { cardId: $id })
          collectionItems(first: 10, filters: { cardId: $id }) {
            edges {
              node {
                quantity
                printing { scryfallId }
                location { name }
              }
            }
          }
        }
        """,
        "variables" => %{"id" => card_id}
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
                 "printings" => %{
                   "pageInfo" => %{"endCursor" => _, "hasNextPage" => false},
                   "edges" => [
                     %{
                       "node" => %{
                         "scryfallId" => "scryfall-owned-new",
                         "ownedCount" => 1
                       }
                     },
                     %{
                       "node" => %{
                         "scryfallId" => "scryfall-owned-old",
                         "ownedCount" => 3
                       }
                     }
                   ]
                 }
               }
             }
           } = json_response(conn, 200)

    assert %{
             "data" => %{
               "collectionItemCount" => 4,
               "collectionItems" => %{
                 "edges" => [
                   %{
                     "node" => %{
                       "quantity" => 1,
                       "printing" => %{"scryfallId" => "scryfall-owned-new"}
                     }
                   },
                   %{
                     "node" => %{
                       "quantity" => 2,
                       "printing" => %{"scryfallId" => "scryfall-owned-old"}
                     }
                   },
                   %{
                     "node" => %{
                       "quantity" => 1,
                       "printing" => %{"scryfallId" => "scryfall-owned-old"}
                     }
                   }
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

    location_id =
      Absinthe.Relay.Node.to_global_id(:location, "unfiled", ManavaultWeb.Schema)

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query UnfiledLocation($id: ID!) {
          location(id: $id) {
            id
            name
            kind
            itemCount
            totalPriceText
            collectionItems(first: 10) {
              pageInfo {
                endCursor
                hasNextPage
              }
              edges {
                node {
                  quantity
                  location { name }
                  printing { card { name } }
                }
              }
            }
          }
          unfiledCollectionItemCount: collectionItemCount(filters: {locationId: "unfiled"})
          unfiledCollectionItems: collectionItems(first: 10, filters: {locationId: "unfiled"}) {
            edges {
              node {
                quantity
                location { name }
                printing { card { name } }
              }
            }
          }
        }
        """,
        "variables" => %{"id" => location_id}
      })

    assert %{
             "data" => %{
               "location" => %{
                 "id" => _id,
                 "name" => "Unfiled",
                 "kind" => "unfiled",
                 "itemCount" => 4,
                 "totalPriceText" => "$2",
                 "collectionItems" => %{
                   "pageInfo" => %{"endCursor" => _, "hasNextPage" => false},
                   "edges" => [
                     %{
                       "node" => %{
                         "quantity" => 4,
                         "location" => nil,
                         "printing" => %{"card" => %{"name" => "Loose Card"}}
                       }
                     }
                   ]
                 }
               },
               "unfiledCollectionItemCount" => 4,
               "unfiledCollectionItems" => %{
                 "edges" => [
                   %{
                     "node" => %{
                       "quantity" => 4,
                       "location" => nil,
                       "printing" => %{"card" => %{"name" => "Loose Card"}}
                     }
                   }
                 ]
               }
             }
           } = json_response(conn, 200)
  end

  test "collection items filter by added window", %{conn: conn} do
    {:ok, %{cards_count: 2, printings_count: 2}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-old",
          "oracle_id" => "oracle-old",
          "name" => "Old Card",
          "type_line" => "Creature",
          "collector_number" => "1",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "rarity" => "common",
          "image_uris" => %{},
          "prices" => %{"usd" => "1.00"},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        },
        %{
          "id" => "scryfall-new",
          "oracle_id" => "oracle-new",
          "name" => "New Card",
          "type_line" => "Creature",
          "collector_number" => "2",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "rarity" => "common",
          "image_uris" => %{},
          "prices" => %{"usd" => "2.00"},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, old_item} =
      Catalog.create_collection_item(%{scryfall_id: "scryfall-old", quantity: 2})

    {:ok, _new_item} =
      Catalog.create_collection_item(%{scryfall_id: "scryfall-new", quantity: 3})

    eight_days_ago =
      DateTime.utc_now() |> DateTime.add(-8, :day) |> DateTime.truncate(:second)

    {1, nil} =
      Manavault.Repo.update_all(
        from(item in Manavault.Catalog.CollectionItem, where: item.id == ^old_item.id),
        set: [inserted_at: eight_days_ago]
      )

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          recentCount: collectionItemCount(filters: {addedWithinDays: 7})
          recentItems: collectionItems(first: 10, filters: {addedWithinDays: 7}) {
            edges {
              node {
                quantity
                printing { card { name } }
              }
            }
          }
        }
        """
      })

    assert %{
             "data" => %{
               "recentCount" => 3,
               "recentItems" => %{
                 "edges" => [
                   %{
                     "node" => %{
                       "quantity" => 3,
                       "printing" => %{"card" => %{"name" => "New Card"}}
                     }
                   }
                 ]
               }
             }
           } = json_response(conn, 200)
  end

  test "collection value summary scopes to filters", %{conn: conn} do
    {:ok, %{cards_count: 2, printings_count: 2}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-filed",
          "oracle_id" => "oracle-filed",
          "name" => "Filed Card",
          "type_line" => "Creature",
          "collector_number" => "1",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "rarity" => "rare",
          "image_uris" => %{},
          "prices" => %{"usd" => "10.00"},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        },
        %{
          "id" => "scryfall-loose",
          "oracle_id" => "oracle-loose",
          "name" => "Loose Card",
          "type_line" => "Creature",
          "collector_number" => "2",
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

    {:ok, location} = Catalog.create_location(%{name: "Binder", kind: "binder"})

    {:ok, _filed} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-filed",
        location_id: location.id,
        quantity: 2
      })

    {:ok, _loose} =
      Catalog.create_collection_item(%{
        scryfall_id: "scryfall-loose",
        quantity: 4
      })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          collectionValueSummary { totalPriceText purchasePriceText }
          unfiledValueSummary: collectionValueSummary(filters: {locationId: "unfiled"}) {
            totalPriceText
            purchasePriceText
          }
          searchedValueSummary: collectionValueSummary(filters: {q: "Filed"}) {
            totalPriceText
            purchasePriceText
          }
        }
        """
      })

    assert %{
             "data" => %{
               "collectionValueSummary" => %{
                 "totalPriceText" => "$22",
                 "purchasePriceText" => "$22"
               },
               "unfiledValueSummary" => %{
                 "totalPriceText" => "$2",
                 "purchasePriceText" => "$2"
               },
               "searchedValueSummary" => %{
                 "totalPriceText" => "$20",
                 "purchasePriceText" => "$20"
               }
             }
           } = json_response(conn, 200)
  end
end
