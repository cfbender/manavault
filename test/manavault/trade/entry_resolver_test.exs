defmodule Manavault.Trade.EntryResolverTest do
  use Manavault.DataCase

  alias Manavault.Catalog
  alias Manavault.Trade.EntryResolver

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
      "lang" => "en"
    }
  end

  defp entry(name, opts \\ []) do
    %{
      name: name,
      quantity: Keyword.get(opts, :quantity, 1),
      zone: Keyword.get(opts, :zone, "mainboard"),
      set_code: nil,
      collector_number: nil
    }
  end

  test "resolves an exact, normalized name match" do
    assert {:ok, _} = Catalog.import_cards([card("oracle-sol-ring", "Sol Ring")])

    assert {:ok, %{entries: [resolved], unrecognized: []}} =
             EntryResolver.resolve([entry("sol ring")])

    assert resolved.oracle_id == "oracle-sol-ring"
  end

  test "resolves names with or without diacritics" do
    assert {:ok, _} = Catalog.import_cards([card("oracle-oin-the-brave", "Óin the Brave")])

    assert {:ok, %{entries: entries, unrecognized: []}} =
             EntryResolver.resolve([entry("Óin the Brave"), entry("Oin the brave")])

    assert Enum.map(entries, & &1.oracle_id) ==
             ["oracle-oin-the-brave", "oracle-oin-the-brave"]
  end

  test "falls back to the front face when the full split name isn't in the catalog" do
    assert {:ok, _} = Catalog.import_cards([card("oracle-fire", "Fire")])

    assert {:ok, %{entries: [resolved], unrecognized: []}} =
             EntryResolver.resolve([entry("Fire // Ice")])

    assert resolved.oracle_id == "oracle-fire"
  end

  test "prefers an exact full-name match over the front-face fallback" do
    assert {:ok, _} =
             Catalog.import_cards([
               card("oracle-fire", "Fire"),
               card("oracle-fire-ice", "Fire // Ice")
             ])

    assert {:ok, %{entries: [resolved], unrecognized: []}} =
             EntryResolver.resolve([entry("Fire // Ice")])

    assert resolved.oracle_id == "oracle-fire-ice"
  end

  test "records unresolved names, deduped, and leaves their oracle_id nil" do
    entries = [entry("Not A Real Card"), entry("Not A Real Card"), entry("Also Fake")]

    assert {:ok, %{entries: resolved, unrecognized: unrecognized}} =
             EntryResolver.resolve(entries)

    assert Enum.all?(resolved, &is_nil(&1.oracle_id))
    assert Enum.sort(unrecognized) == ["Also Fake", "Not A Real Card"]
  end

  test "ignores printing brackets and finish markers baked into the name" do
    assert {:ok, _} = Catalog.import_cards([card("oracle-sol-ring", "Sol Ring")])

    assert {:ok, %{entries: [resolved], unrecognized: []}} =
             EntryResolver.resolve([entry("Sol Ring *F*")])

    assert resolved.oracle_id == "oracle-sol-ring"
  end

  test "resolves a mix of known and unknown entries independently" do
    assert {:ok, _} = Catalog.import_cards([card("oracle-sol-ring", "Sol Ring")])

    assert {:ok, %{entries: resolved, unrecognized: ["Nonexistent Card"]}} =
             EntryResolver.resolve([entry("Sol Ring"), entry("Nonexistent Card")])

    assert %{oracle_id: "oracle-sol-ring"} = Enum.find(resolved, &(&1.name == "Sol Ring"))
    assert %{oracle_id: nil} = Enum.find(resolved, &(&1.name == "Nonexistent Card"))
  end
end
