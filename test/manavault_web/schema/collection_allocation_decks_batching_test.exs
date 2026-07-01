defmodule ManavaultWeb.Schema.CollectionAllocationDecksBatchingTest do
  use ManavaultWeb.ConnCase

  alias Absinthe.Relay.Node
  alias Manavault.Catalog

  @item_count 5

  test "allocationDecks across many collection items is batched, not per-item", %{conn: conn} do
    cards =
      for index <- 1..@item_count do
        %{
          "id" => "scryfall-alloc-decks-#{index}",
          "oracle_id" => "oracle-alloc-decks-#{index}",
          "name" => "Alloc Decks #{index}",
          "type_line" => "Artifact",
          "collector_number" => "#{index}",
          "set" => "adk",
          "set_name" => "Alloc Decks Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      end

    assert {:ok, %{cards_count: @item_count}} = Catalog.import_cards(cards)
    {:ok, deck} = Catalog.create_deck(%{"name" => "Alloc Decks Deck"})

    for index <- 1..@item_count do
      {:ok, item} =
        Catalog.create_collection_item(%{
          scryfall_id: "scryfall-alloc-decks-#{index}",
          quantity: 1,
          finish: "nonfoil"
        })

      # addCollectionItemToDeck creates the deck card and its allocation.
      conn
      |> post("/api/graphql", %{
        "query" => """
        mutation Add($id: ID!, $deckId: ID!) {
          addCollectionItemToDeck(id: $id, deckId: $deckId) { deckCard { id } }
        }
        """,
        "variables" => %{
          "id" => Node.to_global_id(:collection_item, item.id, ManavaultWeb.Schema),
          "deckId" => Node.to_global_id(:deck, deck.id, ManavaultWeb.Schema)
        }
      })
      |> json_response(200)
    end

    {resp, query_count} =
      count_repo_queries(fn ->
        post(conn, "/api/graphql", %{
          "query" => """
          query {
            collectionItems(first: 50) {
              edges {
                node {
                  allocationDecks { quantity deck { name } }
                }
              }
            }
          }
          """
        })
      end)

    edges = get_in(json_response(resp, 200), ["data", "collectionItems", "edges"])
    assert length(edges) == @item_count

    for edge <- edges do
      assert [%{"quantity" => 1, "deck" => %{"name" => "Alloc Decks Deck"}}] =
               edge["node"]["allocationDecks"]
    end

    # Batched: the deck_allocations load plus its deck_card->deck preload is a
    # fixed handful of queries. The old per-item Repo.preload issued ~2 extra
    # queries per item (~10+ for five items) on top of the batch.
    assert query_count <= 10
  end

  defp count_repo_queries(fun) when is_function(fun, 0) do
    caller = self()
    ref = make_ref()
    handler_id = {__MODULE__, ref}

    :ok =
      :telemetry.attach(
        handler_id,
        [:manavault, :repo, :query],
        fn _event, _measurements, metadata, _config ->
          unless metadata[:source] == "schema_migrations" do
            send(caller, {ref, :query})
          end
        end,
        nil
      )

    try do
      result = fun.()
      {result, collect_query_count(ref, 0)}
    after
      :telemetry.detach(handler_id)
      collect_query_count(ref, 0)
    end
  end

  defp collect_query_count(ref, count) do
    receive do
      {^ref, :query} -> collect_query_count(ref, count + 1)
    after
      0 -> count
    end
  end
end
