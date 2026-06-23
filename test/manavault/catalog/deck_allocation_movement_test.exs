defmodule Manavault.Catalog.DeckAllocationMovementTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus]

  alias Manavault.Catalog

  alias Manavault.Catalog.{
    CollectionItem,
    DeckAllocation
  }

  test "deck allocation moves collection copies out of their location and restores them" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])
    assert {:ok, binder} = Catalog.create_location(%{name: "Trade Binder", kind: "binder"})

    assert {:ok, item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => 2,
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil",
               "location_id" => binder.id
             })

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Sleeved"})
    assert {:ok, lotus} = Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus"})

    assert {:ok, allocation} = Catalog.allocate_collection_item_to_deck_card(lotus.id, item.id)
    allocation = Repo.get!(DeckAllocation, allocation.id)

    assert allocation.source_location_id == binder.id
    assert Catalog.get_collection_item!(item.id).quantity == 1

    allocated_item = Catalog.get_collection_item!(allocation.collection_item_id)
    assert allocated_item.quantity == 1
    assert allocated_item.location_id == nil

    assert [%CollectionItem{id: source_item_id, quantity: 1}] =
             Catalog.list_collection_items(location_id: to_string(binder.id))

    assert source_item_id == item.id
    assert [] = Catalog.list_collection_items(location_id: "unfiled")

    assert Enum.sort([item.id, allocated_item.id]) ==
             Catalog.list_collection_items([], limit: 10)
             |> Enum.map(& &1.id)
             |> Enum.sort()

    assert {:ok, _allocation} =
             Catalog.deallocate_collection_item_from_deck_card(lotus.id, allocated_item.id)

    returned_item = Catalog.get_collection_item!(allocated_item.id)
    assert returned_item.location_id == binder.id
    assert returned_item.quantity == 1
    assert Catalog.get_collection_item!(item.id).quantity == 1
  end

  test "deck proxy allocation counts as allocated without moving collection items" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])
    assert {:ok, binder} = Catalog.create_location(%{name: "Trade Binder", kind: "binder"})

    assert {:ok, item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => 1,
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil",
               "location_id" => binder.id
             })

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Proxy Test"})

    assert {:ok, lotus} =
             Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus", "quantity" => 2})

    assert {:ok, _deck_card} = Catalog.allocate_proxy_to_deck_card(lotus.id)

    status = Catalog.deck_card_allocation_status(lotus)
    assert status.allocated == 1
    assert status.proxy_allocated == 1
    assert status.available == 1
    assert status.missing == 0
    assert Catalog.get_collection_item!(item.id).location_id == binder.id

    assert {:ok, allocation} = Catalog.allocate_collection_item_to_deck_card(lotus.id, item.id)
    allocated_item = Catalog.get_collection_item!(allocation.collection_item_id)
    assert allocated_item.location_id == nil

    status = Catalog.deck_card_allocation_status(lotus)
    assert status.state == :allocated
    assert status.allocated == 2
    assert status.proxy_allocated == 1

    assert {:ok, _deck_card} = Catalog.deallocate_proxy_from_deck_card(lotus.id)

    status = Catalog.deck_card_allocation_status(lotus)
    assert status.allocated == 1
    assert status.proxy_allocated == 0
    assert status.missing == 1

    assert Catalog.get_collection_item!(allocated_item.id).location_id == nil

    assert {:error, :deck_card_already_allocated} =
             Catalog.allocate_proxy_to_deck_card(lotus.id, 2)
  end

  test "deck allocation does not count collection items held in list locations" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])
    assert {:ok, list} = Catalog.create_location(%{name: "Wishlist", kind: "list"})

    assert {:ok, list_item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => 1,
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil",
               "location_id" => list.id
             })

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Sleeved"})
    assert {:ok, lotus} = Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus"})

    status = Catalog.deck_card_allocation_status(lotus)
    assert status.owned == 0
    assert status.available == 0
    assert status.missing == 1

    assert {:error, :allocation_list_location} =
             Catalog.allocate_collection_item_to_deck_card(lotus.id, list_item.id)
  end
end
