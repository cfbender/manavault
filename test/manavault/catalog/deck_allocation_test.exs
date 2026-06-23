defmodule Manavault.Catalog.DeckAllocationTest do
  use Manavault.DataCase

  use Manavault.CatalogTestFixtures,
    fixtures: [:black_lotus, :black_lotus_beta, :time_walk, :plains]

  alias Manavault.Catalog

  test "deck allocation status covers owned available, allocated elsewhere, missing, and alternate printings" do
    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([@black_lotus, @black_lotus_beta, @time_walk])

    assert {:ok, available_item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => 1,
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil"
             })

    assert {:ok, alternate_item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-3",
               "quantity" => 1,
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil"
             })

    assert {:ok, active_deck} =
             Catalog.create_deck(%{
               "name" => "Active",
               "format" => "vintage",
               "status" => "active"
             })

    assert {:ok, other_deck} =
             Catalog.create_deck(%{
               "name" => "Other",
               "format" => "vintage",
               "status" => "active"
             })

    assert {:ok, active_lotus} =
             Catalog.add_card_to_deck(active_deck, %{
               "name" => "Black Lotus",
               "quantity" => 2,
               "preferred_printing_id" => "scryfall-printing-1"
             })

    assert {:ok, other_lotus} =
             Catalog.add_card_to_deck(other_deck, %{"name" => "Black Lotus", "quantity" => 1})

    status = Catalog.deck_card_allocation_status(active_lotus)
    assert status.state == :available
    assert status.available == 2
    assert status.missing == 0

    assert {:ok, _allocation} =
             Catalog.allocate_collection_item_to_deck_card(other_lotus.id, available_item.id)

    status = Catalog.deck_card_allocation_status(active_lotus)
    assert status.state == :partial
    assert status.owned == 2
    assert status.available == 1
    assert status.allocated_elsewhere == 1
    assert status.missing == 1
    assert Enum.any?(status.candidates, &(&1.item.id == alternate_item.id and &1.available == 1))

    assert {:ok, _allocation} =
             Catalog.allocate_collection_item_to_deck_card(active_lotus.id, alternate_item.id)

    status = Catalog.deck_card_allocation_status(active_lotus)
    assert status.allocated == 1
    assert status.available == 0
    assert status.missing == 1

    assert {:error, :not_enough_available} =
             Catalog.allocate_collection_item_to_deck_card(active_lotus.id, available_item.id)
  end

  test "only active deck allocations reserve cards for other decks" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    assert {:ok, brewing_item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => 1,
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil"
             })

    assert {:ok, archived_item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => 1,
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil"
             })

    assert {:ok, active_deck} =
             Catalog.create_deck(%{
               "name" => "Active",
               "format" => "vintage",
               "status" => "active"
             })

    assert {:ok, brewing_deck} =
             Catalog.create_deck(%{
               "name" => "Brew",
               "format" => "vintage",
               "status" => "brewing"
             })

    assert {:ok, archived_deck} =
             Catalog.create_deck(%{
               "name" => "Archive",
               "format" => "vintage",
               "status" => "archived"
             })

    assert Catalog.deck_reserves_cards?(active_deck)
    refute Catalog.deck_reserves_cards?(brewing_deck)
    refute Catalog.deck_reserves_cards?(archived_deck)

    assert {:ok, active_lotus} =
             Catalog.add_card_to_deck(active_deck, %{"name" => "Black Lotus", "quantity" => 2})

    assert {:ok, brewing_lotus} =
             Catalog.add_card_to_deck(brewing_deck, %{"name" => "Black Lotus"})

    assert {:ok, archived_lotus} =
             Catalog.add_card_to_deck(archived_deck, %{"name" => "Black Lotus"})

    assert {:ok, _allocation} =
             Catalog.allocate_collection_item_to_deck_card(brewing_lotus.id, brewing_item.id)

    assert {:ok, _allocation} =
             Catalog.allocate_collection_item_to_deck_card(archived_lotus.id, archived_item.id)

    status = Catalog.deck_card_allocation_status(active_lotus)
    assert status.available == 2
    assert status.allocated_elsewhere == 0
    assert status.missing == 0

    assert {:ok, _brewing_deck} = Catalog.update_deck(brewing_deck, %{"status" => "active"})

    status = Catalog.deck_card_allocation_status(active_lotus)
    assert status.available == 1
    assert status.allocated_elsewhere == 1
    assert status.missing == 1
  end

  test "bulk deck allocation can use exact printings before matching alternate printings" do
    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([@black_lotus, @black_lotus_beta, @time_walk])

    assert {:ok, exact_item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => 1,
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil"
             })

    assert {:ok, alternate_item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-3",
               "quantity" => 1,
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil"
             })

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Bulk"})

    assert {:ok, lotus} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Black Lotus",
               "quantity" => 2,
               "preferred_printing_id" => "scryfall-printing-1"
             })

    assert {:ok, preview} = Catalog.preview_bulk_allocate_deck(deck, :exact_printings)

    assert %{allocated: 1, cards: 1, skipped: 0} =
             Map.take(preview, [:allocated, :cards, :skipped])

    assert [%{quantity: 1, exact?: true, item: %{id: exact_item_id}}] = preview.entries
    assert exact_item_id == exact_item.id

    assert {:ok, %{allocated: 1, cards: 1, skipped: 0}} =
             Catalog.bulk_allocate_deck(deck, :exact_printings)

    status = Catalog.deck_card_allocation_status(lotus)
    assert status.allocated == 1
    assert Enum.find(status.candidates, &(&1.item.id == exact_item.id)).allocated == 1
    assert Enum.find(status.candidates, &(&1.item.id == alternate_item.id)).allocated == 0

    assert {:ok, preview} = Catalog.preview_bulk_allocate_deck(deck, :matching_printings)
    assert [%{quantity: 1, exact?: false, item: %{id: alternate_item_id}}] = preview.entries
    assert alternate_item_id == alternate_item.id

    assert {:ok, %{allocated: 1, cards: 1, skipped: 0}} =
             Catalog.bulk_allocate_deck(deck, :matching_printings)

    status = Catalog.deck_card_allocation_status(lotus)
    assert status.allocated == 2
    assert Enum.find(status.candidates, &(&1.item.id == alternate_item.id)).allocated == 1
  end

  test "deck allocation status does not mark unowned basic lands missing" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@plains])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Basics"})
    assert {:ok, plains} = Catalog.add_card_to_deck(deck, %{"name" => "Plains", "quantity" => 12})

    status = Catalog.deck_card_allocation_status(plains)
    assert status.state == :basic_land
    assert status.required == 12
    assert status.owned == 0
    assert status.available == 0
    assert status.missing == 0

    assert Catalog.deck_buylist(deck) == []

    assert [
             %{
               card_name: "Plains",
               quantity: 12,
               missing: 12,
               unavailable: 0
             }
           ] = Catalog.deck_buylist(deck, include_basic_lands: true)
  end
end
