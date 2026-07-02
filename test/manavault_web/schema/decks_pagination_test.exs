defmodule ManavaultWeb.Schema.DecksPaginationTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog

  @deck_count 3

  setup do
    # Names are ordered so pagination is deterministic (query orders by name).
    for i <- 1..@deck_count do
      {:ok, _deck} = Catalog.create_deck(%{"name" => "Pager Deck #{i}"})
    end

    :ok
  end

  defp decks_page(conn, query_body) do
    conn
    |> post("/api/graphql", %{"query" => query_body})
    |> json_response(200)
    |> get_in(["data", "decks"])
  end

  test "decks connection paginates at the page boundary", %{conn: conn} do
    first_page =
      decks_page(conn, """
      query { decks(first: 2) {
        pageInfo { hasNextPage endCursor }
        edges { node { name } }
      } }
      """)

    assert first_page["pageInfo"]["hasNextPage"] == true
    assert Enum.map(first_page["edges"], & &1["node"]["name"]) == ["Pager Deck 1", "Pager Deck 2"]

    cursor = first_page["pageInfo"]["endCursor"]

    second_page =
      decks_page(conn, """
      query { decks(first: 2, after: "#{cursor}") {
        pageInfo { hasNextPage }
        edges { node { name } }
      } }
      """)

    assert second_page["pageInfo"]["hasNextPage"] == false
    assert Enum.map(second_page["edges"], & &1["node"]["name"]) == ["Pager Deck 3"]
  end
end
