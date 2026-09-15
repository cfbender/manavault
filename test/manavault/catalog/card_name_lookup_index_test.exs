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

  test "card-name lookup matches diacritic names by their ASCII form" do
    {:ok, _oin} =
      %Card{}
      |> Card.changeset(%{
        oracle_id: "oracle-oin-the-brave",
        name: "Óin the Brave",
        type_line: "Legendary Creature — Dwarf"
      })
      |> Repo.insert()

    assert %Card{oracle_id: "oracle-oin-the-brave"} = CardLookup.local_card(nil, "Oin the brave")

    lookup = CardLookup.local_card_lookup([], ["Oin the brave", "sol ring"])

    assert %Card{oracle_id: "oracle-oin-the-brave"} =
             CardLookup.local_card(nil, "Óin the Brave", lookup)

    assert %Card{oracle_id: "oracle-sol-ring"} = CardLookup.local_card(nil, "SOL RING", lookup)
  end

  test "normalized-name equality uses the normalized_name index instead of a table scan" do
    %{rows: rows} =
      Repo.query!(
        "EXPLAIN QUERY PLAN SELECT oracle_id FROM scryfall_cards WHERE normalized_name = ?1",
        ["sol ring"]
      )

    plan = rows |> Enum.map_join("\n", &Enum.join(&1, " "))

    assert plan =~ "scryfall_cards_normalized_name_index"
    refute plan =~ ~r/SCAN scryfall_cards\b/
  end
end
