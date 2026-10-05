defmodule ManavaultWeb.Schema.TokensTest do
  use ManavaultWeb.ConnCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus]

  alias Absinthe.Relay.Node
  alias Manavault.Catalog

  @treasure %{
    "id" => "token-treasure",
    "oracle_id" => "oracle-treasure",
    "name" => "Treasure",
    "type_line" => "Token Artifact — Treasure",
    "layout" => "token",
    "set" => "tlea",
    "set_name" => "Alpha Tokens",
    "set_type" => "token",
    "collector_number" => "1",
    "lang" => "en",
    "finishes" => ["nonfoil", "foil"],
    "released_at" => "1993-08-05",
    "image_uris" => %{"normal" => "https://example.test/treasure.jpg"}
  }

  @soldier Map.merge(@treasure, %{
             "id" => "token-soldier",
             "oracle_id" => "oracle-soldier",
             "name" => "Soldier",
             "type_line" => "Token Creature — Soldier",
             "collector_number" => "2",
             "image_uris" => %{"normal" => "https://example.test/soldier.jpg"}
           })

  setup do
    producer =
      Map.put(@black_lotus, "all_parts", [%{"component" => "token", "id" => "token-treasure"}])

    {:ok, _result} = Catalog.import_cards([producer, @treasure, @soldier])
    :ok
  end

  test "token items round-trip through add, update, list, and delete", %{conn: conn} do
    add =
      graphql(conn, """
      mutation {
        addTokenItem(input: {scryfallId: "#{global_id(:printing, "token-treasure")}",
                             backScryfallId: "#{global_id(:printing, "token-soldier")}", quantity: 2, finish: "foil"}) {
          tokenItem {
            id quantity finish
            printing { scryfallId imageUrl card { name layout } }
            backPrinting { scryfallId card { name } }
          }
        }
      }
      """)

    assert %{
             "data" => %{
               "addTokenItem" => %{
                 "tokenItem" => %{
                   "id" => id,
                   "quantity" => 2,
                   "finish" => "foil",
                   "printing" => %{
                     "scryfallId" => "token-treasure",
                     "imageUrl" => "https://example.test/treasure.jpg",
                     "card" => %{"name" => "Treasure", "layout" => "token"}
                   },
                   "backPrinting" => %{
                     "scryfallId" => "token-soldier",
                     "card" => %{"name" => "Soldier"}
                   }
                 }
               }
             }
           } = add

    assert {:ok, %{type: :token_item}} = Node.from_global_id(id, ManavaultWeb.Schema)

    update =
      graphql(conn, """
      mutation { updateTokenItem(id: "#{id}", input: {quantity: 5}) { tokenItem { quantity finish } } }
      """)

    assert %{
             "data" => %{
               "updateTokenItem" => %{"tokenItem" => %{"quantity" => 5, "finish" => "foil"}}
             }
           } =
             update

    # The name filter matches the back face too.
    list = graphql(conn, ~s|{ tokenItems(q: "sold") { id quantity } tokenItemCount }|)

    assert %{
             "data" => %{"tokenItems" => [%{"id" => ^id, "quantity" => 5}], "tokenItemCount" => 5}
           } =
             list

    delete = graphql(conn, ~s|mutation { deleteTokenItem(id: "#{id}") { tokenItem { id } } }|)
    assert %{"data" => %{"deleteTokenItem" => %{"tokenItem" => %{"id" => ^id}}}} = delete

    assert %{"data" => %{"tokenItems" => [], "tokenItemCount" => 0}} =
             graphql(conn, "{ tokenItems { id } tokenItemCount }")
  end

  test "addTokenItem rejects a playable card", %{conn: conn} do
    result =
      graphql(conn, """
      mutation { addTokenItem(input: {scryfallId: "#{global_id(:printing, @black_lotus["id"])}"}) { tokenItem { id } } }
      """)

    assert %{"errors" => [%{"message" => "That printing is not a token."}]} = result
  end

  test "tokenPrintings searches token printings and can exclude the scanned face", %{conn: conn} do
    assert %{"data" => %{"tokenPrintings" => []}} =
             graphql(conn, "{ tokenPrintings { scryfallId } }")

    assert %{"data" => %{"tokenPrintings" => [%{"scryfallId" => "token-soldier"}]}} =
             graphql(
               conn,
               ~s|{ tokenPrintings(setCode: "TLEA", excludeScryfallId: "token-treasure") { scryfallId } }|
             )

    # Playable cards never show up as tokens, even by name.
    assert %{"data" => %{"tokenPrintings" => []}} =
             graphql(conn, ~s|{ tokenPrintings(q: "lotus") { scryfallId } }|)
  end

  test "tokenBackOptions separates known pairings from the rest of the set", %{conn: conn} do
    # M3C Dragon #12 is printed with MH3 Copy #1 on its back; Goblin #13 is not.
    [dragon, copy, goblin] =
      for {name, set, number} <- [
            {"Dragon", "tm3c", "12"},
            {"Copy", "tmh3", "1"},
            {"Goblin", "tm3c", "13"}
          ] do
        Map.merge(@treasure, %{
          "id" => "token-#{String.downcase(name)}",
          "oracle_id" => "oracle-#{String.downcase(name)}",
          "name" => name,
          "set" => set,
          "collector_number" => number
        })
      end

    {:ok, _result} = Catalog.import_cards([dragon, copy, goblin])

    query =
      ~s|{ tokenBackOptions(scryfallId: "token-dragon") { known { scryfallId card { name } } sameSet { scryfallId } } }|

    assert %{
             "data" => %{
               "tokenBackOptions" => %{
                 "known" => [%{"scryfallId" => "token-copy", "card" => %{"name" => "Copy"}}],
                 "sameSet" => [%{"scryfallId" => "token-goblin"}]
               }
             }
           } = graphql(conn, query)

    assert %{"data" => %{"tokenBackOptions" => %{"known" => [], "sameSet" => []}}} =
             graphql(
               conn,
               ~s|{ tokenBackOptions(scryfallId: "nope") { known { id } sameSet { id } } }|
             )
  end

  test "cards expose produced tokens with owned counts", %{conn: conn} do
    {:ok, _item} = Catalog.add_token_item(%{scryfall_id: "token-treasure", quantity: 3})

    result =
      graphql(conn, """
      { card(id: "#{global_id(:card, @black_lotus["oracle_id"])}") {
          layout
          producedTokens { ownedCount printing { scryfallId card { name typeLine } } }
        } }
      """)

    assert %{
             "data" => %{
               "card" => %{
                 "layout" => nil,
                 "producedTokens" => [
                   %{
                     "ownedCount" => 3,
                     "printing" => %{
                       "scryfallId" => "token-treasure",
                       "card" => %{
                         "name" => "Treasure",
                         "typeLine" => "Token Artifact — Treasure"
                       }
                     }
                   }
                 ]
               }
             }
           } = result
  end

  test "public shares list produced tokens without revealing owned counts", %{conn: conn} do
    {:ok, _item} = Catalog.add_token_item(%{scryfall_id: "token-treasure", quantity: 3})

    public_card_id =
      Node.to_global_id(:card, @black_lotus["oracle_id"], ManavaultWeb.PublicShareSchema)

    result =
      build_conn()
      |> post("/share/graphql", %{
        "query" => """
        { card(id: "#{public_card_id}") {
            producedTokens { ownedCount printing { scryfallId imageUrl card { name } } }
          } }
        """
      })
      |> json_response(200)

    assert %{
             "data" => %{
               "card" => %{
                 "producedTokens" => [
                   %{
                     "ownedCount" => 0,
                     "printing" => %{
                       "scryfallId" => "token-treasure",
                       "imageUrl" => "https://example.test/treasure.jpg",
                       "card" => %{"name" => "Treasure"}
                     }
                   }
                 ]
               }
             }
           } = result

    # The authenticated schema still reports the real count for the same card.
    assert %{"data" => %{"card" => %{"producedTokens" => [%{"ownedCount" => 3}]}}} =
             graphql(conn, """
             { card(id: "#{global_id(:card, @black_lotus["oracle_id"])}") { producedTokens { ownedCount } } }
             """)
  end

  test "collection import routes token rows to owned tokens", %{conn: conn} do
    rows = [
      %{
        "rowNumber" => 1,
        "status" => "exact",
        "attrs" => %{
          "scryfallId" => "token-treasure",
          "backScryfallId" => "token-soldier",
          "quantity" => 2
        }
      },
      %{
        "rowNumber" => 2,
        "status" => "exact",
        "attrs" => %{"scryfallId" => @black_lotus["id"], "quantity" => 1}
      }
    ]

    result =
      graphql(
        conn,
        """
        mutation Commit($input: CollectionImportCommitInput!) {
          commitCollectionImport(input: $input) { importResult { imported skipped autoSorted } }
        }
        """,
        %{"input" => %{"rows" => rows, "autoSort" => true}}
      )

    assert %{
             "data" => %{
               "commitCollectionImport" => %{
                 "importResult" => %{"imported" => 2, "skipped" => 0, "autoSorted" => 0}
               }
             }
           } = result

    assert [%{scryfall_id: "token-treasure", back_scryfall_id: "token-soldier", quantity: 2}] =
             Catalog.list_token_items()

    assert Catalog.count_collection_items() == 1
  end

  defp graphql(conn, query, variables \\ %{}) do
    conn
    |> post("/api/graphql", %{"query" => query, "variables" => variables})
    |> json_response(200)
  end

  defp global_id(type, id), do: Node.to_global_id(type, id, ManavaultWeb.Schema)
end
