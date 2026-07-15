defmodule ManavaultWeb.Schema.DeckMutationsTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog

  test "update deck mutation updates deck fields", %{conn: conn} do
    {:ok, deck} =
      Catalog.create_deck(%{"name" => "Old Deck", "format" => "commander", "status" => "brewing"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation UpdateDeck($id: ID!, $input: DeckUpdateInput!) {
          updateDeck(id: $id, input: $input) {
            deck {
              id
              name
              format
              status
            }
          }
        }
        """,
        "variables" => %{
          "id" => global_deck_id(deck),
          "input" => %{"name" => "New Deck", "format" => "modern", "status" => "active"}
        }
      })

    assert %{
             "data" => %{
               "updateDeck" => %{
                 "deck" => %{
                   "id" => _id,
                   "name" => "New Deck",
                   "format" => "modern",
                   "status" => "active"
                 }
               }
             }
           } = json_response(conn, 200)
  end

  test "decklist import mutation and export query expose plain text decklists", %{conn: conn} do
    {:ok, %{cards_count: 2, printings_count: 2}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-deck-import-1",
          "oracle_id" => "oracle-deck-import-1",
          "name" => "Import Lotus",
          "type_line" => "Artifact",
          "collector_number" => "1",
          "set" => "imp",
          "set_name" => "Import Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        },
        %{
          "id" => "scryfall-deck-import-2",
          "oracle_id" => "oracle-deck-import-2",
          "name" => "Import Walk",
          "type_line" => "Sorcery",
          "collector_number" => "2",
          "set" => "imp",
          "set_name" => "Import Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Import Deck"})
    deck_id = global_deck_id(deck)

    import_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation ImportDecklist($id: ID!, $text: String!) {
          importDecklist(id: $id, text: $text) {
            importResult {
              imported
              unresolved
              skippedPrintings
            }
          }
        }
        """,
        "variables" => %{
          "id" => deck_id,
          "text" => """
          Commander
          1 Import Walk

          Mainboard
          2 Import Lotus
          1 Missing Card
          """
        }
      })

    assert %{
             "data" => %{
               "importDecklist" => %{
                 "importResult" => %{
                   "imported" => 2,
                   "unresolved" => ["Missing Card"],
                   "skippedPrintings" => []
                 }
               }
             }
           } = json_response(import_conn, 200)

    export_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query DeckExportText($id: ID!) {
          deckExportText(id: $id)
        }
        """,
        "variables" => %{"id" => deck_id}
      })

    assert %{"data" => %{"deckExportText" => export_text}} = json_response(export_conn, 200)
    assert export_text =~ "Commander\n1x Import Walk"
    assert export_text =~ "Mainboard\n2x Import Lotus"

    replace_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation ImportDecklist($id: ID!, $text: String!, $replaceExisting: Boolean!) {
          importDecklist(id: $id, text: $text, replaceExisting: $replaceExisting) {
            importResult {
              imported
              unresolved
            }
          }
        }
        """,
        "variables" => %{
          "id" => deck_id,
          "text" => """
          Mainboard
          1 Import Walk
          """,
          "replaceExisting" => true
        }
      })

    assert %{
             "data" => %{
               "importDecklist" => %{
                 "importResult" => %{"imported" => 1, "unresolved" => []}
               }
             }
           } = json_response(replace_conn, 200)

    replaced_export_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query DeckExportText($id: ID!) {
          deckExportText(id: $id)
        }
        """,
        "variables" => %{"id" => deck_id}
      })

    assert %{"data" => %{"deckExportText" => replaced_export_text}} =
             json_response(replaced_export_conn, 200)

    assert replaced_export_text == "Mainboard\n1x Import Walk"
  end

  test "deck buylist and export queries expose missing card workflow data", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-buylist-1",
          "oracle_id" => "oracle-buylist-1",
          "name" => "Buylist Lotus",
          "type_line" => "Artifact",
          "collector_number" => "7",
          "set" => "buy",
          "set_name" => "Buy Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "prices" => %{"usd" => "3.50"},
          "legalities" => %{}
        }
      ])

    {:ok, deck} =
      Catalog.create_deck(%{
        "name" => "Buylist Deck",
        "format" => "vintage",
        "status" => "active"
      })

    {:ok, _deck_card} =
      Catalog.add_card_to_deck(deck, %{
        "name" => "Buylist Lotus",
        "quantity" => 2,
        "preferred_printing_id" => "scryfall-buylist-1"
      })

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query DeckBuylist($id: ID!) {
          deckBuylist(id: $id, printingMode: "exact") {
            cardName
            quantity
            missing
            unavailable
            reason
            setCode
            collectorNumber
            language
            unitPriceText
            totalPriceText
          }
          deckBuylistExport(id: $id, format: "csv", printingMode: "exact")
        }
        """,
        "variables" => %{"id" => global_deck_id(deck)}
      })

    assert %{
             "data" => %{
               "deckBuylist" => [
                 %{
                   "cardName" => "Buylist Lotus",
                   "quantity" => 2,
                   "missing" => 2,
                   "unavailable" => 0,
                   "reason" => "missing",
                   "setCode" => "buy",
                   "collectorNumber" => "7",
                   "language" => "en",
                   "unitPriceText" => "$3.50",
                   "totalPriceText" => "$7"
                 }
               ],
               "deckBuylistExport" => export_csv
             }
           } = json_response(conn, 200)

    assert export_csv =~
             "Quantity,Card,Set,Collector Number,Finish,Language,Reason,Unit Price,Total Price"

    assert export_csv =~ "2,Buylist Lotus,buy,7,nonfoil,en,missing,$3.50,$7"
  end

  test "deck disassembly mutations preview and apply allocated card moves", %{conn: conn} do
    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "scryfall-deck-disassembly",
          "oracle_id" => "oracle-deck-disassembly",
          "name" => "Disassembly Lotus",
          "type_line" => "Artifact",
          "collector_number" => "46",
          "set" => "dsm",
          "set_name" => "Disassembly Set",
          "lang" => "en",
          "image_uris" => %{"normal" => "https://example.test/disassembly-lotus.jpg"},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    {:ok, source_location} =
      Catalog.create_location(%{"name" => "Disassembly Binder", "kind" => "binder"})

    {:ok, item} =
      Catalog.create_collection_item(%{
        "scryfall_id" => "scryfall-deck-disassembly",
        "quantity" => 1,
        "finish" => "nonfoil",
        "location_id" => source_location.id
      })

    {:ok, deck} = Catalog.create_deck(%{"name" => "Disassembly Deck"})

    {:ok, deck_card} =
      Catalog.add_card_to_deck(deck, %{
        "name" => "Disassembly Lotus",
        "quantity" => 1,
        "preferred_printing_id" => "scryfall-deck-disassembly"
      })

    assert {:ok, allocation} =
             Catalog.allocate_collection_item_to_deck_card(deck_card.id, item.id)

    preview_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation PreviewDeckDisassembly($id: ID!) {
          previewDeckDisassembly(id: $id) {
            disassemblyResult {
              checkedCount
              movedCount
              skippedCount
              dryRun
              moves {
                collectionItemId
                cardName
                cardId
                imageUrl
                quantity
                finish
                fromLocationId
                fromLocationName
                toLocationId
                toLocationName
              }
            }
          }
        }
        """,
        "variables" => %{"id" => global_deck_id(deck)}
      })

    assert %{
             "data" => %{
               "previewDeckDisassembly" => %{
                 "disassemblyResult" => %{
                   "checkedCount" => 1,
                   "movedCount" => 1,
                   "skippedCount" => 0,
                   "dryRun" => true,
                   "moves" => [
                     %{
                       "collectionItemId" => preview_item_id,
                       "cardName" => "Disassembly Lotus",
                       "cardId" => "oracle-deck-disassembly",
                       "imageUrl" => "https://example.test/disassembly-lotus.jpg",
                       "quantity" => 1,
                       "finish" => "nonfoil",
                       "fromLocationId" => preview_source_id,
                       "fromLocationName" => "Disassembly Deck",
                       "toLocationId" => preview_destination_id,
                       "toLocationName" => "Disassembly Binder"
                     }
                   ]
                 }
               }
             }
           } = json_response(preview_conn, 200)

    assert preview_item_id == to_string(allocation.collection_item_id)
    assert preview_source_id == to_string(deck.id)
    assert preview_destination_id == to_string(source_location.id)
    assert Catalog.get_deck!(deck.id).id == deck.id
    assert Catalog.get_collection_item!(allocation.collection_item_id).location_id == nil

    apply_conn =
      post(conn, "/api/graphql", %{
        "query" => """
        mutation DisassembleDeck($id: ID!) {
          disassembleDeck(id: $id) {
            disassemblyResult {
              checkedCount
              movedCount
              skippedCount
              dryRun
              moves {
                collectionItemId
                cardName
                cardId
                imageUrl
                quantity
                finish
                fromLocationId
                fromLocationName
                toLocationId
                toLocationName
              }
            }
          }
        }
        """,
        "variables" => %{"id" => global_deck_id(deck)}
      })

    assert %{
             "data" => %{
               "disassembleDeck" => %{
                 "disassemblyResult" => %{
                   "checkedCount" => 1,
                   "movedCount" => 1,
                   "skippedCount" => 0,
                   "dryRun" => false,
                   "moves" => [
                     %{
                       "collectionItemId" => moved_item_id,
                       "cardName" => "Disassembly Lotus",
                       "quantity" => 1,
                       "fromLocationId" => source_id,
                       "fromLocationName" => "Disassembly Deck",
                       "toLocationId" => destination_id,
                       "toLocationName" => "Disassembly Binder"
                     }
                   ]
                 }
               }
             }
           } = json_response(apply_conn, 200)

    assert moved_item_id == preview_item_id
    assert source_id == preview_source_id
    assert destination_id == preview_destination_id
    assert Catalog.get_deck!(deck.id).status == "archived"

    restored_item = Catalog.get_collection_item!(allocation.collection_item_id)
    assert restored_item.location_id == source_location.id
    assert restored_item.quantity == 1
  end

  defp global_deck_id(deck) do
    Absinthe.Relay.Node.to_global_id(:deck, deck.id, ManavaultWeb.Schema)
  end
end
