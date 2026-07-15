defmodule ManavaultWeb.Schema.DeckAllocationBatchingTest do
  use ManavaultWeb.ConnCase

  alias Absinthe.Relay.Node
  alias Manavault.Catalog

  # A cold deck page performs one deck lookup, one deck-card batch, one fallback
  # printing batch, two allocation-status batches, one tag batch, two
  # card-printing batches, and one nested deck-card association batch. The
  # fixture has three distinct cards, so any per-card query changes this exact
  # source-class shape.
  @deck_page_allocation_query_shape %{
    deck_lookup: 1,
    deck_card_batch: 1,
    fallback_printing_batch: 1,
    allocation_candidate_batch: 1,
    allocation_count_batch: 1,
    deck_card_tag_batch: 1,
    printing_owned_count_batch: 1,
    card_printing_batch: 1,
    deck_card_association_batch: 1
  }
  @deck_page_allocation_query_budget 9

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

    alternate_printing = %{
      "id" => "scryfall-batched-allocation-1-alternate",
      "oracle_id" => "oracle-batched-allocation-1",
      "name" => "Batched Allocation 1",
      "type_line" => "Artifact",
      "collector_number" => "1a",
      "set" => "bat",
      "set_name" => "Batch Set",
      "lang" => "en",
      "image_uris" => %{},
      "finishes" => ["nonfoil"],
      "legalities" => %{}
    }

    assert {:ok, %{cards_count: 4, printings_count: 4, bulk_uri: nil}} =
             Catalog.import_cards(cards ++ [alternate_printing])
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

    assert {:ok, alternate_item} =
             Catalog.create_collection_item(%{
               scryfall_id: "scryfall-batched-allocation-1-alternate",
               quantity: 1,
               finish: "nonfoil",
               location_id: location.id
             })

    {:ok, deck} = Catalog.create_deck(%{"name" => "Batched Allocation Deck"})

    for index <- 1..3 do
      assert {:ok, _deck_card} =
               Catalog.add_card_to_deck(deck, %{"name" => "Batched Allocation #{index}"})
    end

    {:ok, other_deck} = Catalog.create_deck(%{"name" => "Other Batched Allocation Deck"})

    assert {:ok, other_deck_card} =
             Catalog.add_card_to_deck(other_deck, %{"name" => "Batched Allocation 1"})

    assert {:ok, _allocation} =
             Catalog.allocate_collection_item_to_deck_card(other_deck_card.id, alternate_item.id)

    Manavault.Catalog.Cache.clear()

    {conn, query_classes} =
      count_repo_query_classes(fn ->
        post(conn, "/api/graphql", %{
          "query" => """
          query Deck($id: ID!) {
            deck(id: $id) {
              id
              cardCount
              uniqueCardCount
              legality { status }
              deckCards(first: 10, after: null) {
                pageInfo { endCursor hasNextPage }
                edges {
                  node {
                    id
                    card {
                      name
                      printings(first: 10, after: null) {
                        pageInfo { endCursor hasNextPage }
                        edges {
                          node {
                            scryfallId
                            setCode
                          }
                        }
                      }
                    }
                    preferredPrinting {
                      scryfallId
                    }
                    allocationStatus {
                      state
                      available
                      allocatedElsewhere
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
            }
          }
          """,
          "variables" => %{"id" => global_id(:deck, deck.id)}
        })
      end)

    response = json_response(conn, 200)

    assert %{
             "data" => %{
               "deck" => %{
                 "cardCount" => 3,
                 "uniqueCardCount" => 3,
                 "legality" => %{"status" => "illegal"},
                 "deckCards" => %{"edges" => [_, _, _]}
               }
             }
           } = response

    assert Enum.any?(
             get_in(response, ["data", "deck", "deckCards", "edges"]),
             fn
               %{
                 "node" => %{
                   "card" => %{"name" => "Batched Allocation 1"},
                   "allocationStatus" => %{
                     "allocatedElsewhere" => 1,
                     "available" => 1
                   }
                 }
               } ->
                 true

               _ ->
                 false
             end
           )

    assert query_classes == @deck_page_allocation_query_shape
    assert Enum.sum(Map.values(query_classes)) == @deck_page_allocation_query_budget
  end

  test "deck list summaries reuse preloaded deck cards over GraphQL", %{conn: conn} do
    cards =
      for index <- 1..6 do
        %{
          "id" => "scryfall-batched-deck-list-#{index}",
          "oracle_id" => "oracle-batched-deck-list-#{index}",
          "name" => "Batched Deck List #{index}",
          "type_line" => if(rem(index, 2) == 0, do: "Legendary Creature", else: "Artifact"),
          "collector_number" => "#{index}",
          "set" => "bdl",
          "set_name" => "Batch Deck List Set",
          "lang" => "en",
          "image_uris" => %{"normal" => "https://example.test/deck-list-#{index}.jpg"},
          "finishes" => ["nonfoil"],
          "color_identity" => if(rem(index, 2) == 0, do: ["U"], else: []),
          "legalities" => %{"commander" => "legal"}
        }
      end

    assert {:ok, %{cards_count: 6, printings_count: 6}} = Catalog.import_cards(cards)

    for deck_index <- 1..3 do
      {:ok, deck} = Catalog.create_deck(%{"name" => "Batched Deck List #{deck_index}"})

      assert {:ok, _mainboard} =
               Catalog.add_card_to_deck(deck, %{
                 "name" => "Batched Deck List #{deck_index * 2 - 1}",
                 "quantity" => 2,
                 "zone" => "mainboard"
               })

      assert {:ok, _commander} =
               Catalog.add_card_to_deck(deck, %{
                 "name" => "Batched Deck List #{deck_index * 2}",
                 "quantity" => 1,
                 "zone" => "commander"
               })
    end

    {conn, query_count} =
      count_repo_queries(fn ->
        post(conn, "/api/graphql", %{
          "query" => """
          query Decks {
            decks(first: 10) {
              edges {
                node {
                  name
                  cardCount
                  uniqueCardCount
                  coverImageUrl
                  commanderColorIdentity
                  legality { status }
                }
              }
            }
          }
          """
        })
      end)

    assert %{
             "data" => %{
               "decks" => %{
                 "edges" => [_, _, _] = edges
               }
             }
           } = json_response(conn, 200)

    assert Enum.all?(edges, fn %{"node" => deck} ->
             deck["cardCount"] == 3 and
               deck["uniqueCardCount"] == 2 and
               deck["coverImageUrl"] =~ "https://example.test/deck-list-" and
               deck["commanderColorIdentity"] == ["U"]
           end)

    assert query_count <= 4
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
            collectionItems(first: 5, after: null) {
              pageInfo { endCursor hasNextPage }
              edges {
                node {
                  id
                  allocatedQuantity
                  printing {
                    scryfallId
                    card { name }
                  }
                }
              }
            }
          }
          """
        })
      end)

    assert %{
             "data" => %{
               "collectionItems" => %{"edges" => item_edges}
             }
           } = json_response(conn, 200)

    items = Enum.map(item_edges, & &1["node"])

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
            locations(first: 10, after: null) {
              pageInfo { endCursor hasNextPage }
              edges {
                node {
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
            }
          }
          """
        })
      end)

    assert %{
             "data" => %{
               "locations" => %{"edges" => location_edges}
             }
           } = json_response(conn, 200)

    locations = Enum.map(location_edges, & &1["node"])

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
              deckCards(first: 10, after: null) {
                pageInfo { endCursor hasNextPage }
                edges {
                  node {
                    card {
                      name
                      printings(first: 10, after: null) {
                        pageInfo { endCursor hasNextPage }
                        edges {
                          node {
                            scryfallId
                            ownedCount
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          """,
          "variables" => %{"id" => global_id(:deck, deck.id)}
        })
      end)

    assert %{
             "data" => %{
               "deck" => %{
                 "deckCards" => %{"edges" => deck_card_edges}
               }
             }
           } = json_response(conn, 200)

    deck_cards = Enum.map(deck_card_edges, & &1["node"])

    owned_counts =
      deck_cards
      |> Enum.flat_map(fn deck_card -> deck_card["card"]["printings"]["edges"] end)
      |> Enum.map(& &1["node"])
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

        global_id(:collection_item, item.id)
      end

    {conn, query_count} =
      count_repo_queries(fn ->
        post(conn, "/api/graphql", %{
          "query" => """
          mutation BulkAddCollectionItemsToDeck($deckId: ID!, $selector: CollectionItemSelector!) {
            bulkAddCollectionItemsToDeck(deckId: $deckId, selector: $selector) {
              deckCards {
                id
                quantity
                zone
              }
            }
          }
          """,
          "variables" => %{
            "deckId" => global_id(:deck, deck.id),
            "selector" => %{"ids" => item_ids}
          }
        })
      end)

    response = json_response(conn, 200)

    refute Map.has_key?(response, "errors")

    assert %{
             "data" => %{
               "bulkAddCollectionItemsToDeck" => %{"deckCards" => deck_cards}
             }
           } = response

    assert length(deck_cards) == 5
    assert Enum.all?(deck_cards, &(&1["quantity"] == 1))
    assert Enum.all?(deck_cards, &(&1["zone"] == "mainboard"))
    assert query_count <= 35
  end

  defp global_id(type, id), do: Node.to_global_id(type, id, ManavaultWeb.Schema)

  defp count_repo_queries(fun) when is_function(fun, 0) do
    {result, query_classes} = count_repo_query_classes(fun)
    {result, Enum.sum(Map.values(query_classes))}
  end

  defp count_repo_query_classes(fun) when is_function(fun, 0) do
    caller = self()
    ref = make_ref()
    handler_id = {__MODULE__, ref}

    :ok =
      :telemetry.attach(
        handler_id,
        [:manavault, :repo, :query],
        fn _event, _measurements, metadata, _config ->
          unless metadata[:source] == "schema_migrations" do
            send(caller, {ref, query_class(metadata)})
          end
        end,
        nil
      )

    try do
      result = fun.()
      {result, collect_query_classes(ref, %{})}
    after
      :telemetry.detach(handler_id)
      collect_query_classes(ref, %{})
    end
  end

  defp collect_query_classes(ref, query_classes) do
    receive do
      {^ref, query_class} ->
        collect_query_classes(ref, Map.update(query_classes, query_class, 1, &(&1 + 1)))
    after
      0 -> query_classes
    end
  end

  defp query_class(metadata) do
    source = metadata |> Map.get(:source) |> to_string()
    query = metadata |> Map.get(:query, "") |> IO.iodata_to_binary() |> String.downcase()

    case source do
      "decks" ->
        :deck_lookup

      "deck_cards" ->
        :deck_card_batch

      "deck_allocations" ->
        :allocation_count_batch

      "deck_card_tags" ->
        :deck_card_tag_batch

      "collection_items" ->
        if String.contains?(query, "sum(") do
          :printing_owned_count_batch
        else
          :allocation_candidate_batch
        end

      "scryfall_cards" ->
        :deck_card_association_batch

      "scryfall_printings" ->
        cond do
          String.contains?(query, "row_number") -> :fallback_printing_batch
          String.contains?(query, "oracle_id") -> :card_printing_batch
          true -> :deck_card_association_batch
        end

      unexpected_source ->
        if source == "" and fallback_printing_query?(query) do
          :fallback_printing_batch
        else
          {:unexpected_query_source, unexpected_source}
        end
    end
  end

  defp fallback_printing_query?(query) do
    String.contains?(query, "row_number") and
      String.contains?(query, "scryfall_printings")
  end
end
