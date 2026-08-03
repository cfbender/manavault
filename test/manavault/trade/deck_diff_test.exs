defmodule Manavault.Trade.DeckDiffTest do
  use Manavault.DataCase
  use Manavault.CatalogTestFixtures

  alias Manavault.Catalog
  alias Manavault.Trade.DeckDiff

  defp card(oracle_id, name) do
    %{
      "id" => "scryfall-#{oracle_id}",
      "oracle_id" => oracle_id,
      "name" => name,
      "type_line" => "Instant",
      "color_identity" => [],
      "set" => "tst",
      "set_name" => "Test Set",
      "collector_number" => oracle_id,
      "lang" => "en",
      "image_uris" => %{"normal" => "https://example.test/#{oracle_id}.jpg"}
    }
  end

  defp entry(name, oracle_id, opts) do
    %{
      name: name,
      quantity: Keyword.get(opts, :quantity, 1),
      zone: Keyword.get(opts, :zone, "mainboard"),
      set_code: nil,
      collector_number: nil,
      oracle_id: oracle_id
    }
  end

  defp basic_card(oracle_id, name) do
    %{
      "id" => "scryfall-#{oracle_id}",
      "oracle_id" => oracle_id,
      "name" => name,
      "type_line" => "Basic Land — #{name}",
      "color_identity" => [],
      "set" => "tst",
      "set_name" => "Test Set",
      "collector_number" => oracle_id,
      "lang" => "en",
      "image_uris" => %{"normal" => "https://example.test/#{oracle_id}.jpg"}
    }
  end

  setup do
    assert {:ok, _} =
             Catalog.import_cards([
               card("oracle-sol-ring", "Sol Ring"),
               card("oracle-lotus", "Black Lotus"),
               card("oracle-walk", "Time Walk"),
               card("oracle-bolt", "Lightning Bolt")
             ])

    {:ok, deck} = Catalog.create_deck(%{"name" => "Test Deck"})
    add_deck_card!(deck, "Sol Ring", 1, "mainboard")
    add_deck_card!(deck, "Black Lotus", 1, "mainboard")
    add_deck_card!(deck, "Time Walk", 1, "maybeboard")

    %{deck: deck}
  end

  test "adds cards that are only in the external list", %{deck: deck} do
    entries = [entry("Lightning Bolt", "oracle-bolt", quantity: 2)]

    assert {:ok, result} =
             DeckDiff.diff(deck.id, "Their List", %{entries: entries, unrecognized: []})

    assert result.source_name == "Their List"
    assert result.unrecognized == []
    assert result.changes == []
    assert Enum.map(result.cuts, & &1.card_name) |> Enum.sort() == ["Black Lotus", "Sol Ring"]
    assert [add] = result.adds
    assert add.card_name == "Lightning Bolt"
    assert add.oracle_id == "oracle-bolt"
    assert add.quantity == 2
    assert add.image_url == "https://example.test/oracle-bolt.jpg"
  end

  test "adds a name-only entry (unresolved oracle) with a nil image and oracle id", %{deck: deck} do
    entries = [
      %{
        name: "Some Unknown Card",
        quantity: 3,
        zone: "mainboard",
        set_code: nil,
        collector_number: nil,
        oracle_id: nil
      }
    ]

    assert {:ok, result} =
             DeckDiff.diff(deck.id, nil, %{entries: entries, unrecognized: ["Some Unknown Card"]})

    assert result.unrecognized == ["Some Unknown Card"]
    assert [add] = result.adds
    assert add.card_name == "Some Unknown Card"
    assert add.quantity == 3
    assert add.oracle_id == nil
    assert add.image_url == nil
  end

  test "cuts cards that are only in the deck", %{deck: deck} do
    assert {:ok, result} = DeckDiff.diff(deck.id, nil, %{entries: [], unrecognized: []})

    assert result.adds == []
    assert Enum.map(result.cuts, & &1.card_name) |> Enum.sort() == ["Black Lotus", "Sol Ring"]
    assert Enum.all?(result.cuts, & &1.image_url)
  end

  test "reports quantity changes for cards present on both sides", %{deck: deck} do
    entries = [entry("Sol Ring", "oracle-sol-ring", quantity: 4)]

    assert {:ok, result} = DeckDiff.diff(deck.id, nil, %{entries: entries, unrecognized: []})

    assert [change] = result.changes
    assert change.card_name == "Sol Ring"
    assert change.from_quantity == 1
    assert change.to_quantity == 4
    assert change.oracle_id == "oracle-sol-ring"
    assert Enum.map(result.cuts, & &1.card_name) == ["Black Lotus"]
  end

  test "reports no change when quantities already match", %{deck: deck} do
    entries = [entry("Sol Ring", "oracle-sol-ring", quantity: 1)]

    assert {:ok, result} = DeckDiff.diff(deck.id, nil, %{entries: entries, unrecognized: []})

    assert result.changes == []
  end

  test "excludes the maybeboard from both sides", %{deck: deck} do
    entries = [entry("Time Walk", "oracle-walk", quantity: 1, zone: "maybeboard")]

    assert {:ok, result} = DeckDiff.diff(deck.id, nil, %{entries: entries, unrecognized: []})

    refute Enum.any?(result.cuts, &(&1.card_name == "Time Walk"))
    refute Enum.any?(result.adds, &(&1.card_name == "Time Walk"))
    assert result.changes == []
  end

  test "cancels equal basic land counts even when the entry resolves to a different oracle_id",
       %{deck: deck} do
    assert {:ok, _} = Catalog.import_cards([basic_card("oracle-plains-a", "Plains")])
    assert %{oracle_id: "oracle-plains-a"} = add_deck_card!(deck, "Plains", 4, "mainboard")

    assert {:ok, _} = Catalog.import_cards([basic_card("oracle-plains-b", "Plains")])
    entries = [entry("Plains", "oracle-plains-b", quantity: 4)]

    assert {:ok, result} = DeckDiff.diff(deck.id, nil, %{entries: entries, unrecognized: []})

    refute Enum.any?(result.adds, &(&1.card_name == "Plains"))
    refute Enum.any?(result.cuts, &(&1.card_name == "Plains"))
    refute Enum.any?(result.changes, &(&1.card_name == "Plains"))
  end

  test "differing basic land counts emit a single change row instead of a paired add and cut",
       %{deck: deck} do
    assert {:ok, _} = Catalog.import_cards([basic_card("oracle-plains-a", "Plains")])
    add_deck_card!(deck, "Plains", 4, "mainboard")

    assert {:ok, _} = Catalog.import_cards([basic_card("oracle-plains-b", "Plains")])
    entries = [entry("Plains", "oracle-plains-b", quantity: 7)]

    assert {:ok, result} = DeckDiff.diff(deck.id, nil, %{entries: entries, unrecognized: []})

    assert [change] = Enum.filter(result.changes, &(&1.card_name == "Plains"))
    assert change.from_quantity == 4
    assert change.to_quantity == 7
    refute Enum.any?(result.adds, &(&1.card_name == "Plains"))
    refute Enum.any?(result.cuts, &(&1.card_name == "Plains"))
  end

  test "one-sided basic lands still surface as adds or cuts", %{deck: deck} do
    assert {:ok, _} =
             Catalog.import_cards([
               basic_card("oracle-forest", "Forest"),
               basic_card("oracle-island", "Island")
             ])

    add_deck_card!(deck, "Island", 2, "mainboard")
    entries = [entry("Forest", "oracle-forest", quantity: 3)]

    assert {:ok, result} = DeckDiff.diff(deck.id, nil, %{entries: entries, unrecognized: []})

    assert [add] = Enum.filter(result.adds, &(&1.card_name == "Forest"))
    assert add.quantity == 3

    assert [cut] = Enum.filter(result.cuts, &(&1.card_name == "Island"))
    assert cut.quantity == 2
  end

  test "snow-covered basics remain distinct from their regular counterpart", %{deck: deck} do
    assert {:ok, _} = Catalog.import_cards([basic_card("oracle-plains-a", "Plains")])
    add_deck_card!(deck, "Plains", 2, "mainboard")

    entries = [
      entry("Plains", "oracle-plains-a", quantity: 2),
      %{
        name: "Snow-Covered Plains",
        quantity: 1,
        zone: "mainboard",
        set_code: nil,
        collector_number: nil,
        oracle_id: nil
      }
    ]

    assert {:ok, result} =
             DeckDiff.diff(deck.id, nil, %{
               entries: entries,
               unrecognized: ["Snow-Covered Plains"]
             })

    refute Enum.any?(result.adds ++ result.cuts ++ result.changes, &(&1.card_name == "Plains"))
    assert [add] = Enum.filter(result.adds, &(&1.card_name == "Snow-Covered Plains"))
    assert add.quantity == 1
    assert add.oracle_id == nil
    assert add.image_url == nil
  end

  test "basic land handling doesn't affect non-basic add/cut/change classification", %{
    deck: deck
  } do
    assert {:ok, _} = Catalog.import_cards([basic_card("oracle-plains-a", "Plains")])
    add_deck_card!(deck, "Plains", 3, "mainboard")

    entries = [
      entry("Plains", "oracle-plains-a", quantity: 3),
      entry("Sol Ring", "oracle-sol-ring", quantity: 2),
      entry("Lightning Bolt", "oracle-bolt", quantity: 1)
    ]

    assert {:ok, result} =
             DeckDiff.diff(deck.id, "Their List", %{entries: entries, unrecognized: []})

    refute Enum.any?(result.adds ++ result.cuts ++ result.changes, &(&1.card_name == "Plains"))

    assert [change] = Enum.filter(result.changes, &(&1.card_name == "Sol Ring"))
    assert change.from_quantity == 1
    assert change.to_quantity == 2

    assert [add] = Enum.filter(result.adds, &(&1.card_name == "Lightning Bolt"))
    assert add.quantity == 1

    assert Enum.map(result.cuts, & &1.card_name) == ["Black Lotus"]
  end

  test "returns a friendly error for a deck that doesn't exist" do
    assert {:error, message} = DeckDiff.diff(-1, nil, %{entries: [], unrecognized: []})
    assert message =~ "couldn't be found"
  end
end
