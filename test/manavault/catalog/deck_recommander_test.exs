defmodule Manavault.Catalog.DeckRecommanderTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :time_walk, :plains]

  alias Manavault.Catalog
  alias ManavaultWeb.Schema.Catalog.Errors

  test "deck Recommander payload and response include ranked recs with collection status" do
    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([@black_lotus, @time_walk, @plains])

    assert {:ok, _item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-2",
               "quantity" => 1,
               "finish" => "foil"
             })

    assert {:ok, deck} =
             Catalog.create_deck(%{
               "name" => "Recommander Test",
               "format" => "commander"
             })

    assert {:ok, _commander} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Black Lotus",
               "zone" => "commander",
               "preferred_printing_id" => "scryfall-printing-1"
             })

    assert {:ok, _plains} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Plains",
               "quantity" => 2
             })

    test_pid = self()

    fetch = fn payload ->
      send(test_pid, {:recommander_payload, payload})

      {:ok,
       [
         %{"oracle_id" => "oracle-plains", "name" => "Plains", "score" => 0.71},
         %{"oracle_id" => "oracle-2", "name" => "Time Walk", "score" => 0.9987}
       ]}
    end

    assert {:ok, result} = Catalog.deck_recommander(deck, fetch: fetch)

    assert_received {:recommander_payload,
                     %{
                       "card_format" => "oracle_id",
                       "commander" => "oracle-1",
                       "partner" => nil,
                       "deck" => ["oracle-plains"]
                     }}

    assert result.commanders == [
             %{
               name: "Black Lotus",
               oracle_id: "oracle-1",
               url: "https://recommander.cards/card/oracle-1"
             }
           ]

    # Recommendations are ranked by score descending regardless of input order.
    assert [
             %{
               name: "Time Walk",
               oracle_id: "oracle-2",
               rank: 1,
               score: 0.9987,
               card: %{oracle_id: "oracle-2"},
               collection_status: %{state: "available", owned: 1}
             },
             %{
               name: "Plains",
               rank: 2,
               score: 0.71,
               collection_status: %{state: "allocated", deck_zone: "mainboard"}
             }
           ] = result.recommendations
  end

  test "deck Recommander requires a commander" do
    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([@black_lotus, @time_walk, @plains])

    assert {:ok, deck} =
             Catalog.create_deck(%{
               "name" => "Recommander No Commander",
               "format" => "commander"
             })

    assert {:ok, _plains} = Catalog.add_card_to_deck(deck, %{"name" => "Plains"})

    fetch = fn _payload -> flunk("fetch must not be called without a commander") end

    assert {:error, :recommander_missing_commander} =
             Catalog.deck_recommander(deck, fetch: fetch)
  end

  test "deck Recommander sends a partner commander" do
    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([@black_lotus, @time_walk, @plains])

    assert {:ok, deck} =
             Catalog.create_deck(%{
               "name" => "Recommander Partners",
               "format" => "commander"
             })

    assert {:ok, _commander} =
             Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus", "zone" => "commander"})

    assert {:ok, _partner} =
             Catalog.add_card_to_deck(deck, %{"name" => "Time Walk", "zone" => "commander"})

    test_pid = self()

    fetch = fn payload ->
      send(test_pid, {:recommander_payload, payload})
      {:ok, []}
    end

    assert {:ok, result} = Catalog.deck_recommander(deck, fetch: fetch)

    # Commanders are ordered by card name: Black Lotus, then Time Walk.
    assert_received {:recommander_payload,
                     %{"commander" => "oracle-1", "partner" => "oracle-2", "deck" => []}}

    assert Enum.map(result.commanders, & &1.name) == ["Black Lotus", "Time Walk"]

    assert Enum.map(result.commanders, & &1.url) == [
             "https://recommander.cards/card/oracle-1",
             "https://recommander.cards/card/oracle-2"
           ]

    assert result.recommendations == []
  end

  test "deck Recommander API errors map to friendly messages" do
    assert {:ok, %{cards_count: 1}} = Catalog.import_cards([@black_lotus])

    assert {:ok, deck} =
             Catalog.create_deck(%{"name" => "Recommander Errors", "format" => "commander"})

    assert {:ok, _commander} =
             Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus", "zone" => "commander"})

    error = {:recommander_api_error, "error_rate_limited", []}
    fetch = fn _payload -> {:error, error} end

    assert {:error, ^error} = Catalog.deck_recommander(deck, fetch: fetch)

    assert Errors.recommander_error(error) ==
             "Recommander is rate limiting requests; try again in a minute."

    assert Errors.recommander_error({:recommander_api_error, "error_not_found", []}) ==
             "Recommander does not have data for this commander."

    assert Errors.recommander_error({:recommander_api_error, "error_booting", []}) ==
             "Recommander is starting up; try again in a moment."

    assert Errors.recommander_error({:recommander_api_error, "error_unknown", ["boom"]}) ==
             "Recommander error: boom"

    assert Errors.recommander_error({:recommander_http_error, 500}) ==
             "Recommander returned HTTP 500."

    assert Errors.recommander_error(:recommander_missing_commander) ==
             "Recommander requires a commander."
  end
end
