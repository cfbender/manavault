defmodule Manavault.CatalogTest do
  use Manavault.DataCase

  alias Manavault.Catalog

  alias Manavault.Catalog.{
    Card,
    CollectionItem,
    Deck,
    DeckAllocation,
    DeckCard,
    Price,
    Printing,
    Sync
  }

  @black_lotus %{
    "id" => "scryfall-printing-1",
    "oracle_id" => "oracle-1",
    "name" => "Black Lotus",
    "type_line" => "Artifact",
    "oracle_text" => "{T}, Sacrifice Black Lotus: Add three mana of any one color.",
    "mana_cost" => "{0}",
    "cmc" => 0.0,
    "colors" => [],
    "color_identity" => [],
    "legalities" => %{"vintage" => "restricted"},
    "set" => "lea",
    "set_name" => "Limited Edition Alpha",
    "collector_number" => "232",
    "lang" => "en",
    "rarity" => "rare",
    "finishes" => ["nonfoil"],
    "image_uris" => %{"normal" => "https://example.test/black-lotus.jpg"},
    "prices" => %{"usd" => "100000.00"},
    "released_at" => "1993-08-05"
  }

  @renamed_lotus %{@black_lotus | "name" => "Black Lotus Updated", "prices" => %{"usd" => "1.00"}}

  @black_lotus_beta %{
    @black_lotus
    | "id" => "scryfall-printing-3",
      "set" => "leb",
      "set_name" => "Limited Edition Beta",
      "collector_number" => "233",
      "released_at" => "1993-10-04"
  }

  @time_walk %{
    "id" => "scryfall-printing-2",
    "oracle_id" => "oracle-2",
    "name" => "Time Walk",
    "type_line" => "Sorcery",
    "oracle_text" => "Take an extra turn after this turn.",
    "mana_cost" => "{1}{U}",
    "cmc" => 2.0,
    "colors" => ["U"],
    "color_identity" => ["U"],
    "set" => "lea",
    "set_name" => "Limited Edition Alpha",
    "collector_number" => "84",
    "lang" => "ja",
    "rarity" => "rare",
    "finishes" => ["foil"],
    "prices" => %{"usd_foil" => "5.00"},
    "released_at" => "1993-08-05"
  }

  @plains %{
    "id" => "scryfall-printing-basic-plains",
    "oracle_id" => "oracle-plains",
    "name" => "Plains",
    "type_line" => "Basic Land — Plains",
    "cmc" => 0.0,
    "colors" => [],
    "color_identity" => ["W"],
    "set" => "lea",
    "set_name" => "Limited Edition Alpha",
    "collector_number" => "250",
    "lang" => "en",
    "rarity" => "common",
    "finishes" => ["nonfoil"],
    "released_at" => "1993-08-05"
  }

  test "import_cards stores identities and printings and safely updates on rerun" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    assert %Card{name: "Black Lotus", color_identity: "[]"} = Repo.get!(Card, "oracle-1")

    assert %Printing{
             scryfall_id: "scryfall-printing-1",
             oracle_id: "oracle-1",
             set_code: "lea",
             collector_number: "232",
             released_at: ~D[1993-08-05]
           } = Catalog.get_printing_by_scryfall_id("scryfall-printing-1")

    assert %Printing{scryfall_id: "scryfall-printing-1"} = Catalog.get_printing("LEA", "232")
    assert [%Card{oracle_id: "oracle-1"}] = Catalog.search_cards("lotus")

    assert %Card{printings: [%Printing{scryfall_id: "scryfall-printing-1"}]} =
             Catalog.get_card_with_printings("oracle-1")

    assert [%Printing{scryfall_id: "scryfall-printing-1", card: %Card{name: "Black Lotus"}}] =
             Catalog.search_printings(name: "lotus", set_code: "LEA", collector_number: "232")

    assert [] = Catalog.search_printings(name: "", set_code: "", collector_number: "")
    assert [%{set_code: "lea", set_name: "Limited Edition Alpha"}] = Catalog.search_sets("alpha")

    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@renamed_lotus])

    assert Repo.aggregate(Card, :count) == 1
    assert Repo.aggregate(Printing, :count) == 1
    assert %Card{name: "Black Lotus Updated"} = Repo.get!(Card, "oracle-1")
    assert %Printing{prices: prices} = Repo.get!(Printing, "scryfall-printing-1")
    assert Jason.decode!(prices) == %{"usd" => "1.00"}
  end

  test "price helpers parse and shorten Scryfall prices" do
    assert Price.format_cents(99) == "$0.99"
    assert Price.format_cents(12_345) == "$123"
    assert Price.format_cents(240_000) == "$2.4k"
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

  test "deck CRUD stores card identities with optional preferred printings" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, %Deck{} = deck} =
             Catalog.create_deck(%{
               "name" => "Powered",
               "format" => "vintage",
               "status" => "brewing"
             })

    assert {:ok, %DeckCard{} = lotus} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Black Lotus",
               "quantity" => "1",
               "zone" => "mainboard",
               "preferred_printing_id" => "scryfall-printing-1"
             })

    assert lotus.oracle_id == "oracle-1"
    assert lotus.preferred_printing_id == "scryfall-printing-1"

    assert {:ok, %DeckCard{} = updated_lotus} =
             Catalog.add_card_to_deck(deck, %{
               "oracle_id" => "oracle-1",
               "quantity" => "2",
               "zone" => "mainboard"
             })

    assert updated_lotus.id == lotus.id
    assert updated_lotus.quantity == 3

    assert {:ok, %DeckCard{} = commander} =
             Catalog.add_card_to_deck(deck, %{
               "oracle_id" => "oracle-2",
               "quantity" => 1,
               "zone" => "commander"
             })

    loaded = Catalog.get_deck!(deck.id)
    assert Enum.map(loaded.deck_cards, & &1.card.name) == ["Time Walk", "Black Lotus"]

    stats = Catalog.deck_stats(loaded)
    assert stats.total == 4
    assert stats.zones == %{"commander" => 1, "mainboard" => 3}
    assert stats.types["Artifact"] == 3
    assert stats.types["Sorcery"] == 1

    assert {:ok, %DeckCard{zone: "sideboard", quantity: 2}} =
             Catalog.update_deck_card(commander, %{"zone" => "sideboard", "quantity" => "2"})

    assert {:ok, [%DeckCard{tag: "getting"}]} =
             Catalog.update_deck_cards_tag([commander.id], "getting")

    assert [%DeckCard{tag: "getting"}] =
             Catalog.get_deck!(deck.id).deck_cards
             |> Enum.filter(&(&1.id == commander.id))

    assert {:ok, [%DeckCard{tag: nil}]} = Catalog.update_deck_cards_tag([commander.id], nil)

    assert {:error, %Ecto.Changeset{}} = Catalog.update_deck_cards_tag([commander.id], "maybe")

    assert {:ok, _deleted} = Catalog.delete_deck_card(updated_lotus)

    assert {:ok, %Deck{name: "Powered Updated"}} =
             Catalog.update_deck(deck, %{"name" => "Powered Updated"})

    assert {:ok, _deleted_deck} = Catalog.delete_deck(Catalog.get_deck!(deck.id))
    assert [] = Catalog.list_decks()
  end

  test "list_deck_summaries returns counts cover and commander colors without preloading cards" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Summary Test"})

    assert {:ok, _mainboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Black Lotus",
               "quantity" => 2,
               "zone" => "mainboard"
             })

    assert {:ok, _commander} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Time Walk",
               "quantity" => 1,
               "zone" => "commander"
             })

    assert [%Deck{} = summary] = Catalog.list_deck_summaries()
    assert summary.card_count == 3
    assert summary.unique_card_count == 2
    assert summary.commander_color_identity == ["U"]
    assert summary.cover_image_url == "https://example.test/black-lotus.jpg"
    assert %Ecto.Association.NotLoaded{} = summary.deck_cards
  end

  test "deck stats total excludes sideboard and maybeboard cards" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Count Test"})

    assert {:ok, _mainboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Black Lotus",
               "quantity" => 2,
               "zone" => "mainboard"
             })

    assert {:ok, _commander} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Time Walk",
               "quantity" => 1,
               "zone" => "commander"
             })

    assert {:ok, _sideboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Black Lotus",
               "quantity" => 4,
               "zone" => "sideboard"
             })

    assert {:ok, _maybeboard} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Time Walk",
               "quantity" => 8,
               "zone" => "maybeboard"
             })

    stats = deck.id |> Catalog.get_deck!() |> Catalog.deck_stats()

    assert stats.total == 3

    assert stats.zones == %{
             "commander" => 1,
             "mainboard" => 2,
             "maybeboard" => 8,
             "sideboard" => 4
           }
  end

  test "decklist import and export support zones and set collector preferences" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Import Test"})

    text = """
    Commander
    1 Time Walk (LEA) 84 *F*

    Mainboard
    1 Black Lotus (LEA) 232
    2x Black Lotus

    Sideboard
    1 Missing Card

    Maybeboard
    SB: 1 Time Walk
    """

    assert {:ok, %{imported: 4, unresolved: ["Missing Card"]}} =
             Catalog.import_decklist(deck, text)

    loaded = Catalog.get_deck!(deck.id)

    assert %DeckCard{quantity: 3, preferred_printing_id: "scryfall-printing-1"} =
             Enum.find(loaded.deck_cards, &(&1.card.name == "Black Lotus"))

    assert Enum.any?(loaded.deck_cards, &(&1.card.name == "Time Walk" and &1.zone == "commander"))
    assert Enum.any?(loaded.deck_cards, &(&1.card.name == "Time Walk" and &1.zone == "sideboard"))

    export = Catalog.export_decklist(loaded)
    assert export =~ "Commander\n1x Time Walk (LEA) 84 *F*"
    assert export =~ "Mainboard\n3x Black Lotus (LEA) 232"
    assert export =~ "Sideboard\n1x Time Walk"
  end

  test "decklist import ignores comments and deduplicates stable aliases" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} =
             Catalog.import_cards([@black_lotus])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Commented Import"})

    text = """
    Deck:
    1 Black Lotus # exported note
    3x Black Lotus

    Maybe:
    2x Black Lotus *F*
    """

    assert {:ok, %{imported: 2, unresolved: [], skipped_printings: []}} =
             Catalog.import_decklist(deck, text)

    loaded = Catalog.get_deck!(deck.id)

    assert %DeckCard{quantity: 3, finish: "nonfoil", zone: "mainboard"} =
             Enum.find(loaded.deck_cards, &(&1.zone == "mainboard"))

    assert %DeckCard{quantity: 2, finish: "foil", zone: "maybeboard"} =
             Enum.find(loaded.deck_cards, &(&1.zone == "maybeboard"))
  end

  test "decklist import keeps card identities when preferred printing data is unusable" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Mismatched Printing"})

    assert {:ok, %{imported: 1, unresolved: [], skipped_printings: ["Black Lotus"]}} =
             Catalog.import_decklist(deck, "1x Black Lotus (LEA) 84 *F*")

    loaded = Catalog.get_deck!(deck.id)

    assert [
             %DeckCard{
               quantity: 1,
               oracle_id: "oracle-1",
               preferred_printing_id: nil,
               card: %Card{name: "Black Lotus"}
             }
           ] = loaded.deck_cards
  end

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

  test "deck EDHREC payload and response include recs cuts commander sections and collection status" do
    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([@black_lotus, @time_walk, @plains])

    assert {:ok, _item} =
             Catalog.create_collection_item(%{
               "scryfall_id" => "scryfall-printing-2",
               "quantity" => 1,
               "finish" => "foil"
             })

    assert {:ok, deck} =
             Catalog.create_deck(%{
               "name" => "EDHREC Test",
               "format" => "commander"
             })

    assert {:ok, _commander} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Black Lotus",
               "zone" => "commander",
               "preferred_printing_id" => "scryfall-printing-1"
             })

    assert {:ok, _plains} =
             Catalog.add_card_to_deck(deck, %{
               "name" => "Plains",
               "quantity" => 2
             })

    test_pid = self()

    fetch = fn payload ->
      send(test_pid, {:edhrec_payload, payload})

      {:ok,
       %{
         "commanders" => [%{"name" => "Black Lotus"}],
         "inRecs" => [
           %{
             "name" => "Time Walk",
             "oracle_id" => "oracle-2",
             "primary_type" => "Sorcery",
             "score" => 88,
             "salt" => 0.25
           }
         ],
         "outRecs" => [
           %{
             "name" => "Black Lotus",
             "oracle_id" => "oracle-1",
             "primary_type" => "Artifact",
             "score" => 12,
             "salt" => 1.2
           }
         ],
         "more" => true
       }}
    end

    fetch_commander_page = fn "Black Lotus" ->
      {:ok,
       %{
         "title" => "Black Lotus (Commander)",
         "avg_price" => 100_000.0,
         "num_decks_avg" => 123,
         "similar" => ["Time Walk"],
         "panels" => %{
           "taglinks" => [%{"value" => "Power", "slug" => "power", "count" => 7}]
         },
         "container" => %{
           "description" => "Popular decks and cards for Black Lotus",
           "json_dict" => %{
             "card" => %{
               "name" => "Black Lotus",
               "rank" => 1,
               "num_decks" => 123,
               "color_identity" => []
             },
             "cardlists" => [
               %{
                 "header" => "High Synergy Cards",
                 "tag" => "highsynergycards",
                 "cardviews" => [
                   %{
                     "id" => "scryfall-printing-2",
                     "name" => "Time Walk",
                     "synergy" => 0.5,
                     "inclusion" => 77,
                     "num_decks" => 77,
                     "potential_decks" => 123,
                     "url" => "/cards/time-walk"
                   }
                 ]
               }
             ]
           }
         }
       }}
    end

    assert {:ok, result} =
             Catalog.deck_edhrec(deck,
               fetch: fetch,
               fetch_commander_page: fetch_commander_page
             )

    assert_received {:edhrec_payload,
                     %{
                       "commanders" => ["Black Lotus"],
                       "cards" => cards,
                       "options" => %{"excludeLands" => false, "offset" => 0}
                     }}

    assert "1x Black Lotus (LEA) 232" in cards
    assert "2x Plains" in cards

    assert result.more

    assert [%{name: "Time Walk", collection_status: %{state: "available", owned: 1}}] =
             result.recommendations

    assert [%{name: "Black Lotus", collection_status: %{state: "missing", missing: 1}}] =
             result.cuts

    assert [
             %{
               name: "Black Lotus",
               themes: [%{name: "Power", count: 7}],
               sections: [
                 %{
                   header: "High Synergy Cards",
                   cards: [
                     %{
                       name: "Time Walk",
                       oracle_id: "oracle-2",
                       synergy: 0.5,
                       card: %{oracle_id: "oracle-2"},
                       collection_status: %{state: "available"}
                     }
                   ]
                 }
               ]
             }
           ] = result.commander_pages
  end

  @iroh_grand_lotus_list """
  1x Iroh, Grand Lotus (TLA) 349
  1x Aang's Journey (TLA) 1
  1x Arcane Signet (SLD) 820
  1x Ash Barrens (M3C) 318 *F*
  1x Bountiful Landscape (MH3) 217
  1x Cycle of Renewal (TLA) 170
  1x Elemental Teachings (TLA) 178
  1x Evolving Wilds (FIC) 389 *F*
  1x Fabled Passage (BLB) 252
  1x Hermitic Herbalist (TLA) 226
  1x Jeong Jeong, the Deserter (TLA) 142
  1x Mana Geyser (SLD) 1821
  1x Manamorphose (PLST) SHM-211
  1x Price of Freedom (TLA) 149
  1x Rampant Growth (SLD) 1370 *F*
  1x Resonating Lute (SOS) 221 *F*
  1x Shared Roots (SOA) 58
  1x Sol Ring (SOC) 427 *F*
  1x Storm-Kiln Artist (STX) 115 *F*
  1x Uncle Iroh (TLA) 248
  1x Abandon Attachments (TLA) 205 *F*
  1x Accumulate Wisdom (TLA) 44
  1x Agna Qel'a (TLA) 264
  1x Archmage Emeritus (SPG) 150
  1x Artist's Talent (BLB) 124
  1x Boomerang Basics (TLA) 46
  1x Bountiful Landscape (MH3) 217
  1x Chakra Meditation (TLE) 91 *F*
  1x Energybending (TLA) 2
  1x Fiery Islet (WHO) 278
  1x Gran-Gran (TLA) 54 *F*
  1x Guru Pathik (TLA) 223
  1x Illuminate History (STX) 108
  1x Introduction to Prophecy (STX) 4
  1x Lost Days (TLA) 62
  1x Manamorphose (PLST) SHM-211
  1x Price of Freedom (TLA) 149
  1x Resonating Lute (SOS) 221 *F*
  1x Secrets of the Dead (C19) 95
  1x Seismic Sense (TLA) 195
  1x Sheltered Thicket (DRC) 169
  1x Stock Up (SOA) 24
  1x Teachings of the Archaics (STX) 57 *F*
  1x True Ancestry (TLA) 199 *F*
  1x Waterbending Lesson (TLA) 80
  1x Waterlogged Grove (WHO) 331
  1x Boomerang Basics (TLA) 46
  1x Combustion Technique (TLA) 301
  1x Grapeshot (TSR) 166
  1x Introduction to Annihilation (STX) 3
  1x Iroh's Demonstration (TLA) 141
  1x Lost Days (TLA) 62
  1x Origin of Metalbending (TLA) 187 *F*
  1x Pongify (M3C) 190
  1x Price of Freedom (TLA) 149
  1x Snap (DMR) 66
  1x Start from Scratch (STX) 114
  1x Zuko's Exile (TLA) 3
  1x Iroh's Demonstration (TLA) 141
  1x Aang's Journey (TLA) 1
  1x Ash Barrens (M3C) 318 *F*
  1x Price of Freedom (TLA) 149
  1x Octopus Form (TLA) 66
  1x Origin of Metalbending (TLA) 187 *F*
  1x Redirect Lightning (TLA) 151 *F*
  1x Snakeskin Veil (CMM) 323
  1x Chakra Meditation (TLE) 91 *F*
  1x True Ancestry (TLA) 199 *F*
  1x Craterhoof Behemoth (TDM) 346
  1x Archmage Emeritus (SPG) 150
  1x Artist's Talent (BLB) 124
  1x Chakra Meditation (TLE) 91 *F*
  1x Coruscation Mage (BLB) 131
  1x Electrostatic Field (PLST) GRN-97
  1x Gran-Gran (TLA) 54 *F*
  1x Great Hall of the Biblioplex (SOS) 257
  1x Jeong Jeong, the Deserter (TLA) 142
  1x Murmuring Mystic (SPG) 151 *F*
  1x Prismari, the Inspiration (SOS) 212
  1x Resonating Lute (SOS) 221 *F*
  1x Rite of the Dragoncaller (FDN) 92
  1x Storm-Kiln Artist (STX) 115 *F*
  1x Stormcatch Mentor (BLB) 234
  1x Thunderclap Drake (SOC) 204
  1x Uncle Iroh (TLA) 248
  1x Young Pyromancer (2X2) 131
  1x Artist's Talent (BLB) 124
  1x Boomerang Basics (TLA) 46
  1x Coruscation Mage (BLB) 131
  1x Energybending (TLA) 2
  1x Gran-Gran (TLA) 54 *F*
  1x Introduction to Prophecy (STX) 4
  1x Mana Geyser (SLD) 1821
  1x Manamorphose (PLST) SHM-211
  1x Price of Freedom (TLA) 149
  1x Stormcatch Mentor (BLB) 234
  1x Thunderclap Drake (SOC) 204
  1x Uncle Iroh (TLA) 248
  1x Archmage Emeritus (SPG) 150
  1x Electrostatic Field (PLST) GRN-97
  1x Great Hall of the Biblioplex (SOS) 257
  1x Murmuring Mystic (SPG) 151 *F*
  1x Prismari, the Inspiration (SOS) 212
  1x Resonating Lute (SOS) 221 *F*
  1x Rite of the Dragoncaller (FDN) 92
  1x Storm-Kiln Artist (STX) 115 *F*
  1x Stormcatch Mentor (BLB) 234
  1x Thunderclap Drake (SOC) 204
  1x Uncle Iroh (TLA) 248
  1x Young Pyromancer (2X2) 131
  1x Agna Qel'a (TLA) 264
  1x Ash Barrens (M3C) 318 *F*
  1x Bountiful Landscape (MH3) 217
  1x Cascade Bluffs (EOC) 153
  1x Cinder Glade (WHO) 262 *F*
  1x Command Tower (SLD) 758
  1x Dreamroot Cascade (SOS) 254
  1x Evolving Wilds (FIC) 389 *F*
  1x Exotic Orchard (MOC) 398
  1x Fabled Passage (BLB) 252
  1x Fiery Islet (WHO) 278
  1x Flooded Grove (LTC) 309
  4x Forest (7ED) 329
  1x Great Hall of the Biblioplex (SOS) 257
  1x Hinterland Harbor (DSC) 284
  5x Island (J25) 86
  5x Mountain (7ED) 340
  1x Reliquary Tower (MB2) 111
  1x Rockfall Vale (MID) 266
  1x Rootbound Crag (FIC) 416
  1x Sheltered Thicket (DRC) 169
  1x Spectacle Summit (SOS) 262
  1x Sulfur Falls (DOM) 247
  1x Waterlogged Grove (WHO) 331
  1x White Lotus Hideout (TLA) 281 *F*
  1x Chatterstorm (MH2) 152
  1x Elemental Summoning (STX) 183
  1x Germination Practicum (SOS) 296
  1x Improvisation Capstone (SOS) 120
  1x It'll Quench Ya! (TLA) 58 *F*
  1x Mascot Exhibition (STX) 5 *F*
  1x Match the Odds (TLE) 253 *F*
  1x Secret of Bloodbending (TLA) 337 *F*
  1x Solstice Revelations (TLA) 153
  """

  test "decklist import dedupes the exact Iroh list to 100 cards with printings and finishes" do
    expected = expected_decklist_entries(@iroh_grand_lotus_list)

    assert Enum.count(expected) == 89
    assert expected |> Map.values() |> Enum.map(& &1.quantity) |> Enum.sum() == 100

    assert {:ok, %{cards_count: 89, printings_count: 89}} =
             Catalog.import_cards(cards_from_expected_entries(expected))

    assert {:ok, deck} = Catalog.create_deck(%{"name" => "Iroh, Grand Lotus"})

    assert {:ok, %{imported: 89, unresolved: [], skipped_printings: []}} =
             Catalog.import_decklist(deck, @iroh_grand_lotus_list)

    loaded = Catalog.get_deck!(deck.id)
    stats = Catalog.deck_stats(loaded)

    assert stats.total == 100
    assert length(loaded.deck_cards) == 89

    for deck_card <- loaded.deck_cards do
      expected_entry = Map.fetch!(expected, deck_card.card.name)

      assert deck_card.quantity == expected_entry.quantity
      assert deck_card.finish == expected_entry.finish
      assert deck_card.preferred_printing.set_code == String.downcase(expected_entry.set_code)
      assert deck_card.preferred_printing.collector_number == expected_entry.collector_number
    end
  end

  test "sync_scryfall downloads bulk metadata and records success" do
    metadata_url = "https://example.test/metadata"
    download_url = "https://example.test/default-cards.json"

    fetcher = fn
      ^metadata_url -> {:ok, Jason.encode!(%{"download_uri" => download_url})}
      ^download_url -> {:ok, Jason.encode!([@black_lotus])}
    end

    assert {:ok,
            %Sync{
              status: "succeeded",
              cards_count: 1,
              printings_count: 1,
              bulk_uri: ^download_url
            }} =
             Catalog.sync_scryfall(fetcher: fetcher, bulk_url: metadata_url)

    assert %Sync{status: "succeeded"} = Catalog.latest_sync()
    assert Repo.aggregate(Card, :count) == 1
    assert Repo.aggregate(Printing, :count) == 1
  end

  test "import_cards refreshes printing search rows in batches" do
    cards =
      for index <- 1..600 do
        suffix = Integer.to_string(index)

        %{
          @black_lotus
          | "id" => "batch-printing-#{suffix}",
            "oracle_id" => "batch-oracle-#{suffix}",
            "name" => "Batch Lotus #{suffix}",
            "collector_number" => suffix
        }
      end

    assert {:ok, %{cards_count: 600, printings_count: 600}} = Catalog.import_cards(cards)

    assert Repo.aggregate(Card, :count) == 600
    assert Repo.aggregate(Printing, :count) == 600

    assert [%Printing{scryfall_id: "batch-printing-600"}] =
             Catalog.search_printings(name: "Batch Lotus 600", collector_number: "600")
  end

  test "sync_scryfall records failures without importing partial catalog data" do
    metadata_url = "https://example.test/metadata"

    fetcher = fn ^metadata_url -> {:error, "network unavailable"} end

    assert {:error, %Sync{status: "failed", error: error}} =
             Catalog.sync_scryfall(fetcher: fetcher, bulk_url: metadata_url)

    assert error == "network unavailable"
    assert Repo.aggregate(Card, :count) == 0
    assert Repo.aggregate(Printing, :count) == 0
  end

  defp expected_decklist_entries(text) do
    text
    |> String.split(~r/\R/u)
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
    |> Enum.reduce(%{}, fn line, entries ->
      [_, quantity, name, set_code, collector_number | finish_captures] =
        Regex.run(
          ~r/^(\d+)x\s+(.+?)\s+\(([A-Z0-9]+)\)\s+(.+?)(?:\s+\*([A-Z])\*)?$/,
          line
        )

      foil_marker = List.first(finish_captures)
      finish = if foil_marker == "F", do: "foil", else: "nonfoil"

      Map.update(
        entries,
        name,
        %{
          quantity: String.to_integer(quantity),
          name: name,
          set_code: set_code,
          collector_number: collector_number,
          finish: finish
        },
        fn entry ->
          %{entry | quantity: max(entry.quantity, String.to_integer(quantity))}
        end
      )
    end)
  end

  defp cards_from_expected_entries(expected) do
    expected
    |> Map.values()
    |> Enum.map(fn entry ->
      %{
        "id" => scryfall_id(entry),
        "oracle_id" => oracle_id(entry.name),
        "name" => entry.name,
        "type_line" => type_line(entry.name),
        "oracle_text" => "",
        "color_identity" => [],
        "legalities" => %{},
        "set" => String.downcase(entry.set_code),
        "set_name" => "#{entry.set_code} Test Set",
        "collector_number" => entry.collector_number,
        "lang" => "en",
        "finishes" => [entry.finish],
        "image_uris" => %{"normal" => "https://example.test/#{scryfall_id(entry)}.jpg"},
        "prices" => %{},
        "released_at" => "2026-01-01"
      }
    end)
  end

  defp oracle_id(name), do: "oracle-" <> slug(name)

  defp scryfall_id(entry) do
    [
      String.downcase(entry.set_code),
      entry.collector_number,
      entry.finish,
      slug(entry.name)
    ]
    |> Enum.join("-")
  end

  defp slug(value) do
    value
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/u, "-")
    |> String.trim("-")
  end

  defp type_line(name) when name in ["Forest", "Island", "Mountain"], do: "Basic Land"
  defp type_line(_name), do: "Instant"

  defp collection_item_ids(filters) do
    filters
    |> Catalog.list_collection_items(limit: 10)
    |> Enum.map(& &1.id)
  end
end
