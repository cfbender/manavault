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

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          card(id: "oracle-rulings") {
            rulings {
              source
              publishedAt
              comment
            }
          }
        }
        """
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
          }
        }
      ])

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query {
          card(id: "oracle-legalities") {
            legalities {
              format
              status
            }
          }
        }
        """
      })

    assert %{
             "data" => %{
               "card" => %{
                 "legalities" => [
                   %{"format" => "commander", "status" => "legal"},
                   %{"format" => "modern", "status" => "not_legal"},
                   %{"format" => "standard", "status" => "banned"}
                 ]
               }
             }
           } = json_response(conn, 200)
  end
end
