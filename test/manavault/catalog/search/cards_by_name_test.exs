defmodule Manavault.Catalog.Search.CardsByNameTest do
  use Manavault.DataCase, async: true
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :time_walk]

  alias Manavault.Catalog
  alias Manavault.Catalog.Card
  alias Manavault.Catalog.Search.CardsByName

  defp import_card!(oracle_id, name, attrs \\ %{}) do
    card =
      @time_walk
      |> Map.merge(%{
        "id" => "scryfall-#{oracle_id}",
        "oracle_id" => oracle_id,
        "name" => name,
        "collector_number" => oracle_id
      })
      |> Map.merge(attrs)

    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([card])
  end

  defp import_oin! do
    import_card!("oracle-oin-the-brave", "Óin the Brave")
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

    test "matches a multi-faced card by its front-face name" do
      import_card!("oracle-bala-ged-recovery", "Bala Ged Recovery // Bala Ged Sanctuary")

      assert %Card{name: "Bala Ged Recovery // Bala Ged Sanctuary"} =
               CardsByName.find("Bala Ged Recovery")

      assert %Card{name: "Bala Ged Recovery // Bala Ged Sanctuary"} =
               CardsByName.find("Bala Ged Recovery // Bala Ged Sanctuary")
    end

    test "prefers an exact name over a multi-faced card's front-face alias" do
      import_card!("oracle-fire", "Fire")
      import_card!("oracle-fire-ice", "Fire // Ice")

      assert %Card{oracle_id: "oracle-fire"} = CardsByName.find("Fire")
    end

    test "matches a Scryfall flavor name while preferring canonical exact names" do
      import_card!("oracle-homeward-path", "Homeward Path", %{"flavor_name" => "Pelican Town"})

      assert %Card{oracle_id: "oracle-homeward-path", name: "Homeward Path"} =
               CardsByName.find("Pelican Town")

      import_card!("oracle-pelican-town", "Pelican Town")

      assert %Card{oracle_id: "oracle-pelican-town"} = CardsByName.find("Pelican Town")
    end
  end

  describe "by_names/1" do
    test "resolves a batch keyed by key/1, ignoring unresolvable names" do
      import_oin!()
      assert {:ok, %{cards_count: 1}} = Catalog.import_cards([@black_lotus])
      import_card!("oracle-bala-ged-recovery", "Bala Ged Recovery // Bala Ged Sanctuary")

      cards =
        CardsByName.by_names([
          "Oin the brave",
          "bLACK loTUS",
          "Bala Ged Recovery",
          "Not A Card",
          nil
        ])

      assert %Card{name: "Óin the Brave"} = Map.get(cards, CardsByName.key("Oin the brave"))
      assert %Card{name: "Black Lotus"} = Map.get(cards, CardsByName.key("bLACK loTUS"))

      assert %Card{name: "Bala Ged Recovery // Bala Ged Sanctuary"} =
               Map.get(cards, CardsByName.key("Bala Ged Recovery"))

      assert map_size(cards) == 4
    end
  end
end
