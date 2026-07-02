defmodule Manavault.Catalog.CollectionTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :time_walk, :plains]

  alias Manavault.Catalog
  alias Manavault.Catalog.{Card, CollectionItem}
  alias Manavault.Repo

  test "collection CSV import previews exact rows and applies one selected location" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, binder} = Catalog.create_location(%{name: "Import Binder", kind: "binder"})

    csv = """
    Quantity,Card Name,Set Code,Collector Number,Finish,Condition,Language,Purchase Price
    2,Black Lotus,lea,232,nonfoil,NM,en,90000.00
    1,Time Walk,lea,84,foil,LP,ja,
    """

    assert {:ok, preview} =
             Catalog.preview_collection_import(csv, format: :csv, location_id: binder.id)

    assert %{total: 2, exact: 2, ambiguous: 0, unresolved: 0, location_id: location_id} = preview
    assert location_id == binder.id
    assert Enum.all?(preview.rows, &(&1.attrs["location_id"] == binder.id))

    assert {:ok, result} = Catalog.import_collection(csv, format: :csv, location_id: binder.id)
    assert %{imported: 2, skipped: 0} = result

    items = Catalog.list_collection_items([], limit: 10)
    assert Enum.map(items, & &1.location_id) == [binder.id, binder.id]
    assert Enum.map(items, & &1.quantity) == [2, 1]
    assert Enum.map(items, & &1.purchase_price_cents) == [9_000_000, 500]
    assert Catalog.count_collection_items([]) == 3
    assert Catalog.count_collection_items(location_id: to_string(binder.id)) == 3
  end

  test "collection CSV import can target no location" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    csv = """
    Quantity,Card Name,Set Code,Collector Number
    1,Black Lotus,lea,232
    """

    assert {:ok, %{imported: 1}} = Catalog.import_collection(csv, format: :csv, location_id: "")
    assert [%CollectionItem{location_id: nil}] = Catalog.list_collection_items([], limit: 10)
  end

  test "collection TXT import parses scanned exported lists" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    txt = """
    1x Black Lotus (LEA) 232
    2x Time Walk (LEA) 84 *F*
    1x Unknown Card (TST) 1
    """

    assert {:ok, preview} = Catalog.preview_collection_import(txt, format: :txt)
    assert %{total: 3, exact: 2, ambiguous: 0, unresolved: 1} = preview
    assert Enum.map(preview.rows, & &1.attrs["quantity"]) == [1, 2, 1]
    assert Enum.map(preview.rows, & &1.attrs["finish"]) == ["nonfoil", "foil", "nonfoil"]

    assert {:ok, result} = Catalog.import_collection(txt, format: :txt)
    assert %{imported: 2, skipped: 1} = result
    assert Catalog.count_collection_items([]) == 3
  end

  test "collection import applies a default purchase price to rows without prices" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    csv = """
    Quantity,Card Name,Set Code,Collector Number,Finish,Purchase Price
    1,Black Lotus,lea,232,nonfoil,42.00
    1,Time Walk,lea,84,foil,
    """

    assert {:ok, preview} =
             Catalog.preview_collection_import(csv,
               format: :csv,
               purchase_price_cents: 100
             )

    assert Enum.map(preview.rows, & &1.attrs["purchase_price_cents"]) == [4_200, 100]

    assert {:ok, %{imported: 2, skipped: 0}} =
             Catalog.import_collection(csv,
               format: :csv,
               purchase_price_cents: 100
             )

    items = Catalog.list_collection_items([], limit: 10)
    assert Enum.map(items, & &1.purchase_price_cents) == [4_200, 100]
  end

  test "collection listings exclude list location items unless filtering to that list" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])
    assert {:ok, binder} = Catalog.create_location(%{name: "Trade Binder", kind: "binder"})
    assert {:ok, list} = Catalog.create_location(%{name: "Wishlist", kind: "list"})

    assert {:ok, binder_item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => 2,
               "location_id" => binder.id
             })

    assert {:ok, list_item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => 3,
               "location_id" => list.id
             })

    assert [listed_binder_item] = Catalog.list_collection_items([], limit: 10)
    assert listed_binder_item.id == binder_item.id
    assert Catalog.count_collection_items([]) == 2
    assert [listed_list_item] = Catalog.list_collection_items(location_id: to_string(list.id))
    assert listed_list_item.id == list_item.id
    assert Catalog.count_collection_items(location_id: to_string(list.id)) == 3

    assert [binder_item.id, list_item.id] ==
             Catalog.list_collection_items([include_list_locations: true], limit: 10)
             |> Enum.map(& &1.id)
  end

  test "suggest_card_names returns fuzzy top card name matches" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert ["Black Lotus"] = Catalog.suggest_card_names("blak lotu")
    assert ["Time Walk"] = Catalog.suggest_card_names("timewlk")
    assert [] = Catalog.suggest_card_names(" ")
  end

  test "collection item CRUD persists exact printing inventory" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    assert {:ok, %CollectionItem{} = item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => "2",
               "condition" => "lightly_played",
               "language" => "en",
               "finish" => "nonfoil",
               "location_id" => nil,
               "notes" => "First page"
             })

    assert item.quantity == 2
    assert item.scryfall_id == "scryfall-printing-1"
    assert item.purchase_price_cents == 10_000_000

    assert [listed] = Catalog.list_collection_items(q: "lotus")
    assert listed.id == item.id
    assert listed.printing.scryfall_id == "scryfall-printing-1"
    assert listed.printing.card.name == "Black Lotus"

    assert %CollectionItem{} = loaded = Catalog.get_collection_item!(item.id)
    assert loaded.printing.card.name == "Black Lotus"

    assert {:ok, updated} =
             Catalog.update_collection_item(loaded, %{
               "scryfall_id" => "other-printing",
               "quantity" => "3",
               "condition" => "near_mint",
               "language" => "ja",
               "finish" => "nonfoil",
               "location_id" => nil,
               "notes" => "Updated",
               "purchase_price_cents" => "123.45"
             })

    assert updated.quantity == 3
    assert updated.condition == "near_mint"
    assert updated.language == "ja"
    assert updated.finish == "nonfoil"
    assert updated.scryfall_id == "scryfall-printing-1"
    assert updated.location_id == nil
    assert updated.notes == "Updated"
    assert updated.purchase_price_cents == 12_345

    assert {:error, changeset} =
             Catalog.update_collection_item(updated, %{
               "condition" => "creased",
               "finish" => "gold"
             })

    assert "is invalid" in errors_on(changeset).condition
    assert "is invalid" in errors_on(changeset).finish

    assert {:error, changeset} = Catalog.update_collection_item(updated, %{"finish" => "foil"})
    assert "is not available for this printing" in errors_on(changeset).finish

    assert {:ok, _deleted} = Catalog.delete_collection_item(updated)
    assert [] = Catalog.list_collection_items()
  end

  test "bulk collection item updates apply one attrs map transactionally" do
    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([@black_lotus, @time_walk, @plains])

    assert {:ok, lotus} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "purchase_price_cents" => "1.00"
             })

    assert {:ok, plains} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-basic-plains",
               "purchase_price_cents" => "2.00"
             })

    assert {:ok, updated_items} =
             Catalog.update_collection_items([lotus.id, plains.id], %{
               "finish" => "nonfoil",
               "purchase_price_cents" => "3.50"
             })

    assert Enum.map(updated_items, & &1.id) == [lotus.id, plains.id]
    assert Enum.map(updated_items, & &1.finish) == ["nonfoil", "nonfoil"]
    assert Enum.map(updated_items, & &1.purchase_price_cents) == [350, 350]

    assert {:ok, walk} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-2",
               "finish" => "foil",
               "purchase_price_cents" => "4.00"
             })

    assert {:error, changeset} =
             Catalog.update_collection_items([walk.id, lotus.id], %{
               "finish" => "foil",
               "purchase_price_cents" => "9.99"
             })

    assert "is not available for this printing" in errors_on(changeset).finish
    assert Repo.get!(CollectionItem, walk.id).purchase_price_cents == 400
    assert Repo.get!(CollectionItem, lotus.id).purchase_price_cents == 350
  end

  test "collection item pagination supports deterministic limit and offset" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, _walk} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-2",
               "quantity" => "1",
               "condition" => "near_mint",
               "language" => "ja",
               "finish" => "foil"
             })

    assert {:ok, _lotus} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => "1",
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil"
             })

    assert [%CollectionItem{printing: %{card: %{name: "Black Lotus"}}}] =
             Catalog.list_collection_items([], limit: 1)

    assert [%CollectionItem{printing: %{card: %{name: "Time Walk"}}}] =
             Catalog.list_collection_items([], limit: 1, offset: 1)
  end

  test "collection item filtering supports search and metadata facets" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    {:ok, binder} = Catalog.create_location(%{name: "Trade Binder", kind: "binder"})

    assert {:ok, lotus} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => "1",
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil",
               "location_id" => binder.id
             })

    assert {:ok, walk} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-2",
               "quantity" => "1",
               "condition" => "damaged",
               "language" => "ja",
               "finish" => "foil"
             })

    assert [found] = Catalog.list_collection_items(q: "lotus")
    assert found.id == lotus.id

    assert [found] = Catalog.list_collection_items(q: "84")
    assert found.id == walk.id

    assert [found] = Catalog.list_collection_items(q: "scryfall-printing-2")
    assert found.id == walk.id

    assert [found] = Catalog.list_collection_items(card_id: "oracle-1")
    assert found.id == lotus.id
    assert [] = Catalog.list_collection_items(card_id: "missing")

    assert [found] = Catalog.list_collection_items(condition: "near_mint")
    assert found.id == lotus.id

    assert [found] = Catalog.list_collection_items(language: "ja", finish: "foil")
    assert found.id == walk.id

    assert [found] = Catalog.list_collection_items(location_id: Integer.to_string(binder.id))
    assert found.id == lotus.id

    assert [found] = Catalog.list_collection_items(location_id: "unfiled")
    assert found.id == walk.id
    assert [] = Catalog.list_collection_items(location_id: "missing")
  end

  test "collection item filtering supports Scryfall search syntax" do
    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([@black_lotus, @time_walk, @plains])

    assert {:ok, lotus} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => "1",
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil"
             })

    assert {:ok, walk} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-2",
               "quantity" => "1",
               "condition" => "near_mint",
               "language" => "ja",
               "finish" => "foil"
             })

    assert {:ok, plains} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-basic-plains",
               "quantity" => "1",
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil"
             })

    assert [lotus.id] == collection_item_ids(q: "t:artifact mv=0 id:c usd>999")
    assert [walk.id] == collection_item_ids(q: "set:lea number:84 lang:ja is:foil")
    assert [plains.id] == collection_item_ids(q: "rarity:common type:land")
    assert [lotus.id, walk.id] == collection_item_ids(q: ~s(lotus or "time walk"))
    assert [lotus.id, walk.id] == collection_item_ids(q: "-type:land")
    assert [walk.id] == collection_item_ids(q: "c:u oracle:extra")
    assert [lotus.id, walk.id] == collection_item_ids(q: "rarity>=rare")
    assert Catalog.count_collection_items(q: "rarity>=rare") == 2
    assert [] == Catalog.list_collection_items(q: "artist:Someone")

    assert [lotus_card] = Catalog.search_cards("type:artifact rarity:rare usd>999")
    assert lotus_card.oracle_id == "oracle-1"

    assert [walk_card] = Catalog.search_cards(~s("time walk" is:foil lang:ja))
    assert walk_card.oracle_id == "oracle-2"

    assert [lotus_card, walk_card] = Catalog.search_cards(~s(lotus or "time walk"))
    assert Enum.map([lotus_card, walk_card], & &1.oracle_id) == ["oracle-1", "oracle-2"]
  end

  test "collection filtering supports allocation status via is:allocated and is:unallocated" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, lotus} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => "1",
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil"
             })

    assert {:ok, walk} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-2",
               "quantity" => "1",
               "condition" => "near_mint",
               "language" => "ja",
               "finish" => "foil"
             })

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Allocation Filter"})
    assert {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus"})

    assert {:ok, _allocation} =
             Catalog.allocate_collection_item_to_deck_card(deck_card.id, lotus.id)

    assert [lotus.id] == collection_item_ids(q: "is:allocated")
    assert [walk.id] == collection_item_ids(q: "is:unallocated")
    assert [walk.id] == collection_item_ids(q: "-is:allocated")
    assert [lotus.id] == collection_item_ids(q: "lotus is:allocated")
    assert [] == collection_item_ids(q: "lotus is:unallocated")

    assert [lotus_card] = Catalog.search_cards("is:allocated")
    assert lotus_card.oracle_id == "oracle-1"
    assert [] = Catalog.search_cards("lotus is:unallocated")
    assert [walk_card] = Catalog.search_cards(~s("time walk" is:unallocated))
    assert walk_card.oracle_id == "oracle-2"
  end

  test "collection item sorting supports card quantity, price, and added date" do
    time_walk = Map.put(@time_walk, "prices", %{"usd_foil" => "5.00"})

    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, time_walk])

    assert {:ok, lotus} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-1",
               "quantity" => "1",
               "condition" => "near_mint",
               "language" => "en",
               "finish" => "nonfoil"
             })

    assert {:ok, walk} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-2",
               "quantity" => "3",
               "condition" => "near_mint",
               "language" => "ja",
               "finish" => "foil"
             })

    Repo.update_all(from(item in CollectionItem, where: item.id == ^lotus.id),
      set: [inserted_at: ~U[2026-01-01 00:00:00Z]]
    )

    Repo.update_all(from(item in CollectionItem, where: item.id == ^walk.id),
      set: [inserted_at: ~U[2026-01-02 00:00:00Z]]
    )

    assert [walk.id, lotus.id] ==
             Catalog.list_collection_items([], sort: %{field: "quantity", direction: "desc"})
             |> Enum.map(& &1.id)

    assert [walk.id, lotus.id] ==
             Catalog.list_collection_items([], sort: %{field: "price", direction: "asc"})
             |> Enum.map(& &1.id)

    assert [lotus.id, walk.id] ==
             Catalog.list_collection_items([], sort: %{field: "price", direction: "desc"})
             |> Enum.map(& &1.id)

    assert [lotus.id, walk.id] ==
             Catalog.list_collection_items([], sort: %{field: "added", direction: "asc"})
             |> Enum.map(& &1.id)

    assert [walk.id, lotus.id] ==
             Catalog.list_collection_items([], sort: %{field: "added", direction: "desc"})
             |> Enum.map(& &1.id)
  end

  test "new_collection_item_for_printing defaults to exact printing language and first finish" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    changeset = Catalog.new_collection_item_for_printing("scryfall-printing-1")

    assert changeset.valid?
    assert Ecto.Changeset.get_field(changeset, :scryfall_id) == "scryfall-printing-1"
    assert Ecto.Changeset.get_field(changeset, :language) == "en"
    assert Ecto.Changeset.get_field(changeset, :finish) == "nonfoil"
    assert Ecto.Changeset.get_field(changeset, :quantity) == 1
  end

  test "add_printing_to_collection accepts atom-keyed attrs" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    assert {:ok, item} =
             Catalog.add_printing_to_collection("scryfall-printing-1", %{
               quantity: 2,
               condition: "lightly_played",
               language: "en",
               finish: "nonfoil"
             })

    assert item.scryfall_id == "scryfall-printing-1"
    assert item.quantity == 2
  end

  test "auto-sort rules choose the first storage destination by priority and reject non-storage targets" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, high_priority} = Catalog.create_location(%{name: "High Priority", kind: "box"})
    assert {:ok, low_priority} = Catalog.create_location(%{name: "Low Priority", kind: "box"})
    assert {:ok, list} = Catalog.create_location(%{name: "Wish List", kind: "list"})

    assert {:error, :invalid_auto_sort_target} =
             Catalog.update_collection_auto_sort_rules([
               %{
                 name: "Invalid target",
                 target_location_id: list.id,
                 enabled: true,
                 priority: 1,
                 color_mode: "colorless"
               }
             ])

    update_auto_sort_rules!([
      %{
        target_location_id: high_priority.id,
        enabled: true,
        priority: 5,
        color_mode: "colorless"
      },
      %{target_location_id: low_priority.id, enabled: true, priority: 10, color_mode: "colorless"}
    ])

    assert [
             %{
               enabled: true,
               priority: 5,
               color_mode: "colorless",
               target_location_id: high_priority_id
             },
             %{target_location_id: low_priority_id}
           ] = Catalog.list_collection_auto_sort_rules()

    assert high_priority_id == high_priority.id
    assert low_priority_id == low_priority.id

    item = create_collection_item!("scryfall-printing-1")
    blue_item = create_collection_item!("scryfall-printing-2", finish: "foil")
    list_item = create_collection_item!("scryfall-printing-1", location_id: list.id)
    already_sorted = create_collection_item!("scryfall-printing-1", location_id: high_priority.id)

    assert {:ok,
            %{
              checked_count: 3,
              dry_run: true,
              moved_count: 1,
              skipped_count: 2,
              moves: [%{collection_item_id: preview_item_id, finish: "nonfoil"}]
            }} = Catalog.auto_sort_collection(dry_run: true)

    assert preview_item_id == item.id
    assert Catalog.get_collection_item!(item.id).location_id == nil

    assert {:ok,
            %{
              checked_count: 3,
              moved_count: 1,
              skipped_count: 2,
              moves: [
                %{
                  collection_item_id: item_id,
                  card_name: "Black Lotus",
                  card_id: "oracle-1",
                  image_url: "https://example.test/black-lotus.jpg",
                  quantity: 1,
                  finish: "nonfoil",
                  from_location_id: nil,
                  from_location_name: "Unfiled",
                  to_location_id: high_priority_id,
                  to_location_name: "High Priority"
                }
              ]
            }} = Catalog.auto_sort_collection()

    assert item_id == item.id
    assert high_priority_id == high_priority.id
    assert Catalog.get_collection_item!(item.id).location_id == high_priority.id
    assert Catalog.get_collection_item!(blue_item.id).location_id == nil
    assert Catalog.get_collection_item!(list_item.id).location_id == list.id
    assert Catalog.get_collection_item!(already_sorted.id).location_id == high_priority.id
  end

  test "auto-sort dry run can preview unsaved rule inputs" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    colorless = create_location!("Colorless")
    blue = create_location!("Blue")

    update_auto_sort_rules!([
      %{target_location_id: colorless.id, enabled: true, priority: 1, color_mode: "colorless"}
    ])

    item = create_collection_item!("scryfall-printing-2", finish: "foil")

    assert {:ok,
            %{
              checked_count: 1,
              dry_run: true,
              moved_count: 1,
              skipped_count: 0,
              moves: [%{collection_item_id: item_id, finish: "foil", to_location_id: blue_id}]
            }} =
             Catalog.auto_sort_collection(
               dry_run: true,
               rules: [
                 %{
                   name: "Draft blue",
                   target_location_id: blue.id,
                   enabled: true,
                   priority: 1,
                   color_mode: "include_any",
                   colors: ["U"],
                   type_line_includes: [],
                   type_line_excludes: [],
                   rarities: []
                 }
               ]
             )

    assert item_id == item.id
    assert blue_id == blue.id
    assert Catalog.get_collection_item!(item.id).location_id == nil
    assert [] == location_item_ids(blue)
  end

  test "auto-sort rules cover price, land, color, rarity, and colorless user examples" do
    command_tower = test_card("command-tower", "Command Tower", "Land", [], "rare", "0.25")
    izzet_charm = test_card("izzet-charm", "Izzet Charm", "Instant", ["U", "R"], "uncommon")
    gruul_charm = test_card("gruul-charm", "Gruul Charm", "Instant", ["R", "G"], "uncommon")
    esper_charm = test_card("esper-charm", "Esper Charm", "Instant", ["W", "U", "B"], "uncommon")
    sol_ring = test_card("sol-ring", "Sol Ring", "Artifact", [], "uncommon", "2.00")

    assert {:ok, %{cards_count: 7, printings_count: 7}} =
             Catalog.import_cards([
               @black_lotus,
               @plains,
               command_tower,
               izzet_charm,
               gruul_charm,
               esper_charm,
               sol_ring
             ])

    price = create_location!("Price")
    nonbasic_land = create_location!("Non-Basic Lands")
    basic_land = create_location!("Basic Lands")
    red_green = create_location!("Red Green")
    wub = create_location!("WUB")
    multicolor = create_location!("Multicolor")
    colorless = create_location!("Colorless")

    update_auto_sort_rules!([
      %{target_location_id: price.id, enabled: true, priority: 1, min_price_cents: 1_000_000},
      %{
        target_location_id: nonbasic_land.id,
        enabled: true,
        priority: 2,
        type_line_includes: ["land"],
        type_line_excludes: ["basic"]
      },
      %{
        target_location_id: basic_land.id,
        priority: 3,
        type_line_includes: ["basic land"]
      },
      %{
        target_location_id: red_green.id,
        priority: 4,
        color_mode: "exact",
        colors: ["R", "G"]
      },
      %{
        target_location_id: wub.id,
        priority: 5,
        color_mode: "exact",
        colors: ["W", "U", "B"]
      },
      %{target_location_id: multicolor.id, enabled: true, priority: 6, color_mode: "multicolor"},
      %{
        target_location_id: colorless.id,
        enabled: true,
        priority: 7,
        color_mode: "colorless",
        rarities: ["uncommon"]
      }
    ])

    lotus = create_collection_item!("scryfall-printing-1")
    plains = create_collection_item!("scryfall-printing-basic-plains")
    tower = create_collection_item!("scryfall-command-tower")
    izzet = create_collection_item!("scryfall-izzet-charm")
    gruul = create_collection_item!("scryfall-gruul-charm")
    esper = create_collection_item!("scryfall-esper-charm")
    ring = create_collection_item!("scryfall-sol-ring")

    assert {:ok, %{checked_count: 7, moved_count: 7, skipped_count: 0}} =
             Catalog.auto_sort_collection()

    assert [lotus.id] == location_item_ids(price)
    assert [tower.id] == location_item_ids(nonbasic_land)
    assert [plains.id] == location_item_ids(basic_land)
    assert [gruul.id] == location_item_ids(red_green)
    assert [esper.id] == location_item_ids(wub)
    assert [izzet.id] == location_item_ids(multicolor)
    assert [ring.id] == location_item_ids(colorless)
  end

  test "auto-sort treats transformed cards as front-face colors instead of colorless" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} =
             Catalog.import_cards([transformed_blue_card()])

    assert %Card{colors: "[\"U\"]"} = Repo.get_by!(Card, oracle_id: "oracle-grizzled-angler")

    Repo.get_by!(Card, oracle_id: "oracle-grizzled-angler")
    |> Ecto.Changeset.change(colors: "[]")
    |> Repo.update!()

    colorless = create_location!("Colorless")
    blue = create_location!("Blue")

    update_auto_sort_rules!([
      %{target_location_id: colorless.id, enabled: true, priority: 1, color_mode: "colorless"},
      %{
        target_location_id: blue.id,
        enabled: true,
        priority: 2,
        color_mode: "include_any",
        colors: ["U"]
      }
    ])

    item = create_collection_item!("scryfall-grizzled-angler")

    assert {:ok, %{checked_count: 1, moved_count: 1, skipped_count: 0}} =
             Catalog.auto_sort_collection()

    assert [item.id] == location_item_ids(blue)
    assert [] == location_item_ids(colorless)
  end

  test "auto-sort can target only unfiled collection items" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    target = create_location!("Colorless")
    binder = create_location!("Binder")

    update_auto_sort_rules!([
      %{target_location_id: target.id, enabled: true, priority: 1, color_mode: "colorless"}
    ])

    unfiled_item = create_collection_item!("scryfall-printing-1")
    binder_item = create_collection_item!("scryfall-printing-1", location_id: binder.id)

    assert {:ok, %{checked_count: 1, moved_count: 1, skipped_count: 0}} =
             Catalog.auto_sort_collection(source_location_id: "unfiled")

    assert Catalog.get_collection_item!(unfiled_item.id).location_id == target.id
    assert Catalog.get_collection_item!(binder_item.id).location_id == binder.id
  end

  test "auto-sort ignores collection items allocated to decks" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    target = create_location!("Colorless")

    update_auto_sort_rules!([
      %{target_location_id: target.id, enabled: true, priority: 1, color_mode: "colorless"}
    ])

    source_item = create_collection_item!("scryfall-printing-1")
    unfiled_item = create_collection_item!("scryfall-printing-1")
    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Sleeved"})
    assert {:ok, deck_card} = Catalog.add_card_to_deck(deck, %{"name" => "Black Lotus"})

    assert {:ok, allocation} =
             Catalog.allocate_collection_item_to_deck_card(deck_card.id, source_item.id)

    allocated_item = Catalog.get_collection_item!(allocation.collection_item_id)
    assert allocated_item.location_id == nil

    unfiled_item_id = unfiled_item.id

    assert {:ok,
            %{
              checked_count: 1,
              dry_run: true,
              moved_count: 1,
              skipped_count: 0,
              moves: [%{collection_item_id: ^unfiled_item_id}]
            }} = Catalog.auto_sort_collection(dry_run: true)

    assert {:ok,
            %{
              checked_count: 1,
              moved_count: 1,
              skipped_count: 0,
              moves: [%{collection_item_id: ^unfiled_item_id}]
            }} = Catalog.auto_sort_collection(source_location_id: "unfiled")

    assert Catalog.get_collection_item!(allocated_item.id).location_id == nil
    assert Catalog.get_collection_item!(unfiled_item.id).location_id == target.id
  end

  test "collection import auto-sort moves only imported items" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    colorless = create_location!("Colorless")
    blue = create_location!("Blue")

    update_auto_sort_rules!([
      %{target_location_id: colorless.id, enabled: true, priority: 1, color_mode: "colorless"},
      %{
        target_location_id: blue.id,
        enabled: true,
        priority: 2,
        color_mode: "include_any",
        colors: ["U"]
      }
    ])

    existing = create_collection_item!("scryfall-printing-1")

    csv = """
    Quantity,Card Name,Set Code,Collector Number,Finish
    1,Black Lotus,lea,232,nonfoil
    1,Time Walk,lea,84,foil
    """

    assert {:ok, preview} = Catalog.preview_collection_import(csv, format: :csv)

    assert {:ok, %{imported: 2, skipped: 0, auto_sorted: 2}} =
             Catalog.import_collection_preview(preview, auto_sort: true)

    assert Catalog.get_collection_item!(existing.id).location_id == nil
    assert length(location_item_ids(colorless)) == 1
    assert length(location_item_ids(blue)) == 1
    assert [existing.id] == collection_item_ids(location_id: "unfiled")
  end

  defp create_location!(name) do
    assert {:ok, location} = Catalog.create_location(%{name: name, kind: "box"})
    location
  end

  defp create_collection_item!(scryfall_id, attrs \\ []) do
    attrs =
      attrs
      |> Enum.into(%{})
      |> Map.put(:scryfall_id, scryfall_id)

    assert {:ok, item} = Catalog.create_collection_item(attrs)
    item
  end

  defp update_auto_sort_rules!(rules) do
    rules =
      rules
      |> Enum.with_index(1)
      |> Enum.map(fn {rule, index} -> Map.put_new(rule, :name, "Rule #{index}") end)

    assert {:ok, updated_rules} = Catalog.update_collection_auto_sort_rules(rules)
    updated_rules
  end

  defp location_item_ids(location) do
    location.id
    |> Integer.to_string()
    |> then(&Catalog.list_collection_items(location_id: &1, limit: 10))
    |> Enum.map(& &1.id)
  end

  defp test_card(slug, name, type_line, colors, rarity, price \\ "1.00") do
    %{
      "id" => "scryfall-#{slug}",
      "oracle_id" => "oracle-#{slug}",
      "name" => name,
      "type_line" => type_line,
      "oracle_text" => "",
      "mana_cost" => "",
      "cmc" => 0.0,
      "colors" => colors,
      "color_identity" => colors,
      "legalities" => %{},
      "set" => "tst",
      "set_name" => "Test Set",
      "collector_number" => slug,
      "lang" => "en",
      "rarity" => rarity,
      "finishes" => ["nonfoil"],
      "prices" => %{"usd" => price},
      "released_at" => "2026-01-01"
    }
  end

  defp transformed_blue_card do
    "grizzled-angler"
    |> test_card(
      "Grizzled Angler // Grisly Anglerfish",
      "Creature — Human // Creature — Eldrazi Fish",
      [],
      "uncommon",
      "0.10"
    )
    |> Map.delete("colors")
    |> Map.put("color_identity", ["U"])
    |> Map.put("card_faces", [
      %{
        "name" => "Grizzled Angler",
        "colors" => ["U"],
        "oracle_text" => "{T}: Mill two cards."
      },
      %{
        "name" => "Grisly Anglerfish",
        "colors" => [],
        "oracle_text" => "{6}: Creatures your opponents control attack this turn if able."
      }
    ])
  end
end
