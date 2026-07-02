defmodule ManavaultWeb.Schema.DeckCardsTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog

  defp global_id(type, id),
    do: Absinthe.Relay.Node.to_global_id(type, id, ManavaultWeb.Schema)

  test "update deck card mutation moves a card between zones", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
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
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Sideboard Test"})
    {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation MoveDeckCard($id: ID!, $input: DeckCardUpdateInput!) {
          updateDeckCard(id: $id, input: $input) {
            deckCard {
              id
              zone
              quantity
              card { name }
            }
          }
        }
        """,
        "variables" => %{
          "id" => global_id(:deck_card, deck_card.id),
          "input" => %{"zone" => "sideboard"}
        }
      })

    assert %{
             "data" => %{
               "updateDeckCard" => %{
                 "deckCard" => %{
                   "id" => _id,
                   "zone" => "sideboard",
                   "quantity" => 1,
                   "card" => %{"name" => "Black Lotus"}
                 }
               }
             }
           } = json_response(conn, 200)
  end

  test "deck card tag fields update individually and in bulk", %{conn: conn} do
    {:ok, %{cards_count: 2, printings_count: 2}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-tag-card-1",
          "oracle_id" => "oracle-tag-card-1",
          "name" => "Tag One",
          "type_line" => "Artifact",
          "collector_number" => "1",
          "set" => "tag",
          "set_name" => "Tag Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        },
        %{
          "id" => "scryfall-tag-card-2",
          "oracle_id" => "oracle-tag-card-2",
          "name" => "Tag Two",
          "type_line" => "Creature",
          "collector_number" => "2",
          "set" => "tag",
          "set_name" => "Tag Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Tag Test"})
    {:ok, first} = Catalog.add_card_to_deck(deck, %{"name" => "Tag One"})
    {:ok, second} = Catalog.add_card_to_deck(deck, %{"name" => "Tag Two"})

    update_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation UpdateTag($id: ID!, $input: DeckCardUpdateInput!) {
          updateDeckCard(id: $id, input: $input) {
            deckCard {
              id
              tag
            }
          }
        }
        """,
        "variables" => %{
          "id" => global_id(:deck_card, first.id),
          "input" => %{"tag" => "getting"}
        }
      })

    assert %{
             "data" => %{
               "updateDeckCard" => %{
                 "deckCard" => %{
                   "id" => _id,
                   "tag" => "getting"
                 }
               }
             }
           } = json_response(update_conn, 200)

    bulk_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation BulkTag($deckCardIds: [ID!]!, $tag: String) {
          updateDeckCardsTag(deckCardIds: $deckCardIds, tag: $tag) {
            deckCards {
              id
              tag
            }
          }
        }
        """,
        "variables" => %{
          "deckCardIds" => [
            global_id(:deck_card, first.id),
            global_id(:deck_card, second.id)
          ],
          "tag" => "consider_cutting"
        }
      })

    assert %{
             "data" => %{
               "updateDeckCardsTag" => %{
                 "deckCards" => tagged_cards
               }
             }
           } = json_response(bulk_conn, 200)

    assert Enum.sort_by(tagged_cards, & &1["id"]) ==
             Enum.sort_by(
               [
                 %{"id" => global_id(:deck_card, first.id), "tag" => "consider_cutting"},
                 %{"id" => global_id(:deck_card, second.id), "tag" => "consider_cutting"}
               ],
               & &1["id"]
             )
  end

  test "optimize deck card printings switches selected cards to cheapest printing", %{conn: conn} do
    {:ok, %{cards_count: 3, printings_count: 3}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-optimize-expensive",
          "oracle_id" => "oracle-optimize-lotus",
          "name" => "Optimize Lotus",
          "type_line" => "Artifact",
          "collector_number" => "1",
          "set" => "exp",
          "set_name" => "Expensive Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "prices" => %{"usd" => "9.00"},
          "legalities" => %{}
        },
        %{
          "id" => "scryfall-optimize-cheap",
          "oracle_id" => "oracle-optimize-lotus",
          "name" => "Optimize Lotus",
          "type_line" => "Artifact",
          "collector_number" => "2",
          "set" => "chp",
          "set_name" => "Cheap Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "prices" => %{"usd" => "1.25"},
          "legalities" => %{}
        },
        %{
          "id" => "scryfall-optimize-other",
          "oracle_id" => "oracle-optimize-other",
          "name" => "Optimize Other",
          "type_line" => "Creature",
          "collector_number" => "3",
          "set" => "oth",
          "set_name" => "Other Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "prices" => %{"usd" => "0.50"},
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Optimize Test"})

    {:ok, selected} =
      Catalog.add_card_to_deck(deck, %{
        "name" => "Optimize Lotus",
        "preferred_printing_id" => "scryfall-optimize-expensive"
      })

    {:ok, location} =
      Catalog.create_location(%{"name" => "Optimize Binder", "kind" => "binder"})

    {:ok, allocated_item} =
      Catalog.create_collection_item(%{
        "scryfall_id" => "scryfall-optimize-expensive",
        "quantity" => 1,
        "condition" => "near_mint",
        "language" => "en",
        "finish" => "nonfoil",
        "location_id" => location.id
      })

    assert {:ok, _allocation} =
             Catalog.allocate_collection_item_to_deck_card(selected.id, allocated_item.id)

    assert %{allocated: 1} = Catalog.deck_card_allocation_status(selected)

    {:ok, unselected} =
      Catalog.add_card_to_deck(deck, %{
        "name" => "Optimize Other",
        "preferred_printing_id" => "scryfall-optimize-other"
      })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation OptimizeDeckCardPrintings($deckCardIds: [ID!]!) {
          optimizeDeckCardPrintings(deckCardIds: $deckCardIds) {
            deckCards {
              id
              preferredPrinting {
                scryfallId
                setCode
              }
            }
          }
        }
        """,
        "variables" => %{
          "deckCardIds" => [global_id(:deck_card, selected.id)]
        }
      })

    assert %{
             "data" => %{
               "optimizeDeckCardPrintings" => %{
                 "deckCards" => [
                   %{
                     "id" => selected_id,
                     "preferredPrinting" => %{
                       "scryfallId" => "scryfall-optimize-cheap",
                       "setCode" => "chp"
                     }
                   }
                 ]
               }
             }
           } = json_response(conn, 200)

    assert selected_id == global_id(:deck_card, selected.id)

    deck_cards = Catalog.get_deck!(deck.id).deck_cards
    selected_card = Enum.find(deck_cards, &(&1.id == selected.id))

    assert selected_card.preferred_printing_id == "scryfall-optimize-cheap"

    assert Enum.find(deck_cards, &(&1.id == unselected.id)).preferred_printing_id ==
             "scryfall-optimize-other"

    assert %{allocated: 0} = Catalog.deck_card_allocation_status(selected_card)

    assert Catalog.get_collection_item!(allocated_item.id).location_id == location.id
  end

  test "add deck card mutation adds a card by name", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-add-deck-card",
          "oracle_id" => "oracle-add-deck-card",
          "name" => "Add Me",
          "type_line" => "Creature",
          "collector_number" => "3",
          "set" => "add",
          "set_name" => "Add Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Add Test"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation AddDeckCard($deckId: ID!, $input: DeckCardInput!) {
          addDeckCard(deckId: $deckId, input: $input) {
            deckCard {
              id
              quantity
              zone
              finish
              card { name }
            }
          }
        }
        """,
        "variables" => %{
          "deckId" => global_id(:deck, deck.id),
          "input" => %{
            "name" => "Add Me",
            "quantity" => 2,
            "zone" => "sideboard",
            "finish" => "nonfoil"
          }
        }
      })

    assert %{
             "data" => %{
               "addDeckCard" => %{
                 "deckCard" => %{
                   "id" => _id,
                   "quantity" => 2,
                   "zone" => "sideboard",
                   "finish" => "nonfoil",
                   "card" => %{"name" => "Add Me"}
                 }
               }
             }
           } = json_response(conn, 200)
  end

  test "delete deck card mutation removes a card from a deck", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-delete-deck-card",
          "oracle_id" => "oracle-delete-deck-card",
          "name" => "Delete Me",
          "type_line" => "Artifact",
          "collector_number" => "1",
          "set" => "del",
          "set_name" => "Delete Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Delete Test"})
    {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Delete Me"})
    {:ok, location} = Catalog.create_location(%{"name" => "Delete Binder", "kind" => "binder"})

    {:ok, item} =
      Catalog.create_collection_item(%{
        "scryfall_id" => "scryfall-delete-deck-card",
        "quantity" => 1,
        "location_id" => location.id
      })

    assert {:ok, allocation} =
             Catalog.allocate_collection_item_to_deck_card(deck_card.id, item.id)

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation DeleteDeckCard($id: ID!) {
          deleteDeckCard(id: $id) {
            deckCard {
              id
              card { name }
            }
          }
        }
        """,
        "variables" => %{"id" => global_id(:deck_card, deck_card.id)}
      })

    assert %{
             "data" => %{
               "deleteDeckCard" => %{
                 "deckCard" => %{
                   "id" => _id,
                   "card" => %{"name" => "Delete Me"}
                 }
               }
             }
           } = json_response(conn, 200)

    assert Catalog.get_deck!(deck.id).deck_cards == []

    restored_item =
      allocation.collection_item_id
      |> Catalog.get_collection_item!()

    assert restored_item.location_id == location.id
    assert Catalog.deck_allocation_status(Catalog.get_deck!(deck.id)) == %{}
  end

  test "delete deck mutation removes a deck and restores allocated cards", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-delete-deck",
          "oracle_id" => "oracle-delete-deck",
          "name" => "Delete Deck Card",
          "type_line" => "Artifact",
          "collector_number" => "1",
          "set" => "ddk",
          "set_name" => "Delete Deck Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Deck To Delete"})
    {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Delete Deck Card"})

    {:ok, location} =
      Catalog.create_location(%{"name" => "Delete Deck Binder", "kind" => "binder"})

    {:ok, item} =
      Catalog.create_collection_item(%{
        "scryfall_id" => "scryfall-delete-deck",
        "quantity" => 1,
        "location_id" => location.id
      })

    assert {:ok, allocation} =
             Catalog.allocate_collection_item_to_deck_card(deck_card.id, item.id)

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation DeleteDeck($id: ID!) {
          deleteDeck(id: $id) {
            deck {
              id
              name
            }
          }
        }
        """,
        "variables" => %{"id" => global_id(:deck, deck.id)}
      })

    assert %{
             "data" => %{
               "deleteDeck" => %{
                 "deck" => %{"id" => _id, "name" => "Deck To Delete"}
               }
             }
           } = json_response(conn, 200)

    assert_raise Ecto.NoResultsError, fn -> Catalog.get_deck!(deck.id) end
    assert Catalog.get_collection_item!(allocation.collection_item_id).location_id == location.id
  end

  test "set deck commander replaces the current commander", %{conn: conn} do
    {:ok, %{cards_count: 2, printings_count: 2}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-printing-1",
          "oracle_id" => "oracle-1",
          "name" => "Old Legend",
          "type_line" => "Legendary Creature — Wizard",
          "collector_number" => "1",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        },
        %{
          "id" => "scryfall-printing-2",
          "oracle_id" => "oracle-2",
          "name" => "New Legend",
          "type_line" => "Legendary Creature — Soldier",
          "collector_number" => "2",
          "set" => "tst",
          "set_name" => "Test Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Commander Test"})

    {:ok, old_commander} =
      Catalog.add_card_to_deck(deck, %{"name" => "Old Legend", "zone" => "commander"})

    {:ok, new_commander} = Catalog.add_card_to_deck(deck, %{"name" => "New Legend"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation SetDeckCommander($id: ID!) {
          setDeckCommander(id: $id) {
            deckCard {
              id
              zone
              card { name }
            }
          }
        }
        """,
        "variables" => %{"id" => global_id(:deck_card, new_commander.id)}
      })

    assert %{
             "data" => %{
               "setDeckCommander" => %{
                 "deckCard" => %{
                   "id" => _id,
                   "zone" => "commander",
                   "card" => %{"name" => "New Legend"}
                 }
               }
             }
           } = json_response(conn, 200)

    loaded = Catalog.get_deck!(deck.id)

    assert Enum.any?(loaded.deck_cards, &(&1.id == old_commander.id and &1.zone == "mainboard"))
    assert Enum.any?(loaded.deck_cards, &(&1.id == new_commander.id and &1.zone == "commander"))
  end

  test "bulk update and bulk delete deck card mutations act on a selection", %{conn: conn} do
    {:ok, %{cards_count: 2, printings_count: 2}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-bulk-card-1",
          "oracle_id" => "oracle-bulk-card-1",
          "name" => "Bulk One",
          "type_line" => "Artifact",
          "collector_number" => "1",
          "set" => "blk",
          "set_name" => "Bulk Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        },
        %{
          "id" => "scryfall-bulk-card-2",
          "oracle_id" => "oracle-bulk-card-2",
          "name" => "Bulk Two",
          "type_line" => "Creature",
          "collector_number" => "2",
          "set" => "blk",
          "set_name" => "Bulk Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Bulk Test"})
    {:ok, first} = Catalog.add_card_to_deck(deck, %{"name" => "Bulk One"})
    {:ok, second} = Catalog.add_card_to_deck(deck, %{"name" => "Bulk Two"})

    ids = [global_id(:deck_card, first.id), global_id(:deck_card, second.id)]

    update_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation BulkUpdate($deckCardIds: [ID!]!, $input: DeckCardUpdateInput!) {
          bulkUpdateDeckCards(deckCardIds: $deckCardIds, input: $input) {
            deckCards {
              id
              zone
            }
          }
        }
        """,
        "variables" => %{"deckCardIds" => ids, "input" => %{"zone" => "sideboard"}}
      })

    assert %{"data" => %{"bulkUpdateDeckCards" => %{"deckCards" => updated}}} =
             json_response(update_conn, 200)

    assert length(updated) == 2
    assert Enum.all?(updated, &(&1["zone"] == "sideboard"))

    delete_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation BulkDelete($deckCardIds: [ID!]!) {
          bulkDeleteDeckCards(deckCardIds: $deckCardIds) {
            deckCards {
              id
            }
          }
        }
        """,
        "variables" => %{"deckCardIds" => ids}
      })

    assert %{"data" => %{"bulkDeleteDeckCards" => %{"deckCards" => deleted}}} =
             json_response(delete_conn, 200)

    assert length(deleted) == 2
    assert Manavault.Repo.get(Manavault.Catalog.DeckCard, first.id) == nil
    assert Manavault.Repo.get(Manavault.Catalog.DeckCard, second.id) == nil
  end
end
