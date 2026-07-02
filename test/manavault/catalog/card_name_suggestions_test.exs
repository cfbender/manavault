defmodule Manavault.Catalog.CardNameSuggestionsTest do
  use Manavault.DataCase, async: false

  alias Manavault.Catalog
  alias Manavault.Catalog.Search.CardNameSuggestions

  setup do
    CardNameSuggestions.clear_card_name_suggestion_cache()

    assert {:ok, %{cards_count: 2}} =
             Catalog.import_cards([
               card("scryfall-lightning-bolt", "oracle-lightning-bolt", "Lightning Bolt", "1"),
               card("scryfall-serra-angel", "oracle-serra-angel", "Serra Angel", "2")
             ])

    on_exit(&CardNameSuggestions.clear_card_name_suggestion_cache/0)
    :ok
  end

  defp card(id, oracle_id, name, cn) do
    %{
      "id" => id,
      "oracle_id" => oracle_id,
      "name" => name,
      "type_line" => "Creature",
      "collector_number" => cn,
      "set" => "sug",
      "set_name" => "Suggestion Set",
      "lang" => "en",
      "image_uris" => %{},
      "finishes" => ["nonfoil"],
      "legalities" => %{}
    }
  end

  test "fuzzy matching resolves substitutions, insertions, and deletions" do
    # substitution (o->0 normalized away leaves 'lightning bilt' typo)
    assert ["Lightning Bolt"] = Catalog.suggest_card_names("lightning bilt")
    # deletion (missing letters)
    assert ["Lightning Bolt"] = Catalog.suggest_card_names("lightnig bolt")
    # transposition/insertion
    assert ["Serra Angel"] = Catalog.suggest_card_names("serra angle")
    assert ["Serra Angel"] = Catalog.suggest_card_names("sera angel")
  end

  test "exact and prefix matches are returned" do
    assert ["Lightning Bolt"] = Catalog.suggest_card_names("lightning bolt")
    assert ["Lightning Bolt" | _] = Catalog.suggest_card_names("light")
  end
end
