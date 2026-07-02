defmodule Manavault.Catalog.Search.SharedScalarPredicatesTest do
  use Manavault.DataCase, async: true

  alias Manavault.Catalog

  setup do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([
               %{
                 "id" => "scryfall-shared-a",
                 "oracle_id" => "oracle-shared-a",
                 "name" => "Shared Alpha",
                 "type_line" => "Artifact",
                 "cmc" => 1.0,
                 "rarity" => "rare",
                 "released_at" => "2020-06-01",
                 "collector_number" => "1",
                 "set" => "sha",
                 "set_name" => "Shared Set",
                 "lang" => "en",
                 "image_uris" => %{},
                 "finishes" => ["nonfoil"],
                 "legalities" => %{}
               },
               %{
                 "id" => "scryfall-shared-b",
                 "oracle_id" => "oracle-shared-b",
                 "name" => "Shared Beta",
                 "type_line" => "Artifact",
                 "cmc" => 5.0,
                 "rarity" => "common",
                 "released_at" => "2010-01-01",
                 "collector_number" => "2",
                 "set" => "shb",
                 "set_name" => "Shared Set B",
                 "lang" => "en",
                 "image_uris" => %{},
                 "finishes" => ["nonfoil"],
                 "legalities" => %{}
               }
             ])

    {:ok, _a} = Catalog.create_collection_item(%{scryfall_id: "scryfall-shared-a", quantity: 1})
    {:ok, _b} = Catalog.create_collection_item(%{scryfall_id: "scryfall-shared-b", quantity: 1})

    :ok
  end

  # Each filter is a shared scalar predicate resolved via the :card / :printing
  # named bindings; assert it selects the same card through both search paths.
  for {label, query, expected} <- [
        {"mana_value equality", "mv=1", "Shared Alpha"},
        {"mana_value gte", "mv>=3", "Shared Beta"},
        {"rarity", "rarity:rare", "Shared Alpha"},
        {"year gte", "year>=2015", "Shared Alpha"},
        {"date lt", "date<2015-01-01", "Shared Beta"}
      ] do
    test "#{label} filters identically for card and collection search" do
      query = unquote(query)
      expected = unquote(expected)

      card_names = Catalog.search_cards(query) |> Enum.map(& &1.name) |> Enum.sort()
      assert card_names == [expected]

      item_names =
        [q: query]
        |> Catalog.list_collection_items(limit: 50)
        |> Enum.map(& &1.printing.card.name)
        |> Enum.sort()

      assert item_names == [expected]
    end
  end
end
