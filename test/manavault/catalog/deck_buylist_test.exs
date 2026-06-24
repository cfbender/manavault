defmodule Manavault.Catalog.DeckBuylistTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :black_lotus_beta]

  alias Manavault.Catalog

  test "deck buylist distinguishes missing from owned unavailable and exports text and csv" do
    cheap_lotus = %{@black_lotus_beta | "prices" => %{"usd" => "10.00"}}

    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, cheap_lotus])

    assert {:ok, available_item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => 1,
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil"
             })

    assert {:ok, unavailable_item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-3",
               "quantity" => 1,
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil"
             })

    assert {:ok, target_deck} =
             Catalog.create_deck(%{
               "name" => "Target",
               "format" => "vintage",
               "status" => "active"
             })

    assert {:ok, other_deck} =
             Catalog.create_deck(%{
               "name" => "Other",
               "format" => "vintage",
               "status" => "active"
             })

    assert {:ok, target_lotus} =
             Catalog.add_card_to_deck(target_deck, %{
               "name" => "Black Lotus",
               "quantity" => 3,
               "preferred_printing_id" => "scryfall-printing-1"
             })

    assert {:ok, other_lotus} =
             Catalog.add_card_to_deck(other_deck, %{"name" => "Black Lotus"})

    assert {:ok, _allocation} =
             Catalog.allocate_collection_item_to_deck_card(other_lotus.id, unavailable_item.id)

    assert Catalog.deck_card_allocation_status(target_lotus).available == 1

    assert [
             %{
               card_name: "Black Lotus",
               quantity: 2,
               missing: 1,
               unavailable: 1,
               reason: "missing and owned but unavailable",
               set_code: "leb",
               collector_number: "233",
               total_price_cents: 2_000
             }
           ] = Catalog.deck_buylist(target_deck, printing_mode: :cheapest)

    assert [
             %{
               set_code: "lea",
               collector_number: "232",
               total_price_cents: 20_000_000
             }
           ] = Catalog.deck_buylist(target_deck, printing_mode: :exact)

    assert [
             %{
               card_name: "Black Lotus",
               quantity: 3,
               missing: 3,
               unavailable: 0,
               reason: "missing",
               set_code: "leb",
               collector_number: "233",
               total_price_cents: 3_000
             }
           ] = Catalog.deck_buylist(target_deck, printing_mode: :cheapest, assume_no_owned: true)

    assert Catalog.export_deck_buylist(
             target_deck,
             :text,
             printing_mode: :cheapest,
             assume_no_owned: true
           ) == "3 Black Lotus (LEB 233)"

    assert Catalog.export_deck_buylist(target_deck, :text, printing_mode: :cheapest) ==
             "2 Black Lotus (LEB 233)"

    assert Catalog.export_deck_buylist(target_deck, :text) == "2 Black Lotus"

    csv = Catalog.export_deck_buylist(target_deck, :csv, printing_mode: :cheapest)

    assert csv =~
             "Quantity,Card,Set,Collector Number,Finish,Language,Reason,Unit Price,Total Price"

    assert csv =~ "2,Black Lotus,leb,233,nonfoil,en,missing and owned but unavailable,$10,$20"

    assert [%{set_code: nil, collector_number: nil}] = Catalog.deck_buylist(target_deck)
    assert available_item.id
  end
end
