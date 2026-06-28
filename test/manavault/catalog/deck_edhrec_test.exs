defmodule Manavault.Catalog.DeckEdhrecTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :time_walk, :plains]

  alias Manavault.Catalog

  test "deck EDHREC payload and response include recs cuts commander sections and collection status" do
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
               "name" => "EDHREC Test",
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
      send(test_pid, {:edhrec_payload, payload})

      {:ok,
       %{
         "commanders" => [%{"name" => "Black Lotus"}],
         "inRecs" => [
           %{
             "name" => "Time Walk",
             "oracle_id" => "oracle-2",
             "primary_type" => "Sorcery",
             "score" => 88,
             "salt" => 0.25
           }
         ],
         "outRecs" => [
           %{
             "name" => "Black Lotus",
             "oracle_id" => "oracle-1",
             "primary_type" => "Artifact",
             "score" => 12,
             "salt" => 1.2
           }
         ],
         "more" => true
       }}
    end

    fetch_commander_page = fn "Black Lotus" ->
      {:ok,
       %{
         "title" => "Black Lotus (Commander)",
         "avg_price" => 100_000.0,
         "num_decks_avg" => 123,
         "similar" => ["Time Walk"],
         "panels" => %{
           "taglinks" => [%{"value" => "Power", "slug" => "power", "count" => 7}]
         },
         "container" => %{
           "description" => "Popular decks and cards for Black Lotus",
           "json_dict" => %{
             "card" => %{
               "name" => "Black Lotus",
               "rank" => 1,
               "num_decks" => 123,
               "color_identity" => []
             },
             "cardlists" => [
               %{
                 "header" => "High Synergy Cards",
                 "tag" => "highsynergycards",
                 "cardviews" => [
                   %{
                     "id" => "scryfall-printing-2",
                     "name" => "Time Walk",
                     "synergy" => 0.5,
                     "inclusion" => 77,
                     "num_decks" => 77,
                     "potential_decks" => 123,
                     "url" => "/cards/time-walk"
                   },
                   %{
                     "id" => "scryfall-printing-1",
                     "name" => "Black Lotus",
                     "synergy" => 0.75,
                     "inclusion" => 99,
                     "num_decks" => 99,
                     "potential_decks" => 123,
                     "url" => "/cards/black-lotus"
                   }
                 ]
               }
             ]
           }
         }
       }}
    end

    assert {:ok, result} =
             Catalog.deck_edhrec(deck,
               fetch: fetch,
               fetch_commander_page: fetch_commander_page
             )

    assert_received {:edhrec_payload,
                     %{
                       "commanders" => ["Black Lotus"],
                       "cards" => cards,
                       "options" => %{"excludeLands" => false, "offset" => 0}
                     }}

    assert "1x Black Lotus (LEA) 232" in cards
    assert "2x Plains" in cards

    assert result.more

    assert [%{name: "Time Walk", collection_status: %{state: "available", owned: 1}}] =
             result.recommendations

    assert [%{name: "Black Lotus", collection_status: %{state: "allocated", missing: 1}}] =
             result.cuts

    assert [
             %{
               name: "Black Lotus",
               themes: [%{name: "Power", count: 7}],
               sections: [
                 %{
                   header: "High Synergy Cards",
                   cards: [
                     %{
                       name: "Time Walk",
                       oracle_id: "oracle-2",
                       card: %{oracle_id: "oracle-2"},
                       collection_status: %{state: "available"}
                     },
                     %{
                       name: "Black Lotus",
                       oracle_id: "oracle-1",
                       card: %{oracle_id: "oracle-1"},
                       collection_status: %{state: "allocated", missing: 1}
                     }
                   ]
                 }
               ]
             }
           ] = result.commander_pages
  end

  test "deck EDHREC status checks sideboard and maybeboard deck cards" do
    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([@black_lotus, @time_walk, @plains])

    assert {:ok, deck} =
             Catalog.create_deck(%{
               "name" => "EDHREC Zones",
               "format" => "commander"
             })

    assert {:ok, _commander} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Black Lotus",
               "zone" => "commander",
               "preferred_printing_id" => "scryfall-printing-1"
             })

    assert {:ok, _sideboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Time Walk",
               "zone" => "sideboard",
               "preferred_printing_id" => "scryfall-printing-2"
             })

    assert {:ok, _maybeboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Plains",
               "zone" => "maybeboard",
               "preferred_printing_id" => "scryfall-printing-basic-plains"
             })

    fetch = fn _payload ->
      {:ok,
       %{
         "commanders" => [%{"name" => "Black Lotus"}],
         "inRecs" => [
           %{"name" => "Time Walk", "oracle_id" => "oracle-2"},
           %{"name" => "Plains", "oracle_id" => "oracle-plains"}
         ],
         "outRecs" => []
       }}
    end

    assert {:ok, result} =
             Catalog.deck_edhrec(deck,
               fetch: fetch,
               fetch_commander_page: fn _name -> {:ok, %{}} end
             )

    assert [
             %{
               name: "Time Walk",
               collection_status: %{state: "allocated", deck_zone: "sideboard"}
             },
             %{name: "Plains", collection_status: %{state: "allocated", deck_zone: "maybeboard"}}
           ] = result.recommendations
  end
end
