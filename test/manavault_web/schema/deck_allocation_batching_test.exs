defmodule ManavaultWeb.Schema.DeckAllocationBatchingTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog

  test "deck page allocation status is batched over GraphQL", %{conn: conn} do
    cards =
      for index <- 1..3 do
        %{
          "id" => "scryfall-batched-allocation-#{index}",
          "oracle_id" => "oracle-batched-allocation-#{index}",
          "name" => "Batched Allocation #{index}",
          "type_line" => "Artifact",
          "collector_number" => "#{index}",
          "set" => "bat",
          "set_name" => "Batch Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      end

    assert {:ok, %{cards_count: 3, printings_count: 3}} = Catalog.import_cards(cards)
    {:ok, location} = Catalog.create_location(%{name: "Batch Binder", kind: "binder"})

    for index <- 1..3 do
      assert {:ok, _item} =
               Catalog.create_collection_item(%{
                 scryfall_id: "scryfall-batched-allocation-#{index}",
                 quantity: 1,
                 finish: "nonfoil",
                 location_id: location.id
               })
    end

    {:ok, deck} = Catalog.create_deck(%{"name" => "Batched Allocation Deck"})

    for index <- 1..3 do
      assert {:ok, _deck_card} =
               Catalog.add_card_to_deck(deck, %{"name" => "Batched Allocation #{index}"})
    end

    {conn, query_count} =
      count_repo_queries(fn ->
        post(conn, "/api/graphql", %{
          "query" => """
          query Deck($id: ID!) {
            deck(id: $id) {
              deckCards {
                id
                allocationStatus {
                  state
                  available
                  candidates {
                    available
                    item {
                      id
                      priceText
                      location { name }
                      printing { card { name } }
                    }
                  }
                }
              }
            }
          }
          """,
          "variables" => %{"id" => deck.id}
        })
      end)

    assert %{
             "data" => %{
               "deck" => %{
                 "deckCards" => [_, _, _]
               }
             }
           } = json_response(conn, 200)

    assert query_count <= 12
  end

  test "collection item allocated quantities are batched over GraphQL", %{conn: conn} do
    cards =
      for index <- 1..5 do
        %{
          "id" => "scryfall-batched-collection-#{index}",
          "oracle_id" => "oracle-batched-collection-#{index}",
          "name" => "Batched Collection #{index}",
          "type_line" => "Artifact",
          "collector_number" => "#{index}",
          "set" => "bci",
          "set_name" => "Batch Collection Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      end

    assert {:ok, %{cards_count: 5, printings_count: 5}} = Catalog.import_cards(cards)
    {:ok, location} = Catalog.create_location(%{name: "Batch Collection Binder", kind: "binder"})
    {:ok, deck} = Catalog.create_deck(%{"name" => "Batched Collection Deck"})

    for index <- 1..5 do
      assert {:ok, item} =
               Catalog.create_collection_item(%{
                 scryfall_id: "scryfall-batched-collection-#{index}",
                 quantity: 1,
                 finish: "nonfoil",
                 location_id: location.id
               })

      assert {:ok, deck_card} =
               Catalog.add_card_to_deck(deck, %{"name" => "Batched Collection #{index}"})

      assert {:ok, _allocation} =
               Catalog.allocate_collection_item_to_deck_card(deck_card.id, item.id)
    end

    {conn, query_count} =
      count_repo_queries(fn ->
        post(conn, "/api/graphql", %{
          "query" => """
          query CollectionItems {
            collectionItems(limit: 5, offset: 0) {
              id
              allocatedQuantity
              location { id name }
              printing {
                scryfallId
                card { name }
              }
            }
          }
          """
        })
      end)

    assert %{
             "data" => %{
               "collectionItems" => items
             }
           } = json_response(conn, 200)

    assert length(items) == 5
    assert Enum.all?(items, &(&1["allocatedQuantity"] == 1))
    assert query_count <= 7
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
