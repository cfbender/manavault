defmodule Manavault.Catalog.DeckDisassemblyTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :time_walk]

  alias Manavault.Catalog

  alias Manavault.Catalog.{
    CollectionItem,
    Deck,
    DeckAllocation,
    DeckCard
  }

  test "preview reports stable moves and does not write" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@time_walk, @black_lotus])

    assert {:ok, binder} = Catalog.create_location(%{name: "Trade Binder", kind: "binder"})

    assert {:ok, time_walk_item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-2",
               "quantity" => 1,
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "foil",
               "location_id" => binder.id
             })

    assert {:ok, lotus_item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => 1,
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil",
               "location_id" => binder.id
             })

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Powered"})

    assert {:ok, time_walk} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Time Walk",
               "quantity" => 2,
               "finish" => "foil"
             })

    assert {:ok, lotus} = Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus"})

    assert {:ok, time_walk_allocation} =
             Catalog.allocate_collection_item_to_deck_card(time_walk.id, time_walk_item.id)

    assert {:ok, lotus_allocation} =
             Catalog.allocate_collection_item_to_deck_card(lotus.id, lotus_item.id)

    assert {:ok, result} = Catalog.preview_deck_disassembly(deck)

    assert result.checked_count == 3
    assert result.moved_count == 2
    assert result.skipped_count == 1
    assert result.dry_run == true
    assert Enum.map(result.moves, & &1.card_name) == ["Black Lotus", "Time Walk"]

    assert [lotus_move, time_walk_move] = result.moves

    assert lotus_move == %{
             collection_item_id: lotus_allocation.collection_item_id,
             card_name: "Black Lotus",
             card_id: "oracle-1",
             image_url: "https://example.test/black-lotus.jpg",
             quantity: 1,
             finish: "nonfoil",
             from_location_id: deck.id,
             from_location_name: "Powered",
             to_location_id: binder.id,
             to_location_name: "Trade Binder"
           }

    assert time_walk_move.collection_item_id == time_walk_allocation.collection_item_id
    assert time_walk_move.card_name == "Time Walk"
    assert time_walk_move.card_id == "oracle-2"
    assert time_walk_move.image_url == nil
    assert time_walk_move.quantity == 1
    assert time_walk_move.finish == "foil"
    assert time_walk_move.from_location_id == deck.id
    assert time_walk_move.from_location_name == "Powered"
    assert time_walk_move.to_location_id == binder.id
    assert time_walk_move.to_location_name == "Trade Binder"

    assert %Deck{} = Repo.get(Deck, deck.id)
    assert %DeckAllocation{} = Repo.get(DeckAllocation, lotus_allocation.id)
    assert %DeckAllocation{} = Repo.get(DeckAllocation, time_walk_allocation.id)
    assert Catalog.get_collection_item!(lotus_allocation.collection_item_id).location_id == nil

    assert Catalog.get_collection_item!(time_walk_allocation.collection_item_id).location_id ==
             nil
  end

  test "apply restores allocated cards to their original location and deletes the deck" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])
    assert {:ok, binder} = Catalog.create_location(%{name: "Trade Binder", kind: "binder"})
    binder_id = binder.id

    assert {:ok, item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => 1,
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil",
               "location_id" => binder.id
             })

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Sleeved"})
    assert {:ok, lotus} = Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus"})
    assert {:ok, allocation} = Catalog.allocate_collection_item_to_deck_card(lotus.id, item.id)

    assert {:ok, result} = Catalog.disassemble_deck(deck)

    assert result.checked_count == 1
    assert result.moved_count == 1
    assert result.skipped_count == 0
    assert result.dry_run == false
    assert [%{to_location_id: ^binder_id, to_location_name: "Trade Binder"}] = result.moves

    assert Repo.get(Deck, deck.id) == nil
    assert Repo.get(DeckCard, lotus.id) == nil
    assert Repo.get(DeckAllocation, allocation.id) == nil

    assert %CollectionItem{location_id: ^binder_id, quantity: 1} =
             Catalog.get_collection_item!(allocation.collection_item_id)
  end

  test "disassembly reports and restores unfiled source locations" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    assert {:ok, item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => 1,
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil"
             })

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Unfiled Source"})
    assert {:ok, lotus} = Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus"})
    assert {:ok, allocation} = Catalog.allocate_collection_item_to_deck_card(lotus.id, item.id)

    assert {:ok, preview} = Catalog.preview_deck_disassembly(deck)
    assert [%{to_location_id: nil, to_location_name: "Unfiled"}] = preview.moves

    assert {:ok, result} = Catalog.disassemble_deck(deck)
    assert [%{to_location_id: nil, to_location_name: "Unfiled"}] = result.moves
    assert Repo.get(DeckAllocation, allocation.id) == nil

    assert %CollectionItem{location_id: nil, quantity: 1} =
             Catalog.get_collection_item!(allocation.collection_item_id)
  end

  test "disassembly handles empty and unallocated decks" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    assert {:ok, empty_deck} = Catalog.create_deck(%{"name" => "Empty"})
    assert {:ok, empty_preview} = Catalog.preview_deck_disassembly(empty_deck)

    assert empty_preview == %{
             checked_count: 0,
             moved_count: 0,
             skipped_count: 0,
             dry_run: true,
             moves: []
           }

    assert {:ok, empty_result} = Catalog.disassemble_deck(empty_deck)
    assert empty_result == %{empty_preview | dry_run: false}
    assert Repo.get(Deck, empty_deck.id) == nil

    assert {:ok, unallocated_deck} = Catalog.create_deck(%{"name" => "Unallocated"})

    assert {:ok, lotus} =
             Catalog.add_card_to_deck(unallocated_deck, %{
               "name" => "Black Lotus",
               "quantity" => 2
             })

    assert {:ok, result} = Catalog.disassemble_deck(unallocated_deck)

    assert result == %{
             checked_count: 2,
             moved_count: 0,
             skipped_count: 2,
             dry_run: false,
             moves: []
           }

    assert Repo.get(Deck, unallocated_deck.id) == nil
    assert Repo.get(DeckCard, lotus.id) == nil
  end
end
