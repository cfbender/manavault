defmodule Manavault.AI.CardLookupToolTest do
  use Manavault.DataCase, async: false

  alias Manavault.AI.CardLookupTool
  alias Manavault.Catalog
  alias Manavault.CatalogTestSupport

  test "exposes a single function tool definition" do
    assert [%{type: "function", function: %{name: "lookup_cards", parameters: parameters}}] =
             CardLookupTool.definitions()

    assert parameters.required == ["names"]
    assert parameters.properties.names.type == "array"
  end

  test "returns catalog details for known cards and lists unknown names" do
    assert {:ok, %{cards_count: 2}} =
             Catalog.import_cards([
               CatalogTestSupport.legal_commander_card(),
               CatalogTestSupport.legality_card("Recent Removal", ["W", "B"], %{
                 "commander" => "legal",
                 "vintage" => "restricted",
                 "modern" => "not_legal",
                 "standard" => "banned"
               })
             ])

    result =
      CardLookupTool.call("lookup_cards", %{
        "names" => ["recent removal", "Test Commander", "Made Up Card", " ", "Recent Removal"]
      })

    assert result.not_found == ["Made Up Card"]
    assert [removal, commander] = result.cards

    assert removal.name == "Recent Removal"
    assert removal.color_identity == ["W", "B"]
    assert removal.legal_in == ["commander", "vintage"]
    assert removal.oracle_text == "Take an extra turn after this turn."
    assert removal.mana_cost == "{1}{U}"
    assert removal.mana_value == 2.0
    assert removal.game_changer == false

    assert commander.name == "Test Commander"
    assert commander.type_line == "Legendary Creature — Cat"

    assert {:ok, _json} = Jason.encode(result)
  end

  test "describes malformed calls and unknown tools instead of failing" do
    assert %{error: error} = CardLookupTool.call("lookup_cards", %{"names" => "Sol Ring"})
    assert error =~ "names array"

    assert %{error: error} = CardLookupTool.call("search_web", %{"query" => "Sol Ring"})
    assert error =~ ~s(Unknown tool "search_web")
  end
end
