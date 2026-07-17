defmodule Manavault.CatalogTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures

  alias Manavault.Catalog

  alias Manavault.Catalog.{
    Card,
    CollectionItem,
    Price,
    Printing
  }

  test "card_rulings maps Scryfall rulings and tolerates unavailable data" do
    rulings_uri = "https://api.scryfall.com/cards/oracle-1/rulings"
    card = %Card{rulings_uri: rulings_uri}

    fetcher = fn ^rulings_uri ->
      {:ok,
       %{
         status: 200,
         body: %{
           "data" => [
             %{
               "source" => "wotc",
               "published_at" => "2024-01-02",
               "comment" => "Activated abilities follow normal timing rules."
             }
           ]
         }
       }}
    end

    assert [
             %{
               source: "wotc",
               published_at: "2024-01-02",
               comment: "Activated abilities follow normal timing rules."
             }
           ] = Catalog.card_rulings(card, fetcher: fetcher)

    assert [] = Catalog.card_rulings(%Card{rulings_uri: nil}, fetcher: fetcher)
    assert [] = Catalog.card_rulings(card, fetcher: fn ^rulings_uri -> {:ok, %{status: 500}} end)
    assert [] = Catalog.card_rulings(card, fetcher: fn ^rulings_uri -> {:ok, "not json"} end)

    assert [] =
             Catalog.card_rulings(card, fetcher: fn ^rulings_uri -> {:ok, %{"data" => :bad}} end)
  end

  test "price helpers parse and shorten Scryfall prices" do
    assert Price.format_cents(99) == "$0.99"
    assert Price.format_cents(12_345) == "$123"
    assert Price.format_cents(240_000) == "$2400"
    assert Price.format_cents(1_000_000) == "$10k"
    assert Price.format_cents(10_000_000) == "$100k"
    assert Price.parse_cents("$1,234.50") == 123_450
    assert Price.format_signed_cents(468) == "+$4.68"
    assert Price.format_signed_cents(-468) == "-$4.68"
    assert Price.format_percent(23.4) == "+23.4%"

    printing = %Printing{prices: Jason.encode!(%{"usd" => "12.34", "usd_foil" => "24.00"})}

    assert Price.text_for_printing(printing, "nonfoil") == "$12.34"
    assert Price.text_for_printing(printing, "foil") == "$24"

    item = %CollectionItem{
      quantity: 2,
      finish: "nonfoil",
      purchase_price_cents: 1_000,
      printing: printing
    }

    assert Price.collection_items_total_cents([item]) == 2_468
    assert Price.collection_items_purchase_total_cents([item]) == 2_000
    assert Price.collection_items_value_gain_cents([item]) == 468
    assert Price.collection_items_value_gain_percent([item]) == 23.4
  end

  test "cached catalog reads are invalidated after Scryfall imports" do
    assert [] = Catalog.search_cards("walk")

    assert {:ok, _counts} = Catalog.import_cards([time_walk()])

    assert [%{name: "Time Walk"}] = Catalog.search_cards("walk")
  end

  test "search_cards sorts by name ascending by default" do
    assert {:ok, _counts} = Catalog.import_cards([time_walk(), black_lotus(), plains()])

    assert ["Black Lotus", "Plains", "Time Walk"] =
             Catalog.search_cards("cmc>=0") |> Enum.map(& &1.name)
  end

  test "search_cards sorts by mana value with name tiebreaker" do
    assert {:ok, _counts} = Catalog.import_cards([time_walk(), black_lotus(), plains()])

    assert ["Black Lotus", "Plains", "Time Walk"] =
             Catalog.search_cards("cmc>=0", sort: %{field: "mana_value", direction: "asc"})
             |> Enum.map(& &1.name)

    assert ["Time Walk", "Black Lotus", "Plains"] =
             Catalog.search_cards("cmc>=0", sort: %{field: "mana_value", direction: "desc"})
             |> Enum.map(& &1.name)
  end

  test "search_cards sorts by color identity size then letters" do
    assert {:ok, _counts} = Catalog.import_cards([time_walk(), black_lotus(), plains()])

    # Black Lotus: 0 colors; Time Walk ["U"] sorts before Plains ["W"] (U < W).
    assert ["Black Lotus", "Time Walk", "Plains"] =
             Catalog.search_cards("cmc>=0", sort: %{field: "color", direction: "asc"})
             |> Enum.map(& &1.name)
  end

  test "search_cards sorts by type line" do
    assert {:ok, _counts} = Catalog.import_cards([time_walk(), black_lotus(), plains()])

    assert ["Black Lotus", "Plains", "Time Walk"] =
             Catalog.search_cards("cmc>=0", sort: %{field: "type", direction: "asc"})
             |> Enum.map(& &1.name)
  end

  test "search_cards sorts by release date across printings" do
    assert {:ok, _counts} =
             Catalog.import_cards([black_lotus(), black_lotus_beta(), legal_commander_card()])

    assert ["Black Lotus", "Test Commander"] =
             Catalog.search_cards("cmc>=0", sort: %{field: "released", direction: "asc"})
             |> Enum.map(& &1.name)

    assert ["Test Commander", "Black Lotus"] =
             Catalog.search_cards("cmc>=0", sort: %{field: "released", direction: "desc"})
             |> Enum.map(& &1.name)
  end

  test "search_cards sorts by best rarity across printings" do
    mythic_commander = Map.put(legal_commander_card(), "rarity", "mythic")

    assert {:ok, _counts} =
             Catalog.import_cards([plains(), black_lotus(), mythic_commander])

    assert ["Plains", "Black Lotus", "Test Commander"] =
             Catalog.search_cards("cmc>=0", sort: %{field: "rarity", direction: "asc"})
             |> Enum.map(& &1.name)

    assert ["Test Commander", "Black Lotus", "Plains"] =
             Catalog.search_cards("cmc>=0", sort: %{field: "rarity", direction: "desc"})
             |> Enum.map(& &1.name)
  end

  test "search_cards sorts by best price across printings" do
    assert {:ok, _counts} = Catalog.import_cards([time_walk(), black_lotus(), plains()])

    assert ["Black Lotus", "Time Walk"] =
             Catalog.search_cards("usd>=1", sort: %{field: "price", direction: "desc"})
             |> Enum.map(& &1.name)

    assert ["Time Walk", "Black Lotus"] =
             Catalog.search_cards("usd>=1", sort: %{field: "price", direction: "asc"})
             |> Enum.map(& &1.name)
  end

  test "search_cards falls back to name ascending for unknown sort" do
    assert {:ok, _counts} = Catalog.import_cards([time_walk(), black_lotus()])

    assert ["Black Lotus", "Time Walk"] =
             Catalog.search_cards("cmc>=0", sort: %{field: "bogus", direction: "sideways"})
             |> Enum.map(& &1.name)

    assert ["Black Lotus", "Time Walk"] =
             Catalog.search_cards("cmc>=0", sort: "nonsense") |> Enum.map(& &1.name)
  end

  test "search_cards surfaces the earliest released printing by default" do
    assert {:ok, _counts} = Catalog.import_cards([black_lotus(), black_lotus_beta()])

    assert [%{printings: [first, second]}] = Catalog.search_cards("lotus")
    assert first.set_code == "lea"
    assert second.set_code == "leb"
  end

  test "search_cards surfaces the printing matching printing-level filters" do
    assert {:ok, _counts} = Catalog.import_cards([black_lotus(), black_lotus_beta()])

    assert [%{printings: [first, second]}] = Catalog.search_cards("lotus set:leb")
    assert first.set_code == "leb"
    assert second.set_code == "lea"
  end

  test "search_cards surfaces the printing matching combined set and price filters" do
    cheap_alpha = Map.put(black_lotus(), "prices", %{"usd" => "1.00"})
    pricey_beta = Map.put(black_lotus_beta(), "prices", %{"usd" => "5.00"})

    assert {:ok, _counts} = Catalog.import_cards([cheap_alpha, pricey_beta])

    assert [%{printings: [first, second]}] = Catalog.search_cards("set:leb usd>=3")
    assert first.set_code == "leb"
    assert second.set_code == "lea"
  end

  test "search_cards surfaces the earliest printing among several filter matches" do
    cheap_alpha = Map.put(black_lotus(), "prices", %{"usd" => "1.00"})
    pricey_beta = Map.put(black_lotus_beta(), "prices", %{"usd" => "5.00"})

    pricey_unlimited =
      Map.merge(black_lotus_beta(), %{
        "id" => "scryfall-printing-2ed",
        "set" => "2ed",
        "set_name" => "Unlimited Edition",
        "released_at" => "1993-12-01",
        "prices" => %{"usd" => "10.00"}
      })

    assert {:ok, _counts} =
             Catalog.import_cards([cheap_alpha, pricey_beta, pricey_unlimited])

    assert [%{printings: [first, second, third]}] = Catalog.search_cards("usd>=3")
    assert first.set_code == "leb"
    assert second.set_code == "2ed"
    assert third.set_code == "lea"
  end

  test "cached collection, location, and deck aggregates are invalidated after writes" do
    assert 0 = Catalog.count_collection_items()
    assert 0 = Catalog.count_locations()
    assert 0 = Catalog.count_decks()

    assert {:ok, _counts} = Catalog.import_cards([black_lotus()])

    assert {:ok, _item} =
             Catalog.create_collection_item(%{"scryfall_id" => "scryfall-printing-1"})

    assert {:ok, _location} = Catalog.create_location(%{"name" => "Box", "kind" => "box"})
    assert {:ok, _deck} = Catalog.create_deck(%{"name" => "Cached Deck"})

    assert 1 = Catalog.count_collection_items()
    assert 1 = Catalog.count_locations()
    assert 1 = Catalog.count_decks()
  end
end
