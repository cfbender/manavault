defmodule Manavault.Catalog.CollectionTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures, fixtures: [:black_lotus, :time_walk, :plains]

  alias Manavault.Catalog

  alias Manavault.Catalog.CollectionItem

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
end
