defmodule ManavaultWeb.Schema.DeckPickerTest do
  use ManavaultWeb.ConnCase

  alias Manavault.Catalog

  test "random deck query excludes the previous suggestion and exposes play history", %{
    conn: conn
  } do
    assert {:ok, first} = Catalog.create_deck(%{"name" => "First", "status" => "active"})
    assert {:ok, second} = Catalog.create_deck(%{"name" => "Second", "status" => "brewing"})
    assert {:ok, _archived} = Catalog.create_deck(%{"name" => "Retired", "status" => "archived"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => """
        query RandomDeck($excludeId: ID) {
          randomDeck(excludeId: $excludeId) {
            id
            name
            playCount
            skipCount
            lastPlayedAt
          }
        }
        """,
        "variables" => %{"excludeId" => global_deck_id(first)}
      })

    assert %{
             "data" => %{
               "randomDeck" => %{
                 "id" => id,
                 "name" => "Second",
                 "playCount" => 0,
                 "skipCount" => 0,
                 "lastPlayedAt" => nil
               }
             }
           } = json_response(conn, 200)

    assert id == global_deck_id(second)
  end

  test "record deck play mutation persists played and skipped outcomes", %{conn: conn} do
    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Tonight", "status" => "active"})

    played_conn = record_outcome(conn, deck, "PLAYED")

    assert %{
             "data" => %{
               "recordDeckPlay" => %{
                 "deck" => %{
                   "name" => "Tonight",
                   "playCount" => 1,
                   "skipCount" => 0,
                   "lastPlayedAt" => last_played_at
                 }
               }
             }
           } = json_response(played_conn, 200)

    assert is_binary(last_played_at)

    skipped_conn = record_outcome(recycle(played_conn), deck, "SKIPPED")

    assert %{
             "data" => %{
               "recordDeckPlay" => %{
                 "deck" => %{
                   "playCount" => 1,
                   "skipCount" => 1,
                   "lastPlayedAt" => ^last_played_at
                 }
               }
             }
           } = json_response(skipped_conn, 200)
  end

  test "random deck query returns null without playable decks", %{conn: conn} do
    assert {:ok, _archived} = Catalog.create_deck(%{"name" => "Retired", "status" => "archived"})

    conn =
      post(conn, "/api/graphql", %{
        "query" => "query { randomDeck { id } }"
      })

    assert %{"data" => %{"randomDeck" => nil}} = json_response(conn, 200)
  end

  defp record_outcome(conn, deck, outcome) do
    post(conn, "/api/graphql", %{
      "query" => """
      mutation RecordDeckPlay($id: ID!, $outcome: DeckPlayOutcome!) {
        recordDeckPlay(id: $id, outcome: $outcome) {
          deck {
            name
            playCount
            skipCount
            lastPlayedAt
          }
        }
      }
      """,
      "variables" => %{"id" => global_deck_id(deck), "outcome" => outcome}
    })
  end

  defp global_deck_id(deck) do
    Absinthe.Relay.Node.to_global_id(:deck, deck.id, ManavaultWeb.Schema)
  end
end
