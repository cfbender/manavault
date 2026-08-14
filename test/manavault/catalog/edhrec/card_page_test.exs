defmodule Manavault.Catalog.EDHRec.CardPageTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :time_walk]

  alias Manavault.Catalog

  test "normalizes the four card synergy sections and resolves local cards" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    fetch = fn "Black Lotus" ->
      {:ok,
       %{
         "container" => %{
           "json_dict" => %{
             "card" => %{"name" => "Black Lotus"},
             "cardlists" => [
               section("New Commanders", "newcommanders", [
                 entry("Time Walk", "scryfall-printing-2", "/commanders/time-walk")
               ]),
               section("Top Commanders", "topcommanders", [
                 entry("Black Lotus", "scryfall-printing-1", "/commanders/black-lotus")
               ]),
               section("New Cards", "newcards", [
                 entry("Time Walk", "scryfall-printing-2", "/cards/time-walk", 1.5)
               ]),
               section("High Lift Cards", "highliftcards", [
                 entry("Time Walk", "scryfall-printing-2", "/cards/time-walk", 3.25)
               ]),
               section("Top Cards", "topcards", [
                 entry("Time Walk", "scryfall-printing-2", "/cards/time-walk")
               ])
             ]
           }
         }
       }}
    end

    assert {:ok, result} = Catalog.card_edhrec("Black Lotus", fetch: fetch)
    assert result.url == "https://edhrec.com/cards/black-lotus"

    assert ["New Commanders", "Top Commanders", "New Cards", "High Lift Cards"] =
             Enum.map(result.sections, & &1.header)

    refute Enum.any?(result.sections, &(&1.tag == "topcards"))

    assert %{name: "Time Walk", card: %{oracle_id: "oracle-2"}} =
             result.sections |> List.first() |> Map.fetch!(:cards) |> List.first()

    assert %{lift: 3.25, num_decks: 120, potential_decks: 400} =
             result.sections |> List.last() |> Map.fetch!(:cards) |> List.first()
  end

  test "keeps remote entries when a card is not in the local catalog" do
    fetch = fn _name ->
      {:ok,
       %{
         "container" => %{
           "json_dict" => %{
             "card" => %{"name" => "Black Lotus"},
             "cardlists" => [
               section("New Cards", "newcards", [
                 entry("Future Card", "future-printing", "/cards/future-card", 2.0)
               ])
             ]
           }
         }
       }}
    end

    assert {:ok, %{sections: [%{cards: [card]}]}} =
             Catalog.card_edhrec("Black Lotus", fetch: fetch)

    assert card.card == nil
    assert card.scryfall_id == "future-printing"
    assert card.url == "https://edhrec.com/cards/future-card"
  end

  test "treats partial and empty EDHREC sections as empty lists" do
    fetch = fn _name ->
      {:ok,
       %{
         "container" => %{
           "json_dict" => %{
             "card" => %{"name" => "Black Lotus"},
             "cardlists" => [
               %{"header" => "Top Commanders", "tag" => "topcommanders", "cardviews" => nil},
               nil,
               %{"header" => "New Cards", "tag" => "newcards"}
             ]
           }
         }
       }}
    end

    assert {:ok, %{sections: sections}} = Catalog.card_edhrec("Black Lotus", fetch: fetch)

    assert [
             %{header: "Top Commanders", cards: []},
             %{header: "New Cards", cards: []}
           ] = sections
  end

  defp section(header, tag, cards),
    do: %{"header" => header, "tag" => tag, "cardviews" => cards}

  defp entry(name, id, url, lift \\ nil) do
    %{
      "name" => name,
      "id" => id,
      "url" => url,
      "lift" => lift,
      "num_decks" => 120,
      "potential_decks" => 400
    }
  end
end
