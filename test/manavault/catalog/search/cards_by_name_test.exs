defmodule Manavault.Catalog.Search.CardsByNameTest do
  use Manavault.DataCase, async: true
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :time_walk]

  alias Manavault.Catalog
  alias Manavault.Catalog.Card
  alias Manavault.Catalog.Search.CardsByName

  defp import_oin! do
    oin =
      @time_walk
      |> Map.merge(%{
        "id" => "scryfall-oin-the-brave",
        "oracle_id" => "oracle-oin-the-brave",
        "name" => "Óin the Brave",
        "collector_number" => "12"
      })

    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([oin])
  end

  describe "key/1" do
    test "cleans decklist annotations and normalizes case, diacritics, and apostrophes" do
      assert CardsByName.key("Óin the Brave") == "oin the brave"
      assert CardsByName.key("Oin the brave") == "oin the brave"
      assert CardsByName.key("  Urza's Saga [Deck] ") == "urzas saga"
      assert CardsByName.key("Black Lotus *F*") == "black lotus"
      assert CardsByName.key(nil) == ""
    end
  end

  describe "find/1" do
    test "matches the exact diacritic name and its ASCII form" do
      import_oin!()

      assert %Card{name: "Óin the Brave"} = CardsByName.find("Óin the Brave")
      assert %Card{name: "Óin the Brave"} = CardsByName.find("Oin the brave")
      assert %Card{name: "Óin the Brave"} = CardsByName.find("  ÓIN THE BRAVE  ")
      assert CardsByName.find("Oin") == nil
      assert CardsByName.find("") == nil
    end
  end

  describe "by_names/1" do
    test "resolves a batch keyed by key/1, ignoring unresolvable names" do
      import_oin!()
      assert {:ok, %{cards_count: 1}} = Catalog.import_cards([@black_lotus])

      cards = CardsByName.by_names(["Oin the brave", "bLACK loTUS", "Not A Card", nil])

      assert %Card{name: "Óin the Brave"} = Map.get(cards, CardsByName.key("Oin the brave"))
      assert %Card{name: "Black Lotus"} = Map.get(cards, CardsByName.key("bLACK loTUS"))
      assert map_size(cards) == 2
    end
  end
end
