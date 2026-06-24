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

    printings_by_scryfall_id =
      Map.new(items, fn item ->
        {get_in(item, ["printing", "scryfallId"]), get_in(item, ["printing", "card", "name"])}
      end)

    assert printings_by_scryfall_id ==
             Map.new(1..5, fn index ->
               {"scryfall-batched-collection-#{index}", "Batched Collection #{index}"}
             end)

    assert query_count <= 8
  end

  test "location value summaries and covers are batched over GraphQL", %{conn: conn} do
    cards =
      for index <- 1..3 do
        %{
          "id" => "scryfall-batched-location-#{index}",
          "oracle_id" => "oracle-batched-location-#{index}",
          "name" => "Batched Location Card #{index}",
          "type_line" => "Artifact",
          "collector_number" => "#{index}",
          "set" => "blc",
          "set_name" => "Batched Location Set",
          "lang" => "en",
          "image_uris" => %{
            "normal" => "https://example.test/batched-location-#{index}.jpg",
            "art_crop" => "https://example.test/batched-location-#{index}-art.jpg"
          },
          "finishes" => ["nonfoil"],
          "prices" => %{"usd" => "#{index}.00"},
          "legalities" => %{}
        }
      end

    assert {:ok, %{cards_count: 3, printings_count: 3}} = Catalog.import_cards(cards)

    for index <- 1..3 do
      scryfall_id = "scryfall-batched-location-#{index}"

      {:ok, location} =
        Catalog.create_location(%{
          name: "Batched Location #{index}",
          kind: "binder",
          cover_scryfall_id: scryfall_id
        })

      assert {:ok, _item} =
               Catalog.create_collection_item(%{
                 scryfall_id: scryfall_id,
                 quantity: index,
                 finish: "nonfoil",
                 location_id: location.id,
                 purchase_price_cents: index * 40
               })
    end

    {conn, query_count} =
      count_repo_queries(fn ->
        post(conn, "/api/graphql", %{
          "query" => """
          query Locations {
            locations {
              id
              name
              itemCount
              totalPriceCents
              purchasePriceCents
              valueGainCents
              coverPrinting {
                scryfallId
                imageUrl
                artCropUrl
                card { name }
              }
              valueSummary {
                totalPriceCents
                purchasePriceCents
                valueGainCents
              }
            }
          }
          """
        })
      end)

    assert %{
             "data" => %{
               "locations" => locations
             }
           } = json_response(conn, 200)

    assert length(locations) == 4

    locations_by_name = Map.new(locations, &{&1["name"], &1})

    for index <- 1..3 do
      scryfall_id = "scryfall-batched-location-#{index}"
      name = "Batched Location #{index}"
      total_price_cents = index * index * 100
      purchase_price_cents = index * index * 40
      value_gain_cents = total_price_cents - purchase_price_cents

      location = Map.fetch!(locations_by_name, name)

      assert location["itemCount"] == index
      assert location["totalPriceCents"] == total_price_cents
      assert location["purchasePriceCents"] == purchase_price_cents
      assert location["valueGainCents"] == value_gain_cents

      assert location["valueSummary"] == %{
               "totalPriceCents" => total_price_cents,
               "purchasePriceCents" => purchase_price_cents,
               "valueGainCents" => value_gain_cents
             }

      assert location["coverPrinting"] == %{
               "scryfallId" => scryfall_id,
               "imageUrl" => "https://example.test/batched-location-#{index}.jpg",
               "artCropUrl" => "https://example.test/batched-location-#{index}-art.jpg",
               "card" => %{"name" => "Batched Location Card #{index}"}
             }
    end

    assert query_count <= 6
  end

  test "deck card printings resolve owned counts through Dataloader", %{conn: conn} do
    cards =
      for index <- 1..3 do
        %{
          "id" => "scryfall-batched-owned-#{index}",
          "oracle_id" => "oracle-batched-owned-#{index}",
          "name" => "Batched Owned #{index}",
          "type_line" => "Artifact",
          "collector_number" => "#{index}",
          "set" => "boc",
          "set_name" => "Batched Owned Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      end

    assert {:ok, %{cards_count: 3, printings_count: 3}} = Catalog.import_cards(cards)
    {:ok, location} = Catalog.create_location(%{name: "Batched Owned Binder", kind: "binder"})
    {:ok, list} = Catalog.create_location(%{name: "Batched Owned Wishlist", kind: "list"})
    {:ok, deck} = Catalog.create_deck(%{"name" => "Batched Owned Deck"})

    for index <- 1..3 do
      assert {:ok, _item} =
               Catalog.create_collection_item(%{
                 scryfall_id: "scryfall-batched-owned-#{index}",
                 quantity: index,
                 finish: "nonfoil",
                 location_id: location.id
               })

      assert {:ok, _ignored_list_item} =
               Catalog.create_collection_item(%{
                 scryfall_id: "scryfall-batched-owned-#{index}",
                 quantity: 10,
                 finish: "nonfoil",
                 location_id: list.id
               })

      assert {:ok, _deck_card} =
               Catalog.add_card_to_deck(deck, %{"name" => "Batched Owned #{index}"})
    end

    {conn, query_count} =
      count_repo_queries(fn ->
        post(conn, "/api/graphql", %{
          "query" => """
          query DeckOwnedCounts($id: ID!) {
            deck(id: $id) {
              deckCards {
                card {
                  name
                  printings {
                    scryfallId
                    ownedCount
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
                 "deckCards" => deck_cards
               }
             }
           } = json_response(conn, 200)

    owned_counts =
      deck_cards
      |> Enum.flat_map(& &1["card"]["printings"])
      |> Map.new(&{&1["scryfallId"], &1["ownedCount"]})

    assert owned_counts == %{
             "scryfall-batched-owned-1" => 1,
             "scryfall-batched-owned-2" => 2,
             "scryfall-batched-owned-3" => 3
           }

    assert query_count <= 10
  end

  test "bulk add collection items to deck batches one GraphQL mutation", %{conn: conn} do
    cards =
      for index <- 1..5 do
        %{
          "id" => "scryfall-bulk-add-collection-#{index}",
          "oracle_id" => "oracle-bulk-add-collection-#{index}",
          "name" => "Bulk Add Collection #{index}",
          "type_line" => "Artifact",
          "collector_number" => "#{index}",
          "set" => "bac",
          "set_name" => "Bulk Add Collection Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      end

    assert {:ok, %{cards_count: 5, printings_count: 5}} = Catalog.import_cards(cards)
    {:ok, location} = Catalog.create_location(%{name: "Bulk Add Binder", kind: "binder"})
    {:ok, deck} = Catalog.create_deck(%{"name" => "Bulk Add Deck"})

    item_ids =
      for index <- 1..5 do
        assert {:ok, item} =
                 Catalog.create_collection_item(%{
                   scryfall_id: "scryfall-bulk-add-collection-#{index}",
                   quantity: 1,
                   finish: "nonfoil",
                   location_id: location.id
                 })

        item.id
      end

    {conn, query_count} =
      count_repo_queries(fn ->
        post(conn, "/api/graphql", %{
          "query" => """
          mutation BulkAddCollectionItemsToDeck($deckId: ID!, $ids: [ID!]!) {
            bulkAddCollectionItemsToDeck(deckId: $deckId, ids: $ids) {
              id
              quantity
              zone
            }
          }
          """,
          "variables" => %{"deckId" => deck.id, "ids" => item_ids}
        })
      end)

    response = json_response(conn, 200)

    refute Map.has_key?(response, "errors")

    assert %{
             "data" => %{
               "bulkAddCollectionItemsToDeck" => deck_cards
             }
           } = response

    assert length(deck_cards) == 5
    assert Enum.all?(deck_cards, &(&1["quantity"] == 1))
    assert Enum.all?(deck_cards, &(&1["zone"] == "mainboard"))
    assert query_count <= 35
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
