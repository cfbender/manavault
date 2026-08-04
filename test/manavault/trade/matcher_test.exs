defmodule Manavault.Trade.MatcherTest do
  use Manavault.DataCase

  alias Manavault.Catalog
  alias Manavault.Trade
  alias Manavault.Trade.Matcher

  defp card(oracle_id, name) do
    %{
      "id" => "scryfall-#{oracle_id}",
      "oracle_id" => oracle_id,
      "name" => name,
      "finishes" => ["nonfoil"],
      "type_line" => "Instant",
      "color_identity" => [],
      "set" => "tst",
      "set_name" => "Test Set",
      "collector_number" => oracle_id,
      "lang" => "en"
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

  setup do
    assert {:ok, _} =
             Catalog.import_cards([
               card("oracle-sol-ring", "Sol Ring"),
               card("oracle-lotus", "Black Lotus"),
               card("oracle-walk", "Time Walk")
             ])

    :ok
  end

  test "matches for-trade collection items by oracle id, grouped and quantity-summed" do
    {:ok, item1} =
      Catalog.create_collection_item(%{
        "scryfall_id" => "scryfall-oracle-sol-ring",
        "quantity" => 4,
        "for_trade_quantity" => 2
      })

    {:ok, item2} = Catalog.create_collection_item(%{"scryfall_id" => "scryfall-oracle-sol-ring"})
    {:ok, item2} = Catalog.update_collection_item(item2, %{"for_trade" => true})

    # Not for trade: must not appear even though it's the same card.
    assert {:ok, _not_for_trade} =
             Catalog.create_collection_item(%{"scryfall_id" => "scryfall-oracle-sol-ring"})

    # For trade, but for a card that isn't in their list: must not appear.
    {:ok, other} = Catalog.create_collection_item(%{"scryfall_id" => "scryfall-oracle-walk"})
    assert {:ok, _other} = Catalog.update_collection_item(other, %{"for_trade" => true})

    entries = [
      entry("Sol Ring", "oracle-sol-ring", quantity: 2),
      entry("Sol Ring", "oracle-sol-ring", quantity: 1)
    ]

    result = Matcher.match("Their List", %{entries: entries, unrecognized: []})

    assert result.source_name == "Their List"
    assert result.entry_count == 2
    assert result.unrecognized == []
    assert result.want_matches == []
    assert [binder_match] = result.binder_matches
    assert binder_match.card_name == "Sol Ring"
    assert binder_match.oracle_id == "oracle-sol-ring"
    assert binder_match.their_quantity == 3
    assert Enum.map(binder_match.items, & &1.id) |> Enum.sort() == Enum.sort([item1.id, item2.id])
    assert Enum.map(binder_match.items, & &1.quantity) |> Enum.sort() == [1, 2]
  end

  test "matches outstanding wants by oracle id" do
    assert {:ok, _want} = Trade.create_want_by_name("Black Lotus", 2)

    entries = [entry("Black Lotus", "oracle-lotus", quantity: 5)]

    result = Matcher.match(nil, %{entries: entries, unrecognized: []})

    assert result.binder_matches == []
    assert [want_match] = result.want_matches
    assert want_match.card_name == "Black Lotus"
    assert want_match.oracle_id == "oracle-lotus"
    assert want_match.their_quantity == 5
    assert want_match.want.quantity == 2
  end

  test "ignores entries that never resolved to an oracle id, but still counts and reports them" do
    entries = [
      %{
        name: "Fake Card",
        quantity: 1,
        zone: "mainboard",
        set_code: nil,
        collector_number: nil,
        oracle_id: nil
      }
    ]

    result = Matcher.match(nil, %{entries: entries, unrecognized: ["Fake Card"]})

    assert result.entry_count == 1
    assert result.unrecognized == ["Fake Card"]
    assert result.binder_matches == []
    assert result.want_matches == []
  end

  test "excludes for-trade items stored in list-kind locations" do
    {:ok, wishlist} = Catalog.create_location(%{name: "Wishlist", kind: "list"})

    {:ok, listed} =
      Catalog.create_collection_item(%{
        "scryfall_id" => "scryfall-oracle-sol-ring",
        "location_id" => wishlist.id
      })

    {:ok, _listed} = Catalog.update_collection_item(listed, %{"for_trade" => true})

    entries = [entry("Sol Ring", "oracle-sol-ring", quantity: 1)]

    result = Matcher.match(nil, %{entries: entries, unrecognized: []})

    assert result.binder_matches == []
  end
end
