defmodule Manavault.Catalog.CardNameLookupIndexTest do
  use Manavault.DataCase, async: true

  alias Manavault.Catalog.Card
  alias Manavault.Catalog.EDHRec.Response.CardLookup

  setup do
    {:ok, card} =
      %Card{}
      |> Card.changeset(%{oracle_id: "oracle-sol-ring", name: "Sol Ring", type_line: "Artifact"})
      |> Repo.insert()

    %{card: card}
  end

  test "card-name lookup matches case-insensitively and trims" do
    assert %Card{oracle_id: "oracle-sol-ring"} = CardLookup.local_card(nil, "SOL RING")
    assert %Card{oracle_id: "oracle-sol-ring"} = CardLookup.local_card(nil, "sol ring")
    assert %Card{oracle_id: "oracle-sol-ring"} = CardLookup.local_card(nil, "  Sol Ring  ")
    assert CardLookup.local_card(nil, "not a card") == nil
  end

  test "case-insensitive name equality uses the NOCASE index instead of a table scan" do
    %{rows: rows} =
      Repo.query!(
        "EXPLAIN QUERY PLAN SELECT oracle_id FROM scryfall_cards WHERE name = ?1 COLLATE NOCASE",
        ["sol ring"]
      )

    plan = rows |> Enum.map_join("\n", &Enum.join(&1, " "))

    assert plan =~ "scryfall_cards_name_nocase_idx"
    refute plan =~ ~r/SCAN scryfall_cards\b/

    # Sanity: the old lower(name) form cannot use that index (guards the fix).
    %{rows: old_rows} =
      Repo.query!(
        "EXPLAIN QUERY PLAN SELECT oracle_id FROM scryfall_cards WHERE lower(name) = ?1",
        ["sol ring"]
      )

    old_plan = old_rows |> Enum.map_join("\n", &Enum.join(&1, " "))
    refute old_plan =~ "scryfall_cards_name_nocase_idx"
  end
end
