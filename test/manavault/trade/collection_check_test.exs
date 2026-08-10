defmodule Manavault.Trade.CollectionCheckTest do
  use Manavault.DataCase

  use Manavault.CatalogTestFixtures,
    fixtures: [:black_lotus, :black_lotus_beta, :time_walk, :plains]

  alias Manavault.Catalog
  alias Manavault.Trade.Lists

  test "summarizes cards ready to pull, allocated elsewhere, missing, and estimated cost" do
    cheap_lotus = %{@black_lotus_beta | "prices" => %{"usd" => "10.00"}}

    assert {:ok, _counts} =
             Catalog.import_cards([@black_lotus, cheap_lotus, @time_walk, @plains])

    assert {:ok, _available_lotus} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => 2
             })

    assert {:ok, allocated_lotus} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-3",
               "quantity" => 1
             })

    assert {:ok, other_deck} = Catalog.create_deck(%{"name" => "Other deck"})
    assert {:ok, other_lotus} = Catalog.add_card_to_deck(other_deck, %{"name" => "Black Lotus"})

    assert {:ok, _allocation} =
             Catalog.allocate_collection_item_to_deck_card(other_lotus.id, allocated_lotus.id)

    assert {:ok, result} =
             Lists.collection_check(%{
               url: nil,
               text: "4 Black Lotus\n1 Time Walk\n10 Plains\n1 Unknown Card"
             })

    assert result.requested_quantity == 16
    assert result.available_quantity == 12
    assert result.unavailable_quantity == 1
    assert result.missing_quantity == 2
    assert result.estimated_cost_cents == 2_500
    assert result.estimated_cost_text == "$25"
    assert result.unpriced_quantity == 0
    assert result.unrecognized == ["Unknown Card"]

    assert lotus = Enum.find(result.cards, &(&1.card_name == "Black Lotus"))
    assert %{required: 4, owned: 3, available: 2, unavailable: 1, missing: 1} = lotus
    assert lotus.status == "partial"
    assert lotus.unit_price_cents == 1_000
    assert lotus.total_price_cents == 2_000
    assert lotus.printing.set_code == "leb"

    assert plains = Enum.find(result.cards, &(&1.card_name == "Plains"))
    assert %{required: 10, available: 10, unavailable: 0, missing: 0} = plains
    assert plains.status == "basic_land"
  end

  test "excludes considering cards by default and can include them" do
    assert {:ok, _counts} = Catalog.import_cards([@black_lotus, @time_walk])

    text = "Mainboard\n1 Black Lotus\nConsidering\n2 Time Walk"

    assert {:ok, default_result} = Lists.collection_check(%{url: nil, text: text})
    assert default_result.requested_quantity == 1
    assert default_result.excluded_quantity == 2
    assert Enum.map(default_result.cards, & &1.card_name) == ["Black Lotus"]

    assert {:ok, complete_result} =
             Lists.collection_check(%{url: nil, text: text}, include_considering: true)

    assert complete_result.requested_quantity == 3
    assert complete_result.excluded_quantity == 0

    assert Enum.map(complete_result.cards, & &1.card_name) |> Enum.sort() ==
             ["Black Lotus", "Time Walk"]
  end
end
