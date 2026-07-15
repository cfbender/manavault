defmodule ManavaultWeb.Schema.SchemaDomainContractTest do
  use ManavaultWeb.ConnCase

  alias Absinthe.Relay.Node
  alias Manavault.Catalog
  alias ManavaultWeb.Schema
  alias ManavaultWeb.Schema.Catalog.QueryResolvers

  test "private schema keeps its field, argument, nullability, and payload contracts" do
    {:ok, %{data: data}} = Absinthe.run(schema_contract_query(), Schema)

    query_fields = fields_by_name(data["__schema"]["queryType"]["fields"])
    mutation_fields = fields_by_name(data["__schema"]["mutationType"]["fields"])

    assert MapSet.new(Map.keys(query_fields)) ==
             MapSet.new([
               "backupSettings",
               "card",
               "cardNameSuggestions",
               "cards",
               "cloudBackups",
               "collectionAutoSortRules",
               "collectionExportCsv",
               "collectionExportText",
               "collectionItemCount",
               "collectionItemEntryCount",
               "collectionItems",
               "collectionValueSummary",
               "deck",
               "deckBuylist",
               "deckBuylistExport",
               "deckEdhrec",
               "deckExportText",
               "decks",
               "defaultDeckTags",
               "homeSummary",
               "location",
               "locations",
               "node",
               "setSuggestions",
               "sharedDeck"
             ])

    assert MapSet.new(Map.keys(mutation_fields)) ==
             MapSet.new([
               "addCollectionItemToDeck",
               "addDeckCard",
               "allocateDeckCardItem",
               "allocateDeckCardProxy",
               "allocateDeckPullList",
               "assignDeckCardTag",
               "autoSortCollection",
               "bulkAddCollectionItemsToDeck",
               "bulkAllocateDeck",
               "bulkDeallocateDeckCards",
               "bulkDeleteCollectionItems",
               "bulkDeleteDeckCards",
               "bulkUpdateCollectionItems",
               "bulkUpdateDeckCards",
               "commitCollectionImport",
               "createCollectionItem",
               "createDeck",
               "createDeckTag",
               "createLocation",
               "deallocateDeckCardItem",
               "deallocateDeckCardProxy",
               "deleteCollectionItem",
               "deleteDeck",
               "deleteDeckCard",
               "deleteDeckTag",
               "deleteLocation",
               "disassembleDeck",
               "ensureDeckShareToken",
               "importDecklist",
               "optimizeDeckCardPrintings",
               "previewBulkAllocateDeck",
               "previewCollectionImport",
               "previewCollectionImportAutoSort",
               "previewDeckDisassembly",
               "reloadScryfallAssets",
               "reloadScryfallCatalog",
               "reorderDeckTags",
               "replaceDefaultDeckTags",
               "runCloudBackup",
               "setDeckCommander",
               "stageCloudRestore",
               "unassignDeckCardTag",
               "updateBackupSettings",
               "updateCollectionAutoSortRules",
               "updateCollectionItem",
               "updateDeck",
               "updateDeckCard",
               "updateDeckCardsTag",
               "updateDeckTag",
               "updateLocation"
             ])

    assert type_signature(query_fields["cards"]["type"]) == "CardConnection!"
    assert argument(query_fields["cards"], "q") == {"String", "\"\""}
    assert type_signature(query_fields["cardNameSuggestions"]["type"]) == "[String!]!"
    assert argument(query_fields["cardNameSuggestions"], "limit") == {"Int", "5"}
    assert type_signature(query_fields["collectionItemCount"]["type"]) == "Int!"
    assert argument(query_fields["collectionItemCount"], "filters") == {"CollectionItemFilters", nil}
    assert type_signature(query_fields["deckBuylist"]["type"]) == "[DeckBuylistEntry!]!"
    assert argument(query_fields["deckBuylist"], "printingMode") == {"String", "\"none\""}
    assert argument(query_fields["deckBuylist"], "assumeNoOwned") == {"Boolean", "false"}
    assert type_signature(query_fields["defaultDeckTags"]["type"]) == "[DefaultDeckTag!]!"

    assert type_signature(mutation_fields["createCollectionItem"]["type"]) ==
             "CreateCollectionItemPayload"

    assert argument(mutation_fields["createCollectionItem"], "input") ==
             {"CollectionItemInput!", nil}

    assert argument(mutation_fields["allocateDeckCardProxy"], "quantity") == {"Int", "1"}
    assert type_signature(mutation_fields["previewDeckDisassembly"]["type"]) ==
             "PreviewDeckDisassemblyPayload"

    assert payload_fields(data["createCollectionItemPayload"]) ==
             %{"collectionItem" => "CollectionItem"}

    assert payload_fields(data["bulkUpdateCollectionItemsPayload"]) ==
             %{"updatedCount" => "Int!"}

    assert payload_fields(data["updateCollectionAutoSortRulesPayload"]) ==
             %{
               "collectionAutoSortRules" => "[CollectionAutoSortRule!]!",
               "rules" => "[CollectionAutoSortRule!]!"
             }

    assert payload_fields(data["allocateDeckCardProxyPayload"]) == %{"deckCard" => "DeckCard"}
    assert payload_fields(data["updateBackupSettingsPayload"]) ==
             %{"backupSettings" => "BackupSettings"}
  end

  test "global IDs retain every node type and the card resolver accepts them directly" do
    Enum.each(
      [
        card: "oracle-contract",
        printing: "printing-contract",
        collection_item: "1",
        location: "2",
        deck: "3",
        deck_card: "4"
      ],
      fn {type, internal_id} ->
        global_id = Node.to_global_id(type, internal_id, Schema)
        assert {:ok, %{type: ^type, id: ^internal_id}} = Node.from_global_id(global_id, Schema)
      end
    )

    {:ok, %{cards_count: 1, printings_count: 1}} =
      Catalog.import_cards([
        %{
          "id" => "printing-contract",
          "oracle_id" => "oracle-contract",
          "name" => "Contract Card",
          "type_line" => "Artifact",
          "collector_number" => "1",
          "set" => "ctr",
          "set_name" => "Contract Set",
          "lang" => "en",
          "image_uris" => %{},
          "finishes" => ["nonfoil"],
          "legalities" => %{}
        }
      ])

    global_id = Node.to_global_id(:card, "oracle-contract", Schema)

    assert {:ok, %{oracle_id: "oracle-contract", name: "Contract Card"}} =
             QueryResolvers.card(nil, %{id: global_id}, %{schema: Schema})

    {:ok, deck} = Catalog.create_deck(%{"name" => "Node Contract Deck"})
    {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Contract Card"})

    assert %{id: deck_card.id} = Catalog.get_deck_card!(deck_card.id)

    deck_card_id = Node.to_global_id(:deck_card, deck_card.id, Schema)

    assert {:ok, %{data: %{"node" => %{"id" => ^deck_card_id, "quantity" => 1}}}} =
             Absinthe.run(
               """
               query NodeLookup($id: ID!) {
                 node(id: $id) {
                   id
                   ... on DeckCard {
                     quantity
                   }
                 }
               }
               """,
               Schema,
               variables: %{"id" => deck_card_id}
             )
  end

  test "public share schema retains only its public query contract" do
    {:ok, %{data: %{"__schema" => %{"queryType" => %{"fields" => fields}}}}} =
      Absinthe.run(
        """
        {
          __schema {
            queryType {
              fields {
                name
                args {
                  name
                  defaultValue
                  type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
                }
                type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
              }
            }
          }
        }
        """,
        ManavaultWeb.PublicShareSchema
      )

    fields = fields_by_name(fields)

    assert MapSet.new(Map.keys(fields)) ==
             MapSet.new(["card", "deck", "deckBuylist", "deckBuylistExport"])

    assert argument(fields["deck"], "id") == {"ID!", nil}
    assert type_signature(fields["deckBuylist"]["type"]) == "[DeckBuylistEntry!]!"
    assert argument(fields["deckBuylist"], "assumeNoOwned") == {"Boolean", "true"}
    assert argument(fields["deckBuylistExport"], "format") == {"String", "\"text\""}
  end

  defp schema_contract_query do
    """
    query SchemaContract {
      __schema {
        queryType {
          fields {
            name
            args {
              name
              defaultValue
              type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
            }
            type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
          }
        }
        mutationType {
          fields {
            name
            args {
              name
              defaultValue
              type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
            }
            type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
          }
        }
      }
      createCollectionItemPayload: __type(name: "CreateCollectionItemPayload") {
        fields { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
      }
      bulkUpdateCollectionItemsPayload: __type(name: "BulkUpdateCollectionItemsPayload") {
        fields { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
      }
      updateCollectionAutoSortRulesPayload: __type(name: "UpdateCollectionAutoSortRulesPayload") {
        fields { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
      }
      allocateDeckCardProxyPayload: __type(name: "AllocateDeckCardProxyPayload") {
        fields { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
      }
      updateBackupSettingsPayload: __type(name: "UpdateBackupSettingsPayload") {
        fields { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
      }
    }
    """
  end

  defp fields_by_name(fields), do: Map.new(fields, &{&1["name"], &1})

  defp argument(field, name) do
    argument = Enum.find(field["args"], &(&1["name"] == name))
    {type_signature(argument["type"]), argument["defaultValue"]}
  end

  defp payload_fields(%{"fields" => fields}) do
    Map.new(fields, &{&1["name"], type_signature(&1["type"])})
  end

  defp type_signature(%{"kind" => "NON_NULL", "ofType" => type}),
    do: "#{type_signature(type)}!"

  defp type_signature(%{"kind" => "LIST", "ofType" => type}), do: "[#{type_signature(type)}]"
  defp type_signature(%{"name" => name}) when is_binary(name), do: name
end
