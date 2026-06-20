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
    RuntimeImageMatcher,
    ScanItem,
    ScanRecognition,
    ScanSession,
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

  @talisman_impulse_tdc %{
    "id" => "talisman-tdc-332",
    "oracle_id" => "oracle-talisman-impulse",
    "name" => "Talisman of Impulse",
    "type_line" => "Artifact",
    "oracle_text" =>
      "{T}: Add {C}.\n{T}: Add {R} or {G}. Talisman of Impulse deals 1 damage to you.",
    "set" => "tdc",
    "set_name" => "Tarkir: Dragonstorm Commander",
    "collector_number" => "332",
    "lang" => "en",
    "finishes" => ["nonfoil"],
    "released_at" => "2025-04-11"
  }

  @talisman_impulse_who %{
    @talisman_impulse_tdc
    | "id" => "talisman-who-842",
      "set" => "who",
      "set_name" => "Doctor Who",
      "collector_number" => "842",
      "released_at" => "2023-10-13"
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

    assert {:ok, preview} = Catalog.preview_collection_import_csv(csv, location_id: binder.id)
    assert %{total: 2, exact: 2, ambiguous: 0, unresolved: 0, location_id: location_id} = preview
    assert location_id == binder.id
    assert Enum.all?(preview.rows, &(&1.attrs["location_id"] == binder.id))

    assert {:ok, result} = Catalog.import_collection_csv(csv, location_id: binder.id)
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

    assert {:ok, %{imported: 1}} = Catalog.import_collection_csv(csv, location_id: "")
    assert [%CollectionItem{location_id: nil}] = Catalog.list_collection_items([], limit: 10)
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

  test "collection item sorting supports card quantity and price" do
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

    assert [walk.id, lotus.id] ==
             Catalog.list_collection_items([], sort: %{field: "quantity", direction: "desc"})
             |> Enum.map(& &1.id)

    assert [walk.id, lotus.id] ==
             Catalog.list_collection_items([], sort: %{field: "price", direction: "asc"})
             |> Enum.map(& &1.id)

    assert [lotus.id, walk.id] ==
             Catalog.list_collection_items([], sort: %{field: "price", direction: "desc"})
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

    assert {:ok, _deleted} = Catalog.delete_deck_card(updated_lotus)

    assert {:ok, %Deck{name: "Powered Updated"}} =
             Catalog.update_deck(deck, %{"name" => "Powered Updated"})

    assert {:ok, _deleted_deck} = Catalog.delete_deck(Catalog.get_deck!(deck.id))
    assert [] = Catalog.list_decks()
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

  test "scan session CRUD stores defaults and preloads items without candidate rows" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    {:ok, binder} = Catalog.create_location(%{name: "Scan Binder", kind: "binder"})

    assert {:ok, %ScanSession{} = scan_session} =
             Catalog.create_scan_session(%{
               "name" => "Saturday scans",
               "default_condition" => "lightly_played",
               "default_language" => "ja",
               "default_finish" => "foil",
               "default_location_id" => binder.id
             })

    assert scan_session.default_condition == "lightly_played"
    assert scan_session.default_language == "ja"
    assert scan_session.default_finish == "foil"
    assert scan_session.default_location_id == binder.id

    assert {:ok, %ScanItem{} = item} =
             Catalog.create_scan_item(scan_session, %{
               image_path: "/tmp/scan-1.jpg",
               status: "needs_review"
             })

    assert item.condition == "lightly_played"
    assert item.language == "ja"
    assert item.finish == "foil"
    assert item.location_id == binder.id

    assert [listed] = Catalog.list_scan_sessions()
    assert listed.id == scan_session.id
    assert listed.default_location.name == "Scan Binder"

    loaded = Catalog.get_scan_session!(scan_session.id)
    assert loaded.default_location.name == "Scan Binder"
    assert [loaded_item] = loaded.scan_items
    assert loaded_item.image_path == "/tmp/scan-1.jpg"
    assert loaded_item.location.name == "Scan Binder"

    assert %{pending: [], reviewed: [^loaded_item], accepted: []} =
             Catalog.scan_session_items_by_review_state(loaded)
  end

  test "create_scan_item_from_capture stores a captured image under the configured upload directory" do
    upload_dir =
      Path.join(System.tmp_dir!(), "manavault-captures-#{System.unique_integer([:positive])}")

    previous_dir = Application.get_env(:manavault, :capture_upload_dir)
    Application.put_env(:manavault, :capture_upload_dir, upload_dir)

    on_exit(fn ->
      if previous_dir do
        Application.put_env(:manavault, :capture_upload_dir, previous_dir)
      else
        Application.delete_env(:manavault, :capture_upload_dir)
      end

      File.rm_rf!(upload_dir)
    end)

    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Camera batch"})

    assert {:ok, %ScanItem{} = item} =
             Catalog.create_scan_item_from_capture(
               scan_session,
               "data:image/jpeg;base64,#{Base.encode64("fake image bytes")}"
             )

    assert item.scan_session_id == scan_session.id
    assert item.status == "processing"
    assert item.image_path =~ upload_dir
    assert item.image_path =~ "/scan_sessions/#{scan_session.id}/"
    assert item.image_path =~ ".jpg"
    assert File.read!(item.image_path) == "fake image bytes"
  end

  test "create_scan_item_from_capture rejects invalid image data" do
    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Bad camera batch"})

    assert {:error, "Capture must be a JPEG or PNG data URL."} =
             Catalog.create_scan_item_from_capture(scan_session, "not image data")
  end

  test "create_recognized_scan_item_from_capture stores only matched card captures" do
    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([@black_lotus, @black_lotus_beta, @time_walk])

    upload_dir =
      Path.join(
        System.tmp_dir!(),
        "manavault-recognized-captures-#{System.unique_integer([:positive])}"
      )

    previous_dir = Application.get_env(:manavault, :capture_upload_dir)
    Application.put_env(:manavault, :capture_upload_dir, upload_dir)

    on_exit(fn ->
      if previous_dir do
        Application.put_env(:manavault, :capture_upload_dir, previous_dir)
      else
        Application.delete_env(:manavault, :capture_upload_dir)
      end

      File.rm_rf!(upload_dir)
    end)

    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Matched camera batch"})

    assert {:ok, item} =
             Catalog.create_recognized_scan_item_from_capture(
               scan_session,
               "data:image/png;base64,#{Base.encode64("fake image bytes")}",
               ocr_runner: fn _path -> {:ok, "Black Lotus\nSet: LEA\nCollector #232"} end
             )

    assert item.status == "recognized"
    assert item.image_path =~ upload_dir
    assert item.accepted_printing_id == "scryfall-printing-1"
    assert [loaded_item] = Catalog.get_scan_session!(scan_session.id).scan_items
    assert loaded_item.id == item.id
  end

  test "create_recognized_scan_item_from_capture rejects weak token-only matches" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    upload_dir =
      Path.join(
        System.tmp_dir!(),
        "manavault-weak-recognized-captures-#{System.unique_integer([:positive])}"
      )

    previous_dir = Application.get_env(:manavault, :capture_upload_dir)
    Application.put_env(:manavault, :capture_upload_dir, upload_dir)

    on_exit(fn ->
      if previous_dir do
        Application.put_env(:manavault, :capture_upload_dir, previous_dir)
      else
        Application.delete_env(:manavault, :capture_upload_dir)
      end

      File.rm_rf!(upload_dir)
    end)

    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Weak match batch"})

    assert {:error,
            "No card match found with enough confidence. Keep the card steady in the frame."} =
             Catalog.create_recognized_scan_item_from_capture(
               scan_session,
               "data:image/png;base64,#{Base.encode64("fake image bytes")}",
               ocr_runner: fn _path -> {:ok, "sacrifice"} end
             )

    assert Catalog.get_scan_session!(scan_session.id).scan_items == []
    assert File.ls!(Path.join(upload_dir, "scan_sessions/#{scan_session.id}")) == []
  end

  test "create_recognized_scan_item_from_capture stores strong same-card printing matches" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @black_lotus_beta])

    upload_dir =
      Path.join(
        System.tmp_dir!(),
        "manavault-same-card-recognized-captures-#{System.unique_integer([:positive])}"
      )

    previous_dir = Application.get_env(:manavault, :capture_upload_dir)
    Application.put_env(:manavault, :capture_upload_dir, upload_dir)

    on_exit(fn ->
      if previous_dir do
        Application.put_env(:manavault, :capture_upload_dir, previous_dir)
      else
        Application.delete_env(:manavault, :capture_upload_dir)
      end

      File.rm_rf!(upload_dir)
    end)

    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Same-card batch"})

    assert {:ok, item} =
             Catalog.create_recognized_scan_item_from_capture(
               scan_session,
               "data:image/png;base64,#{Base.encode64("fake image bytes")}",
               ocr_runner: fn _path -> {:ok, "Black Lotus"} end
             )

    assert item.status == "recognized"
    assert item.accepted_printing_id in ["scryfall-printing-1", "scryfall-printing-3"]
    assert [_item] = Catalog.get_scan_session!(scan_session.id).scan_items
  end

  test "create_recognized_scan_item_from_capture can lock to sets and prefer foil" do
    beta_foil = Map.put(@black_lotus_beta, "finishes", ["nonfoil", "foil"])

    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, beta_foil])

    upload_dir =
      Path.join(
        System.tmp_dir!(),
        "manavault-set-locked-recognized-captures-#{System.unique_integer([:positive])}"
      )

    previous_dir = Application.get_env(:manavault, :capture_upload_dir)
    Application.put_env(:manavault, :capture_upload_dir, upload_dir)

    on_exit(fn ->
      if previous_dir do
        Application.put_env(:manavault, :capture_upload_dir, previous_dir)
      else
        Application.delete_env(:manavault, :capture_upload_dir)
      end

      File.rm_rf!(upload_dir)
    end)

    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Set locked batch"})

    assert {:ok, item} =
             Catalog.create_recognized_scan_item_from_capture(
               scan_session,
               "data:image/png;base64,#{Base.encode64("fake image bytes")}",
               ocr_runner: fn _path -> {:ok, "Black Lotus"} end,
               set_codes: ["leb"],
               prefer_foil: true
             )

    assert item.status == "recognized"
    assert item.accepted_printing_id == "scryfall-printing-3"
    assert item.finish == "foil"
  end

  test "create_recognized_scan_item_from_capture does not store unmatched captures" do
    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "No match batch"})

    upload_dir =
      Path.join(
        System.tmp_dir!(),
        "manavault-unmatched-captures-#{System.unique_integer([:positive])}"
      )

    previous_dir = Application.get_env(:manavault, :capture_upload_dir)
    Application.put_env(:manavault, :capture_upload_dir, upload_dir)

    on_exit(fn ->
      if previous_dir do
        Application.put_env(:manavault, :capture_upload_dir, previous_dir)
      else
        Application.delete_env(:manavault, :capture_upload_dir)
      end

      File.rm_rf!(upload_dir)
    end)

    assert {:error, "No card match found. Keep the card steady in the frame."} =
             Catalog.create_recognized_scan_item_from_capture(
               scan_session,
               "data:image/png;base64,#{Base.encode64("fake image bytes")}",
               ocr_runner: fn _path -> {:ok, "not a card"} end
             )

    assert Catalog.get_scan_session!(scan_session.id).scan_items == []
    assert File.ls!(Path.join(upload_dir, "scan_sessions/#{scan_session.id}")) == []
  end

  test "import_cards populates SQLite OCR search table for normalized and compact text" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert %{rows: [["scryfall-printing-1"]]} =
             Repo.query!(
               """
               SELECT scryfall_id
               FROM scryfall_printing_search
               WHERE scryfall_printing_search MATCH ?
               ORDER BY scryfall_id
               """,
               ["\"blacklotus\""]
             )

    assert %{rows: rows} =
             Repo.query!(
               """
               SELECT scryfall_id
               FROM scryfall_printing_search
               WHERE scryfall_printing_search MATCH ?
               ORDER BY scryfall_id
               """,
               ["\"sacrifice\""]
             )

    assert ["scryfall-printing-1"] in rows
  end

  test "scan recognition uses SQLite search by default for candidate retrieval" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parsed = ScanRecognition.parse_text("Black Lotus\nSet: LEA\nCollector #232")

    assert [%{printing: printing, confidence: confidence}] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert confidence > 0.0
  end

  test "scan recognition uses SQLite search without an in-memory index option" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parsed = ScanRecognition.parse_text("Time Walk\nCollector: 84\nSet: LEA")

    assert [%{printing: printing}] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-2"
  end

  test "scan recognition can use image evidence without OCR text evidence" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parsed = ScanRecognition.parse_text("")

    assert [%{printing: printing, confidence: confidence, evidence: evidence}] =
             ScanRecognition.match_candidates(parsed,
               image_matches: [%{scryfall_id: "scryfall-printing-2", score: 0.91}]
             )

    assert printing.scryfall_id == "scryfall-printing-2"
    assert_in_delta confidence, 0.7735, 0.0001
    assert_in_delta evidence.scores.image_match, 0.7735, 0.0001
    assert evidence.image_match.score == 0.91
  end

  test "scan recognition reranks weak OCR candidates with image evidence" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parsed = ScanRecognition.parse_text("sacrifice")

    assert [%{printing: printing, evidence: evidence} | _] =
             ScanRecognition.match_candidates(parsed,
               image_matches: [%{scryfall_id: "scryfall-printing-2", score: 0.9}]
             )

    assert printing.scryfall_id == "scryfall-printing-2"
    assert_in_delta evidence.scores.image_match, 0.765, 0.0001
  end

  test "scan recognition reranks candidate printings with runtime image matcher" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @black_lotus_beta])

    assert {:ok, %{candidates: [%{printing: printing, evidence: evidence} | _]}} =
             ScanRecognition.recognize(%ScanItem{image_path: "/tmp/black-lotus.jpg"},
               ocr_runner: fn _path -> {:ok, "Black Lotus"} end,
               image_matcher: fn "/tmp/black-lotus.jpg", printings ->
                 assert Enum.any?(printings, &(&1.scryfall_id == "scryfall-printing-1"))
                 assert Enum.any?(printings, &(&1.scryfall_id == "scryfall-printing-3"))
                 [%{scryfall_id: "scryfall-printing-3", score: 0.95}]
               end
             )

    assert printing.scryfall_id == "scryfall-printing-3"
    assert_in_delta evidence.scores.image_match, 0.8075, 0.0001
  end

  test "runtime image matcher accepts list shaped face image uris" do
    scryfall_id = "scryfall-printing-list-images"

    card =
      @black_lotus
      |> Map.put("id", scryfall_id)
      |> Map.delete("image_uris")
      |> Map.put("card_faces", [
        %{"image_uris" => %{"normal" => "https://example.test/#{scryfall_id}.jpg"}}
      ])

    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([card])

    previous_cache_dir = Application.get_env(:manavault, :scan_image_cache_dir)
    cache_dir = Path.join(System.tmp_dir!(), "manavault-runtime-image-cache-#{scryfall_id}")
    Application.put_env(:manavault, :scan_image_cache_dir, cache_dir)

    fixture_path =
      Path.expand(
        "../fixtures/ocr/scryfall_random/001-wickerbough-elder-9aef164a-af60-4c88-9f3b-b8d43abd3d85.jpg",
        __DIR__
      )

    File.mkdir_p!(cache_dir)
    File.cp!(fixture_path, Path.join(cache_dir, "#{scryfall_id}.jpg"))

    on_exit(fn ->
      if previous_cache_dir do
        Application.put_env(:manavault, :scan_image_cache_dir, previous_cache_dir)
      else
        Application.delete_env(:manavault, :scan_image_cache_dir)
      end

      File.rm_rf!(cache_dir)
    end)

    printing =
      Printing
      |> Repo.get!(scryfall_id)
      |> Repo.preload(:card)

    assert [%{scryfall_id: ^scryfall_id, score: score}] =
             RuntimeImageMatcher.match(fixture_path, [printing], crop: "full", threshold: 0.0)

    assert score == 1.0
  end

  test "scan recognition accepts confident title-crop OCR without full OCR" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parent = self()

    ocr_runner = fn "/tmp/black-lotus.jpg", opts ->
      send(parent, {:ocr_crop, Keyword.get(opts, :ocr_crop, :full)})
      {:ok, "Black Lotus\nR 0232 · EN"}
    end

    assert {:ok,
            %{
              candidates: [%{printing: printing} | _],
              timings: %{title_ocr_fast_path: true, full_ocr_us: nil}
            }} =
             ScanRecognition.recognize(%ScanItem{image_path: "/tmp/black-lotus.jpg"},
               ocr_runner: ocr_runner
             )

    assert printing.scryfall_id == "scryfall-printing-1"
    assert_received {:ocr_crop, :title}
    refute_received {:ocr_crop, :full}
  end

  test "scan recognition prefers exact title over longer card names containing it" do
    ba_sing_se = %{
      @time_walk
      | "id" => "ba-sing-se",
        "oracle_id" => "oracle-ba-sing-se",
        "name" => "Ba Sing Se",
        "type_line" => "Plane — Avatar",
        "oracle_text" => "When you planeswalk to Ba Sing Se, draw a card.",
        "set" => "tla",
        "collector_number" => "266",
        "lang" => "en"
    }

    walls = %{
      @time_walk
      | "id" => "walls-of-ba-sing-se",
        "oracle_id" => "oracle-walls-of-ba-sing-se",
        "name" => "The Walls of Ba Sing Se",
        "type_line" => "Enchantment",
        "oracle_text" => "Defender creatures you control get +0/+1.",
        "set" => "tla",
        "collector_number" => "329",
        "lang" => "en"
    }

    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([walls, ba_sing_se])

    parent = self()

    ocr_runner = fn "/tmp/ba-sing-se.jpg", opts ->
      send(parent, {:ocr_crop, Keyword.get(opts, :ocr_crop, :full)})
      {:ok, "Ba Sing Se\nAOIN\nAN"}
    end

    assert {:ok,
            %{
              candidates: [%{printing: printing} | candidates],
              timings: %{
                title_ocr_fast_path: true,
                title_ocr_fallback_reason: nil,
                full_ocr_us: nil
              }
            }} =
             ScanRecognition.recognize(%ScanItem{image_path: "/tmp/ba-sing-se.jpg"},
               ocr_runner: ocr_runner,
               full_ocr_fallback: false
             )

    assert printing.card.name == "Ba Sing Se"

    refute Enum.any?(
             candidates,
             &(&1.printing.card.name == "The Walls of Ba Sing Se" and &1.confidence == 1.0)
           )

    assert_received {:ocr_crop, :title}
    refute_received {:ocr_crop, :full}
  end

  test "scan recognition uses image evidence to disambiguate single-word token printings" do
    expected = %{
      @time_walk
      | "id" => "shape-expected",
        "oracle_id" => "oracle-shape-expected",
        "name" => "Shapeshifter",
        "type_line" => "Token Creature — Shapeshifter",
        "oracle_text" => "",
        "set" => "plst",
        "collector_number" => "T2XM-2",
        "lang" => "en"
    }

    wrong = %{
      @time_walk
      | "id" => "shape-wrong",
        "oracle_id" => "oracle-shape-wrong",
        "name" => "Shapeshifter",
        "type_line" => "Token Creature — Shapeshifter",
        "oracle_text" => "",
        "set" => "tmsc",
        "collector_number" => "2",
        "lang" => "en"
    }

    assert {:ok, %{cards_count: 2, printings_count: 2}} = Catalog.import_cards([wrong, expected])

    parent = self()

    ocr_runner = fn "/tmp/shapeshifter.jpg", opts ->
      send(parent, {:ocr_crop, Keyword.get(opts, :ocr_crop, :full)})
      {:ok, "SHAPESHIFTER\n1/1\n002/031T"}
    end

    image_matcher = fn "/tmp/shapeshifter.jpg" ->
      [%{scryfall_id: "shape-expected", score: 1.0}]
    end

    assert {:ok,
            %{
              candidates: [%{printing: printing} | _],
              timings: %{title_ocr_fast_path: true, full_ocr_us: nil}
            }} =
             ScanRecognition.recognize(%ScanItem{image_path: "/tmp/shapeshifter.jpg"},
               ocr_runner: ocr_runner,
               image_matcher: image_matcher
             )

    assert printing.scryfall_id == "shape-expected"
    assert_received {:ocr_crop, :title}
    refute_received {:ocr_crop, :full}
  end

  test "scan recognition can skip full OCR fallback when disabled" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parent = self()

    ocr_runner = fn "/tmp/time-walk.jpg", opts ->
      crop = Keyword.get(opts, :ocr_crop, :full)
      send(parent, {:ocr_crop, crop})

      case crop do
        :title -> {:ok, "not a card"}
        :full -> flunk("full OCR should not run when fallback is disabled")
      end
    end

    assert {:ok,
            %{
              candidates: [],
              timings: %{
                title_ocr_fast_path: true,
                title_ocr_fallback_reason: "weak_title_match",
                title_ocr_us: title_ocr_us,
                full_ocr_us: nil
              }
            }} =
             ScanRecognition.recognize(%ScanItem{image_path: "/tmp/time-walk.jpg"},
               ocr_runner: ocr_runner,
               full_ocr_fallback: false
             )

    assert is_integer(title_ocr_us)
    assert_received {:ocr_crop, :title}
    refute_received {:ocr_crop, :full}
  end

  test "scan recognition rejects single-word title matches without footer evidence" do
    chaos = %{
      "id" => "scryfall-chaos",
      "oracle_id" => "oracle-chaos",
      "name" => "Chaos",
      "type_line" => "Sorcery",
      "oracle_text" => "",
      "color_identity" => ["R"],
      "set" => "fj25",
      "set_name" => "Test Set",
      "collector_number" => "46",
      "lang" => "en",
      "finishes" => ["nonfoil"],
      "released_at" => "2026-01-01"
    }

    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([chaos])

    assert {:ok,
            %{
              candidates: [],
              timings: %{
                title_ocr_fast_path: true,
                title_ocr_fallback_reason: "weak_title_match",
                full_ocr_us: nil
              }
            }} =
             ScanRecognition.recognize(%ScanItem{image_path: "/tmp/gauntlets.jpg"},
               ocr_runner: fn _path, opts ->
                 assert Keyword.get(opts, :ocr_crop) == :title
                 {:ok, "Chaos"}
               end,
               full_ocr_fallback: false
             )
  end

  test "scan recognition falls back to full OCR when title-crop OCR is weak" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parent = self()

    ocr_runner = fn "/tmp/time-walk.jpg", opts ->
      crop = Keyword.get(opts, :ocr_crop, :full)
      send(parent, {:ocr_crop, crop})

      case crop do
        :title -> {:ok, "not a card"}
        :full -> {:ok, "Time Walk\nCollector: 84\nSet: LEA"}
      end
    end

    assert {:ok,
            %{
              candidates: [%{printing: printing} | _],
              timings: %{
                title_ocr_fast_path: false,
                title_ocr_fallback_reason: "weak_title_match",
                title_ocr_us: title_ocr_us,
                full_ocr_us: full_ocr_us
              }
            }} =
             ScanRecognition.recognize(%ScanItem{image_path: "/tmp/time-walk.jpg"},
               ocr_runner: ocr_runner,
               full_ocr_fallback: true
             )

    assert printing.scryfall_id == "scryfall-printing-2"
    assert is_integer(title_ocr_us)
    assert is_integer(full_ocr_us)
    assert_received {:ocr_crop, :title}
    assert_received {:ocr_crop, :full}
  end

  test "scan recognition falls back to full OCR when configured" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    previous = Application.get_env(:manavault, :scan_full_ocr_fallback)
    Application.put_env(:manavault, :scan_full_ocr_fallback, true)

    on_exit(fn ->
      if is_nil(previous) do
        Application.delete_env(:manavault, :scan_full_ocr_fallback)
      else
        Application.put_env(:manavault, :scan_full_ocr_fallback, previous)
      end
    end)

    parent = self()

    ocr_runner = fn "/tmp/time-walk.jpg", opts ->
      crop = Keyword.get(opts, :ocr_crop, :full)
      send(parent, {:ocr_crop, crop})

      case crop do
        :title -> {:ok, "not a card"}
        :full -> {:ok, "Time Walk\nCollector: 84\nSet: LEA"}
      end
    end

    assert {:ok, %{candidates: [%{printing: printing}], timings: timings}} =
             ScanRecognition.recognize(%ScanItem{image_path: "/tmp/time-walk.jpg"},
               ocr_runner: ocr_runner
             )

    assert printing.scryfall_id == "scryfall-printing-2"
    assert timings.title_ocr_fast_path == false
    assert timings.title_ocr_fallback_reason == "weak_title_match"
    assert is_integer(timings.full_ocr_us)
    assert_received {:ocr_crop, :title}
    assert_received {:ocr_crop, :full}
  end

  test "scan recognition falls back to image evidence when OCR fails" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, %{text: "", candidates: [%{printing: printing}], timings: timings}} =
             ScanRecognition.recognize(%ScanItem{image_path: "/tmp/time-walk.jpg"},
               ocr_runner: fn _path -> {:error, "OCR failed"} end,
               image_matches: [%{scryfall_id: "scryfall-printing-2", score: 0.93}]
             )

    assert printing.scryfall_id == "scryfall-printing-2"
    assert timings.ocr_us == nil
    assert timings.image_us >= 0
  end

  test "scan recognition ignores OCR diagnostic lines" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Diagnostic OCR batch"})

    assert {:ok, item} =
             Catalog.create_scan_item(scan_session, %{image_path: "/tmp/black-lotus.jpg"})

    ocr_runner = fn "/tmp/black-lotus.jpg" ->
      {:ok, "Estimating resolution as 231\nBlack Lotus\nSet: LEA\nCollector #232"}
    end

    assert {:ok, recognized_item} = Catalog.recognize_scan_item(item, ocr_runner: ocr_runner)

    assert recognized_item.accepted_printing_id == "scryfall-printing-1"

    refute ScanRecognition.parse_text("Estimating resolution as 231\nBlack Lotus")
           |> Map.fetch!(:tokens)
           |> Enum.member?("estimating")
  end

  test "scan recognition does not treat OCR diagnostics as card text" do
    parsed = ScanRecognition.parse_text("Estimating resolution as 231")

    assert parsed.text == ""
    assert parsed.tokens == []
    assert ScanRecognition.match_candidates(parsed) == []
  end

  test "scan recognition falls back to card names embedded in rules text" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parsed =
      ScanRecognition.parse_text(
        "{T}, Sacrifice Black Lotus: Add three mana of any one color.\nSet: LEA\nCollector #232"
      )

    assert Enum.any?(parsed.tokens, &(&1 == "black"))
    assert Enum.any?(parsed.tokens, &(&1 == "lotus"))
    assert length(parsed.lines) > 0

    assert [%{printing: printing, confidence: confidence, evidence: evidence}] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert confidence > 0.0

    # Phrase matching: the card name is embedded in the oracle text line
    assert length(evidence.phrase_hits) > 0
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name))
  end

  test "scan recognition ignores copyright footer lines" do
    parsed = ScanRecognition.parse_text("r 0228 ™ & © 2022 Wizards of the Coast")

    assert parsed.text == ""
    assert parsed.tokens == []
    assert ScanRecognition.match_candidates(parsed) == []
  end

  test "scan recognition ignores artist credit footer lines" do
    parsed = ScanRecognition.parse_text("30a + EN % Christopher Rush")

    assert parsed.text == ""
    assert parsed.tokens == []
    assert ScanRecognition.match_candidates(parsed) == []
  end

  test "scan recognition tokenizes and matches card text regardless of field position" do
    parsed = ScanRecognition.parse_text("Black Lotus\n30a + EN % Christopher Rush")

    assert parsed.text =~ "Black Lotus"
    assert Enum.any?(parsed.tokens, &(&1 == "black"))
    assert Enum.any?(parsed.tokens, &(&1 == "lotus"))
    assert parsed.lines == ["Black Lotus"]
  end

  test "scan recognition parses modern set and language footer lines" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@talisman_impulse_tdc, @talisman_impulse_who])

    parsed =
      ScanRecognition.parse_text("""
      Talisman of Impulse
      Artifact
      :Add
      :Add  or .This artifact deals 1
      damage to you.
      &o2025Wizardsof the Coasr
      U0332
      TDC·EN MIKE DRINGENBERG
      """)

    assert [%{printing: printing, evidence: evidence} | _] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "talisman-tdc-332"
    assert_in_delta evidence.scores.set_code, 0.2, 0.0001
    assert_in_delta evidence.scores.collector_number, 0.25, 0.0001
    assert_in_delta evidence.scores.language, 0.05, 0.0001
  end

  test "scan recognition falls back to oracle text when name does not parse" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parsed = ScanRecognition.parse_text("mana of any one color.")

    assert Enum.any?(parsed.tokens, &(&1 == "mana"))

    assert [%{printing: printing, confidence: confidence, evidence: evidence}] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert confidence > 0.0

    # Phrase match: the oracle text fragment should match oracle_text field
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :oracle_text))
  end

  test "scan recognition phrase matching boosts confidence for multi-word matches" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    # OCR with only common single words (no coherent phrases) — low confidence
    parsed_loose = ScanRecognition.parse_text("sacrifice artifact add mana one color")

    case ScanRecognition.match_candidates(parsed_loose) do
      [] ->
        # No candidate found at all with just common words — pass
        :ok

      [%{confidence: loose_conf}] ->
        # If found, confidence should stay below exact-title matches.
        assert loose_conf < 0.6
    end

    # OCR with the actual card name phrase — much higher confidence
    parsed_name = ScanRecognition.parse_text("Black Lotus")

    assert [%{printing: printing, confidence: name_conf, evidence: evidence}] =
             ScanRecognition.match_candidates(parsed_name)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert name_conf > 0.5

    # Phrase hit: "Black Lotus" line matches name
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name))
  end

  test "recognize_scan_item stores top OCR match on scan item without candidate row writes" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Recognition batch"})

    assert {:ok, item} =
             Catalog.create_scan_item(scan_session, %{image_path: "/tmp/black-lotus.jpg"})

    ocr_runner = fn "/tmp/black-lotus.jpg" ->
      {:ok, "Black Lotus\nSet: LEA\nCollector #232\nLanguage: en"}
    end

    assert {:ok, recognized_item} = Catalog.recognize_scan_item(item, ocr_runner: ocr_runner)

    assert recognized_item.status == "recognized"
    assert recognized_item.accepted_printing_id == "scryfall-printing-1"
    assert recognized_item.accepted_printing.card.name == "Black Lotus"
  end

  test "recognize_scan_item marks failed OCR as needing review with evidence" do
    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Failed recognition"})
    assert {:ok, item} = Catalog.create_scan_item(scan_session, %{image_path: "/tmp/missing.jpg"})

    assert {:error, "RapidOCR missing", review_item} =
             Catalog.recognize_scan_item(item,
               ocr_runner: fn _path -> {:error, "RapidOCR missing"} end
             )

    assert review_item.status == "needs_review"
    assert review_item.accepted_printing_id == nil
  end

  test "scan recognition parses OCR text and matches candidates without OCR runner" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parsed = ScanRecognition.parse_text("Time Walk\nCollector: 84\nSet: LEA\nLanguage: ja")

    assert Enum.any?(parsed.tokens, &(&1 == "time"))
    assert Enum.any?(parsed.tokens, &(&1 == "walk"))
    assert parsed.collector_number == "84"
    assert parsed.set_code == "LEA"
    assert parsed.language == "ja"

    assert [%{printing: printing, confidence: confidence, evidence: evidence}] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-2"
    assert confidence > 0.0

    # Phrase match: "Time Walk" line should match the card name
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name))
  end

  test "scan recognition matches compacted RapidOCR title without spaces" do
    assert {:ok, %{cards_count: 3, printings_count: 3}} =
             Catalog.import_cards([
               @black_lotus,
               %{
                 @black_lotus
                 | "id" => "fellwar-stone-printing",
                   "oracle_id" => "fellwar-stone-oracle",
                   "name" => "Fellwar Stone",
                   "type_line" => "Artifact",
                   "oracle_text" => "Add one mana of any color.",
                   "collector_number" => "228"
               },
               %{
                 @black_lotus
                 | "id" => "arcane-signet-printing",
                   "oracle_id" => "arcane-signet-oracle",
                   "name" => "Arcane Signet",
                   "type_line" => "Artifact",
                   "oracle_text" => "Add one mana of any color.",
                   "collector_number" => "228"
               }
             ])

    parsed =
      ScanRecognition.parse_text("""
      BlackLotus
      Artifact
      EDITION
      30TH
      ,SacrificeBlackLotus:Add three
      mana ofany one color.
      3OA·ENCHRISTOPHERRUSH
      R0228
      &2022Wzs of the Coast
      """)

    assert [%{printing: printing, confidence: confidence, evidence: evidence} | _] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert confidence >= 0.9
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name and &1.line == "BlackLotus"))
  end

  test "scan recognition keeps exact title and type-line matches ahead of broad token limit" do
    distractors =
      for index <- 1..600 do
        %{
          @black_lotus
          | "id" => "artifact-distractor-#{index}",
            "oracle_id" => "artifact-distractor-oracle-#{index}",
            "name" => "Artifact Distractor #{index}",
            "type_line" => "Artifact",
            "oracle_text" => "Add mana.",
            "collector_number" => "#{index}"
        }
      end

    black_lotus_30a = %{@black_lotus | "collector_number" => "228", "set" => "30a"}

    assert {:ok, %{cards_count: 601, printings_count: 601}} =
             Catalog.import_cards([black_lotus_30a | distractors])

    parsed =
      ScanRecognition.parse_text("""
      Black Lotus
      Artifact
      30T
      EDITION
      ,Sacrifice Black Lotus:Add three
      mana ofany onecolor.
      R0228
      &2022
      """)

    assert [%{printing: printing, confidence: confidence, evidence: evidence} | _] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert confidence >= 0.9
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name and &1.line == "Black Lotus"))
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :type_line and &1.line == "Artifact"))
  end

  test "scan recognition ranks exact OCR name line above weak token-overlap candidates" do
    lotus_ring = %{
      @black_lotus
      | "id" => "lotus-ring-printing",
        "oracle_id" => "lotus-ring-oracle",
        "name" => "Lotus Ring",
        "oracle_text" => "Whenever one or more creatures attack, draw a card.",
        "collector_number" => "240"
    }

    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, lotus_ring])

    parsed =
      ScanRecognition.parse_text("""
      Black Lotus
      Artifact
      EDMON
      Sacrifice Black Lotus: Add three
      mana of any one color:
      301h
      """)

    assert [%{printing: printing, evidence: evidence} | _] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert evidence.scores.phrase_match >= 0.55
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name and &1.line == "Black Lotus"))
  end

  test "scan recognition includes exact name lines outside first broad token window" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])

    parsed =
      ScanRecognition.parse_text("""
      one two three four five six seven eight
      Black Lotus
      """)

    assert parsed.tokens == [
             "one",
             "two",
             "three",
             "four",
             "five",
             "six",
             "seven",
             "eight",
             "black",
             "lotus"
           ]

    assert [%{printing: printing, evidence: evidence}] = ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name and &1.line == "Black Lotus"))
  end

  test "scan recognition does not boost blank card text as phrase match" do
    blank_text_card = %{
      @black_lotus
      | "id" => "blank-text-printing",
        "oracle_id" => "blank-text-oracle",
        "name" => "Gilded Sentinel",
        "type_line" => nil,
        "oracle_text" => nil,
        "collector_number" => "239"
    }

    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, blank_text_card])

    parsed =
      ScanRecognition.parse_text("""
      Black Lotus
      Artifact
      Sacrifice Black Lotus: Add three
      mana
      of any one color:
      """)

    assert [%{printing: printing, evidence: evidence} | _] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :type_line and &1.line == "Artifact"))
  end

  test "scan recognition handles integer scoring values without crashing debug logging" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    parsed = ScanRecognition.parse_text("Black")

    assert [%{confidence: confidence, evidence: %{scores: scores}}] =
             ScanRecognition.match_candidates(parsed)

    assert is_float(confidence)
    assert is_integer(scores.phrase_match)
  end

  test "scan recognition does not treat single-word names in non-title text as title evidence" do
    cat = %{
      @black_lotus
      | "id" => "cat-printing",
        "oracle_id" => "cat-oracle",
        "name" => "Cat",
        "type_line" => "Creature — Cat",
        "oracle_text" => "Vigilance.",
        "collector_number" => "241"
    }

    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, cat])

    parsed =
      ScanRecognition.parse_text("""
      Black Lotus
      Artifact
      Create a 1/1 white Cat creature token.
      Sacrifice Black Lotus: Add three mana of any one color.
      """)

    assert [lotus, cat_candidate | _] = ScanRecognition.match_candidates(parsed)

    assert lotus.printing.scryfall_id == "scryfall-printing-1"
    assert cat_candidate.printing.scryfall_id == "cat-printing"
    refute Enum.any?(cat_candidate.evidence.phrase_hits, &(&1.field == :name))
  end

  test "scan recognition tie-breaks confidence ties toward exact title and type evidence" do
    exact_card = %{
      @black_lotus
      | "id" => "zz-exact-printing",
        "oracle_id" => "zz-exact-oracle",
        "name" => "Alpha Beta",
        "type_line" => "Creature — Cat",
        "oracle_text" => "Alpha beta gamma delta epsilon zeta eta theta.",
        "collector_number" => "242"
    }

    broad_card = %{
      @black_lotus
      | "id" => "aa-broad-printing",
        "oracle_id" => "aa-broad-oracle",
        "name" => "Gamma Delta",
        "type_line" => "Instant",
        "oracle_text" => "Alpha Beta Creature Cat gamma delta epsilon zeta eta theta.",
        "collector_number" => "243"
    }

    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([broad_card, exact_card])

    parsed =
      ScanRecognition.parse_text("""
      Alpha Beta
      Creature — Cat
      gamma delta epsilon zeta eta theta
      """)

    assert [%{printing: printing, confidence: 1.0, evidence: evidence}, %{confidence: 1.0} | _] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "zz-exact-printing"
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name and &1.line == "Alpha Beta"))

    assert Enum.any?(
             evidence.phrase_hits,
             &(&1.field == :type_line and &1.line == "Creature — Cat")
           )
  end

  test "scan recognition handles RapidOCR output with card name, oracle text, and footer" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    # Simulate RapidOCR output: card name as first line, type line, oracle text, footer
    parsed =
      ScanRecognition.parse_text("""
      Black Lotus
      Artifact
      301h
      EDITION
      Sacrifice Black Lotus: Add three
      mana of any one color:
      R 0228
      Ta02022uuad othc Cout
      J0a * EN
      ~CHRISTOPHtr Rush
      """)

    # Card name tokens are present
    assert Enum.any?(parsed.tokens, &(&1 == "black"))
    assert Enum.any?(parsed.tokens, &(&1 == "lotus"))

    # "Black Lotus" is a clean line for phrase matching
    assert Enum.any?(parsed.lines, &String.contains?(&1, "Black Lotus"))

    # Footer garbage and artist credit lines are present in tokens
    # but are harmless — they don't match any card field, just proportionally
    # drag down scores for all candidates equally.
    assert length(parsed.tokens) > 8

    # Collector number extracted from footer
    assert parsed.collector_number == "0228"

    # Black Lotus is the top match with high confidence
    assert [%{printing: printing, confidence: confidence, evidence: evidence}] =
             ScanRecognition.match_candidates(parsed)

    assert printing.scryfall_id == "scryfall-printing-1"
    assert confidence > 0.7

    # Phrase match: "Black Lotus" line hits the card name
    assert Enum.any?(evidence.phrase_hits, &(&1.field == :name))
  end

  test "accept_scan_item creates collection inventory from stored printing and marks item accepted" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, binder} = Catalog.create_location(%{name: "Review Binder", kind: "binder"})
    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Review accept"})

    assert {:ok, item} =
             Catalog.create_scan_item(scan_session, %{
               status: "recognized",
               accepted_printing_id: "scryfall-printing-1",
               quantity: 3,
               condition: "lightly_played",
               language: "en",
               finish: "nonfoil",
               location_id: binder.id
             })

    assert {:ok, %{scan_item: accepted_item, collection_item: collection_item}} =
             Catalog.accept_scan_item(item.id)

    assert accepted_item.status == "accepted"
    assert accepted_item.accepted_printing_id == "scryfall-printing-1"
    assert collection_item.scryfall_id == "scryfall-printing-1"
    assert collection_item.quantity == 3
    assert collection_item.condition == "lightly_played"
    assert collection_item.location_id == binder.id

    assert {:error, :already_accepted} = Catalog.accept_scan_item(item.id)
  end

  test "undo_scan_item_accept reverts accepted item and removes matching collection row" do
    assert {:ok, %{cards_count: 1, printings_count: 1}} = Catalog.import_cards([@black_lotus])
    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Undo accept"})

    assert {:ok, item} =
             Catalog.create_scan_item(scan_session, %{
               status: "recognized",
               accepted_printing_id: "scryfall-printing-1"
             })

    assert {:ok, %{scan_item: accepted_item}} = Catalog.accept_scan_item(item.id)
    assert accepted_item.status == "accepted"
    assert [_collection_item] = Catalog.list_collection_items()

    assert {:ok, reverted_item} = Catalog.undo_scan_item_accept(item.id)

    assert reverted_item.status == "recognized"
    assert reverted_item.accepted_printing_id == "scryfall-printing-1"
    assert [] = Catalog.list_collection_items()

    assert {:error, :not_accepted} = Catalog.undo_scan_item_accept(item.id)
  end

  test "refine_scan_item_printing_with_image switches recognized item to image matched printing" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @black_lotus_beta])

    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Image refinement"})

    assert {:ok, item} =
             Catalog.create_scan_item(scan_session, %{
               status: "recognized",
               image_path: "/tmp/black-lotus.jpg",
               accepted_printing_id: "scryfall-printing-1"
             })

    parent = self()

    image_matcher = fn "/tmp/black-lotus.jpg", printings, opts ->
      send(parent, {:image_refinement, Enum.map(printings, & &1.scryfall_id), opts})
      [%{scryfall_id: "scryfall-printing-3", score: 0.96}]
    end

    assert {:ok, refined_item} =
             Catalog.refine_scan_item_printing_with_image(item.id,
               image_matcher: image_matcher,
               image_refinement_limit: 7
             )

    assert refined_item.status == "recognized"
    assert refined_item.accepted_printing_id == "scryfall-printing-3"
    assert Catalog.get_scan_item!(item.id).accepted_printing_id == "scryfall-printing-3"

    assert_received {:image_refinement, printing_ids, opts}
    assert MapSet.new(printing_ids) == MapSet.new(["scryfall-printing-1", "scryfall-printing-3"])
    assert Keyword.get(opts, :limit) == 7
    assert Keyword.get(opts, :threshold) == 0.82
  end

  test "refine_scan_item_printing_with_image does not change accepted items" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @black_lotus_beta])

    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Accepted refinement"})

    assert {:ok, item} =
             Catalog.create_scan_item(scan_session, %{
               status: "accepted",
               image_path: "/tmp/black-lotus.jpg",
               accepted_printing_id: "scryfall-printing-1"
             })

    image_matcher = fn _image_path, _printings, _opts ->
      flunk("accepted scan items should not be refined")
    end

    assert {:ok, unchanged_item} =
             Catalog.refine_scan_item_printing_with_image(item.id, image_matcher: image_matcher)

    assert unchanged_item.status == "accepted"
    assert unchanged_item.accepted_printing_id == "scryfall-printing-1"
  end

  test "set_scan_item_printing stores manual exact printing and can accept it" do
    assert {:ok, %{cards_count: 2, printings_count: 2}} =
             Catalog.import_cards([@black_lotus, @time_walk])

    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Manual correction"})

    assert {:ok, item} =
             Catalog.create_scan_item(scan_session, %{
               status: "needs_review",
               finish: "foil",
               language: "ja"
             })

    assert {:ok, corrected_item} = Catalog.set_scan_item_printing(item.id, "scryfall-printing-2")

    assert corrected_item.status == "recognized"
    assert corrected_item.accepted_printing_id == "scryfall-printing-2"

    assert {:ok, %{scan_item: accepted_item, collection_item: collection_item}} =
             Catalog.accept_scan_item(item.id)

    assert accepted_item.status == "accepted"
    assert collection_item.scryfall_id == "scryfall-printing-2"
  end

  test "update_scan_item_review and reject_scan_item support review corrections" do
    assert {:ok, scan_session} = Catalog.create_scan_session(%{"name" => "Review fields"})
    assert {:ok, binder} = Catalog.create_location(%{name: "Reject Binder", kind: "binder"})
    assert {:ok, item} = Catalog.create_scan_item(scan_session, %{status: "needs_review"})

    assert {:ok, updated_item} =
             item
             |> Catalog.update_scan_item_review(%{
               "quantity" => "2",
               "condition" => "moderately_played",
               "language" => "ja",
               "finish" => "foil",
               "location_id" => "#{binder.id}"
             })

    assert updated_item.quantity == 2
    assert updated_item.condition == "moderately_played"
    assert updated_item.language == "ja"
    assert updated_item.finish == "foil"
    assert updated_item.location_id == binder.id

    assert {:ok, rejected_item} = Catalog.reject_scan_item(updated_item.id)
    assert rejected_item.status == "rejected"
    assert [] = Catalog.list_collection_items()
  end

  test "scan session validations reject invalid defaults and candidates" do
    assert {:error, changeset} =
             Catalog.create_scan_session(%{
               "name" => "Bad scan",
               "default_condition" => "creased",
               "default_finish" => "gold"
             })

    assert "is invalid" in errors_on(changeset).default_condition
    assert "is invalid" in errors_on(changeset).default_finish
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
