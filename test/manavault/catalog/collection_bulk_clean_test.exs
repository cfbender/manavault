defmodule Manavault.Catalog.CollectionBulkCleanTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:plains]

  alias Manavault.Catalog

  setup do
    elves =
      legality_card("Llanowar Elves", ["G"], %{"commander" => "legal"}, %{
        "type_line" => "Creature — Elf Druid"
      })

    assert {:ok, _result} =
             Catalog.import_cards([
               Map.merge(elves, %{"id" => "elves-a", "prices" => %{"usd" => "0.10"}}),
               Map.merge(elves, %{
                 "id" => "elves-b",
                 "collector_number" => "b",
                 "finishes" => ["nonfoil", "foil"],
                 "prices" => %{"usd" => "0.05", "usd_foil" => "0.01"}
               }),
               Map.merge(elves, %{
                 "id" => "elves-c",
                 "collector_number" => "c",
                 "prices" => %{"usd" => "1.00"}
               }),
               @plains
             ])

    {:ok, box} = Catalog.create_location(%{name: "Box A", kind: "box"})
    {:ok, binder} = Catalog.create_location(%{name: "Binder", kind: "binder"})
    {:ok, list} = Catalog.create_location(%{name: "Wishlist", kind: "list"})

    box_item = create_item!("elves-a", 5, box.id)
    unfiled_item = create_item!("elves-b", 3, nil)
    binder_item = create_item!("elves-b", 4, binder.id)
    create_item!("elves-c", 20, box.id)
    create_item!("elves-a", 2, list.id)
    create_item!("scryfall-printing-basic-plains", 6, box.id)

    allocated = create_item!("elves-a", 1, box.id)
    {:ok, deck} = Catalog.create_deck(%{"name" => "Elves"})
    {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Llanowar Elves"})
    {:ok, _allocation} = Catalog.allocate_collection_item_to_deck_card(deck_card.id, allocated.id)

    %{
      box: box,
      binder: binder,
      box_item: box_item,
      unfiled: unfiled_item,
      binder_item: binder_item
    }
  end

  test "pulls surplus loose copies of cheap cards, cheapest printings and largest stacks first",
       context do
    assert {:ok, result} = Catalog.collection_bulk_clean()

    assert %{
             max_price_cents: 20,
             min_copies: 10,
             keep_copies: 4,
             card_count: 1,
             pull_quantity: 8,
             pull_value_cents: 45,
             cards: [%{card_name: "Llanowar Elves", total_copies: 12, pulls: pulls}]
           } = result

    assert Enum.map(pulls, &{&1.collection_item_id, &1.quantity, &1.from_location_name}) == [
             {context.binder_item.id, 4, "Binder"},
             {context.unfiled.id, 3, "Unfiled"},
             {context.box_item.id, 1, "Box A"}
           ]

    assert %{price_cents: 10, owned_quantity: 5, from_location_id: box_id} = List.last(pulls)
    assert box_id == context.box.id
  end

  test "thresholds are configurable" do
    assert {:ok, %{cards: []}} = Catalog.collection_bulk_clean(min_copies: 13)
    assert {:ok, %{cards: []}} = Catalog.collection_bulk_clean(max_price_cents: 6)
    assert {:ok, %{cards: []}} = Catalog.collection_bulk_clean(keep_copies: 12)

    assert {:ok, %{cards: cards, pull_quantity: 18}} =
             Catalog.collection_bulk_clean(min_copies: 5, keep_copies: 0)

    assert Enum.map(cards, &{&1.card_name, &1.pull_quantity}) == [
             {"Llanowar Elves", 12},
             {"Plains", 6}
           ]
  end

  test "cards are listed alphabetically with the colors and types used to group them" do
    create_item!("scryfall-printing-basic-plains", 10, nil)

    assert {:ok, %{cards: cards}} = Catalog.collection_bulk_clean(min_copies: 5)

    assert Enum.map(cards, &{&1.card_name, &1.total_copies, &1.colors, &1.type_line}) == [
             {"Llanowar Elves", 12, ["G"], "Creature — Elf Druid"},
             {"Plains", 16, [], "Basic Land — Plains"}
           ]
  end

  test "foils are pulled last unless the preference is turned off", context do
    foil = create_item!("elves-b", 2, nil, "foil")

    assert {:ok, %{prefer_keep_foils: true, cards: [%{total_copies: 14, pulls: pulls}]}} =
             Catalog.collection_bulk_clean()

    assert Enum.map(pulls, &{&1.collection_item_id, &1.quantity}) == [
             {context.binder_item.id, 4},
             {context.unfiled.id, 3},
             {context.box_item.id, 3}
           ]

    assert {:ok, %{cards: [%{pulls: pulls}]}} =
             Catalog.collection_bulk_clean(prefer_keep_foils: false)

    assert [{foil_id, 2} | _rest] = Enum.map(pulls, &{&1.collection_item_id, &1.quantity})
    assert foil_id == foil.id
  end

  test "removes pulled copies, deleting emptied stacks", context do
    assert {:ok, 7} =
             Catalog.remove_bulk_clean_pulls([
               %{collection_item_id: context.binder_item.id, quantity: 4},
               %{collection_item_id: context.box_item.id, quantity: 3}
             ])

    assert_raise Ecto.NoResultsError, fn ->
      Catalog.get_collection_item!(context.binder_item.id)
    end

    assert Catalog.get_collection_item!(context.box_item.id).quantity == 2

    assert {:error, :stale_pull} =
             Catalog.remove_bulk_clean_pulls([
               %{collection_item_id: context.unfiled.id, quantity: 1},
               %{collection_item_id: context.box_item.id, quantity: 3}
             ])

    assert Catalog.get_collection_item!(context.unfiled.id).quantity == 3
  end

  test "kept copies are swapped for copies from the card's other stacks", context do
    assert {:ok, %{cards: [%{swappable_copies: 4}]}} = Catalog.collection_bulk_clean()

    kept = %{context.binder_item.id => 3}

    assert {:ok, %{cards: [%{pull_quantity: 8, swappable_copies: 1, pulls: pulls}]}} =
             Catalog.collection_bulk_clean(kept: kept)

    assert Enum.map(pulls, &{&1.collection_item_id, &1.quantity}) == [
             {context.binder_item.id, 1},
             {context.unfiled.id, 3},
             {context.box_item.id, 4}
           ]

    kept = Map.put(kept, context.unfiled.id, 3)

    assert {:ok, %{cards: [%{pull_quantity: 6, swappable_copies: 0}]}} =
             Catalog.collection_bulk_clean(kept: kept)
  end

  defp create_item!(scryfall_id, quantity, location_id, finish \\ "nonfoil") do
    {:ok, item} =
      Catalog.create_collection_item(%{
        scryfall_id: scryfall_id,
        quantity: quantity,
        location_id: location_id,
        finish: finish
      })

    item
  end
end
