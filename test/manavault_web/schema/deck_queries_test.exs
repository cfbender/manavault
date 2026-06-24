defmodule ManavaultWeb.Schema.DeckQueriesTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog

  test "create deck mutation creates a deck", %{conn: conn} do
    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation CreateDeck($input: DeckInput!) {
          createDeck(input: $input) {
            deck {
              id
              name
              format
              status
              cardCount
              uniqueCardCount
            }
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
                 "deck" => %{
                   "id" => _id,
                   "name" => "Knife Drawer",
                   "format" => "commander",
                   "status" => "brewing",
                   "cardCount" => 0,
                   "uniqueCardCount" => 0
                 }
               }
             }
           } = json_response(conn, 200)
  end

  test "deck counts exclude sideboard and maybeboard cards", %{conn: conn} do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([
               %{
                 "id" => "scryfall-count-main",
                 "oracle_id" => "oracle-count-main",
                 "name" => "Count Main",
                 "type_line" => "Creature",
                 "collector_number" => "1",
                 "set" => "cnt",
                 "set_name" => "Count Set",
                 "lang" => "en",
                 "image_uris" => %{},
                 "finishes" => ["nonfoil"],
                 "legalities" => %{}
               },
               %{
                 "id" => "scryfall-count-commander",
                 "oracle_id" => "oracle-count-commander",
                 "name" => "Count Commander",
                 "type_line" => "Legendary Creature",
                 "collector_number" => "2",
                 "set" => "cnt",
                 "set_name" => "Count Set",
                 "lang" => "en",
                 "image_uris" => %{},
                 "finishes" => ["nonfoil"],
                 "legalities" => %{}
               }
             ])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Count Test", "format" => "commander"})

    assert {:ok, _mainboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Count Main",
               "quantity" => 2,
               "zone" => "mainboard"
             })

    assert {:ok, _commander} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Count Commander",
               "quantity" => 1,
               "zone" => "commander"
             })

    assert {:ok, _sideboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Count Main",
               "quantity" => 4,
               "zone" => "sideboard"
             })

    assert {:ok, _maybeboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Count Commander",
               "quantity" => 8,
               "zone" => "maybeboard"
             })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query Deck($id: ID!) {
          deck(id: $id) {
            cardCount
            uniqueCardCount
          }
        }
        """,
        "variables" => %{"id" => global_deck_id(deck)}
      })

    assert %{
             "data" => %{
               "deck" => %{
                 "cardCount" => 3,
                 "uniqueCardCount" => 2
               }
             }
           } = json_response(conn, 200)
  end

  test "decks query exposes lightweight summary fields", %{conn: conn} do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([
               %{
                 "id" => "scryfall-summary-main",
                 "oracle_id" => "oracle-summary-main",
                 "name" => "Summary Main",
                 "type_line" => "Creature",
                 "collector_number" => "1",
                 "set" => "sum",
                 "set_name" => "Summary Set",
                 "lang" => "en",
                 "image_uris" => %{"art_crop" => "https://example.test/summary-main-art.jpg"},
                 "finishes" => ["nonfoil"],
                 "legalities" => %{}
               },
               %{
                 "id" => "scryfall-summary-commander",
                 "oracle_id" => "oracle-summary-commander",
                 "name" => "Summary Commander",
                 "type_line" => "Legendary Creature",
                 "color_identity" => ["G", "U"],
                 "collector_number" => "2",
                 "set" => "sum",
                 "set_name" => "Summary Set",
                 "lang" => "en",
                 "image_uris" => %{},
                 "finishes" => ["nonfoil"],
                 "legalities" => %{}
               }
             ])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Summary Deck", "format" => "commander"})

    assert {:ok, _mainboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Summary Main",
               "quantity" => 2,
               "zone" => "mainboard"
             })

    assert {:ok, _commander} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Summary Commander",
               "quantity" => 1,
               "zone" => "commander"
             })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          decks(first: 10) {
            pageInfo {
              endCursor
              hasNextPage
            }
            edges {
              node {
                name
                coverImageUrl
                commanderColorIdentity
                cardCount
                uniqueCardCount
              }
            }
          }
        }
        """
      })

    assert %{
             "data" => %{
               "decks" => %{
                 "pageInfo" => %{"endCursor" => _cursor, "hasNextPage" => false},
                 "edges" => [
                   %{
                     "node" => %{
                       "name" => "Summary Deck",
                       "coverImageUrl" => "https://example.test/summary-main-art.jpg",
                       "commanderColorIdentity" => ["U", "G"],
                       "cardCount" => 3,
                       "uniqueCardCount" => 2
                     }
                   }
                 ]
               }
             }
           } = json_response(conn, 200)
  end

  defp global_deck_id(deck) do
    Absinthe.Relay.Node.to_global_id(:deck, deck.id, ManavaultWeb.Schema)
  end
end
