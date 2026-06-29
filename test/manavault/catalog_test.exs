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
