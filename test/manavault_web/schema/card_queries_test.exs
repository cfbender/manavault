defmodule ManavaultWeb.Schema.CardQueriesTest do
  use ManavaultWeb.ConnCase
  use Manavault.CatalogTestFixtures

  alias Manavault.Catalog

  setup do
    {:ok, _} = Catalog.import_cards([time_walk(), black_lotus(), plains()])
    :ok
  end

  test "cards query defaults to name ascending", %{conn: conn} do
    assert ["Black Lotus", "Plains", "Time Walk"] = card_names(conn, %{})
  end

  test "cards query applies the requested sort", %{conn: conn} do
    assert ["Time Walk", "Black Lotus", "Plains"] =
             card_names(conn, %{"sort" => %{"field" => "mana_value", "direction" => "desc"}})

    assert ["Black Lotus", "Plains", "Time Walk"] =
             card_names(conn, %{"sort" => %{"field" => "mana_value", "direction" => "asc"}})
  end

  test "cards query falls back to the name field for unknown sort fields", %{conn: conn} do
    # Unknown field falls back to name; a valid direction still applies.
    assert ["Time Walk", "Plains", "Black Lotus"] =
             card_names(conn, %{"sort" => %{"field" => "bogus", "direction" => "desc"}})

    assert ["Black Lotus", "Plains", "Time Walk"] =
             card_names(conn, %{"sort" => %{"field" => "bogus", "direction" => "sideways"}})
  end

  test "cards query paginates through results with first/after", %{conn: conn} do
    query = """
    query Cards($q: String!, $first: Int, $after: String) {
      cards(q: $q, first: $first, after: $after) {
        pageInfo {
          endCursor
          hasNextPage
        }
        edges {
          node {
            name
          }
        }
      }
    }
    """

    first_page =
      conn
      |> post("/api/graphql", %{"query" => query, "variables" => %{"q" => "cmc>=0", "first" => 2}})
      |> json_response(200)
      |> get_in(["data", "cards"])

    assert ["Black Lotus", "Plains"] = Enum.map(first_page["edges"], & &1["node"]["name"])
    assert first_page["pageInfo"]["hasNextPage"]
    assert first_page["pageInfo"]["endCursor"]

    second_page =
      conn
      |> post("/api/graphql", %{
        "query" => query,
        "variables" => %{
          "q" => "cmc>=0",
          "first" => 2,
          "after" => first_page["pageInfo"]["endCursor"]
        }
      })
      |> json_response(200)
      |> get_in(["data", "cards"])

    assert ["Time Walk"] = Enum.map(second_page["edges"], & &1["node"]["name"])
    refute second_page["pageInfo"]["hasNextPage"]
  end

  defp card_names(conn, variables) do
    conn
    |> post("/api/graphql", %{
      "query" => """
      query Cards($q: String!, $sort: CardSort) {
        cards(q: $q, sort: $sort, first: 10) {
          edges {
            node {
              name
            }
          }
        }
      }
      """,
      "variables" => Map.put(variables, "q", "cmc>=0")
    })
    |> json_response(200)
    |> get_in(["data", "cards", "edges"])
    |> Enum.map(& &1["node"]["name"])
  end
end
