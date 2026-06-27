defmodule ManavaultWeb.Schema.CardQueriesTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog

  test "card name suggestions expose fuzzy catalog matches", %{conn: conn} do
    {:ok, %{cards_count: 2, printings_count: 2}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-1",
          "oracle_id" => "oracle-1",
          "name" => "Black Lotus",
          "type_line" => "Artifact",
          "collector_number" => "232",
          "set" => "lea",
          "set_name" => "Limited Edition Alpha",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        },
        %{
          "id" => "scryfall-printing-2",
          "oracle_id" => "oracle-2",
          "name" => "Time Walk",
          "type_line" => "Sorcery",
          "collector_number" => "84",
          "set" => "lea",
          "set_name" => "Limited Edition Alpha",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          cardNameSuggestions(q: "blak lotu", limit: 5)
        }
        """
      })

    assert %{
             "data" => %{
               "cardNameSuggestions" => ["Black Lotus"]
             }
           } = json_response(conn, 200)
  end

  test "set suggestions expose matching set codes and names", %{conn: conn} do
    {:ok, %{cards_count: 2, printings_count: 2}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-set-printing-1",
          "oracle_id" => "set-oracle-1",
          "name" => "Black Lotus",
          "type_line" => "Artifact",
          "collector_number" => "232",
          "set" => "lea",
          "set_name" => "Limited Edition Alpha",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        },
        %{
          "id" => "scryfall-set-printing-2",
          "oracle_id" => "set-oracle-2",
          "name" => "Life of Toshiro Umezawa",
          "type_line" => "Enchantment — Saga",
          "collector_number" => "108",
          "set" => "neo",
          "set_name" => "Kamigawa: Neon Dynasty",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          setSuggestions(q: "alpha", limit: 5) {
            setCode
            setName
          }
        }
        """
      })

    assert %{
             "data" => %{
               "setSuggestions" => [
                 %{"setCode" => "lea", "setName" => "Limited Edition Alpha"}
               ]
             }
           } = json_response(conn, 200)
  end

  test "card query exposes Scryfall rulings", %{conn: conn} do
    rulings_uri = "https://api.scryfall.com/cards/oracle-rulings/rulings"
    previous_fetcher = Application.fetch_env(:manavault, :scryfall_rulings_fetcher)

    Application.put_env(:manavault, :scryfall_rulings_fetcher, fn ^rulings_uri ->
      {:ok,
       Jason.encode!(%{
         "data" => [
           %{
             "source" => "wotc",
             "published_at" => "2024-01-02",
             "comment" => "This ruling is shown on the card detail page."
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
          "id" => "scryfall-rulings-printing",
          "oracle_id" => "oracle-rulings",
          "name" => "Rulings Card",
          "type_line" => "Instant",
          "collector_number" => "1",
          "set" => "rul",
          "set_name" => "Rulings Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{},
          "rulings_uri" => rulings_uri
        }
      ])

    card_id =
      Absinthe.Relay.Node.to_global_id(:card, "oracle-rulings", ManavaultWeb.Schema)

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query CardRulings($id: ID!) {
          card(id: $id) {
            rulings {
              source
              publishedAt
              comment
            }
          }
        }
        """,
        "variables" => %{"id" => card_id}
      })

    assert %{
             "data" => %{
               "card" => %{
                 "rulings" => [
                   %{
                     "source" => "wotc",
                     "publishedAt" => "2024-01-02",
                     "comment" => "This ruling is shown on the card detail page."
                   }
                 ]
               }
             }
           } = json_response(conn, 200)
  end

  test "card query exposes Scryfall legalities", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-legality-printing",
          "oracle_id" => "oracle-legalities",
          "name" => "Legality Card",
          "type_line" => "Sorcery",
          "collector_number" => "2",
          "set" => "leg",
          "set_name" => "Legality Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{
            "modern" => "not_legal",
            "commander" => "legal",
            "standard" => "banned"
          },
          "game_changer" => true
        }
      ])

    card_id =
      Absinthe.Relay.Node.to_global_id(:card, "oracle-legalities", ManavaultWeb.Schema)

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query CardLegalities($id: ID!) {
          card(id: $id) {
            gameChanger
            legalities {
              format
              status
            }
          }
        }
        """,
        "variables" => %{"id" => card_id}
      })

    assert %{
             "data" => %{
               "card" => %{
                 "legalities" => [
                   %{"format" => "commander", "status" => "legal"},
                   %{"format" => "modern", "status" => "not_legal"},
                   %{"format" => "standard", "status" => "banned"}
                 ],
                 "gameChanger" => true
               }
             }
           } = json_response(conn, 200)
  end

  test "printing query exposes front and back images for double-faced cards", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-double-faced-printing",
          "oracle_id" => "oracle-double-faced",
          "name" => "Sunlit Marsh // Moonlit Marsh",
          "type_line" => "Land // Land",
          "collector_number" => "4",
          "set" => "dfc",
          "set_name" => "Double-Faced Set",
          "lang" => "en",
          "finishes" => ["nonfoil"],
          "legalities" => %{},
          "card_faces" => [
            %{"name" => "Sunlit Marsh", "image_uris" => %{"normal" => "front.jpg"}},
            %{"name" => "Moonlit Marsh", "image_uris" => %{"normal" => "back.jpg"}}
          ]
        }
      ])

    card_id = Absinthe.Relay.Node.to_global_id(:card, "oracle-double-faced", ManavaultWeb.Schema)

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query DoubleFacedCard($id: ID!) {
          card(id: $id) {
            printings(first: 1) {
              edges {
                node {
                  imageUrl
                  backImageUrl
                }
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
                 "printings" => %{
                   "edges" => [
                     %{"node" => %{"imageUrl" => "front.jpg", "backImageUrl" => "back.jpg"}}
                   ]
                 }
               }
             }
           } = json_response(conn, 200)
  end

  test "card query accepts legacy raw oracle IDs", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-legacy-card-printing",
          "oracle_id" => "cbf09050-39d0-463b-96db-9e22011ae0d8",
          "name" => "Legacy Linked Card",
          "type_line" => "Creature",
          "collector_number" => "3",
          "set" => "leg",
          "set_name" => "Legacy Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query LegacyCard($id: ID!) {
          card(id: $id) {
            id
            oracleId
            name
          }
        }
        """,
        "variables" => %{"id" => "cbf09050-39d0-463b-96db-9e22011ae0d8"}
      })

    assert %{
             "data" => %{
               "card" => %{
                 "id" => _global_id,
                 "oracleId" => "cbf09050-39d0-463b-96db-9e22011ae0d8",
                 "name" => "Legacy Linked Card"
               }
             }
           } = json_response(conn, 200)
  end
end
