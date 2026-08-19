defmodule Manavault.AI.DeckAnalysisTest do
  use ExUnit.Case, async: true

  alias Manavault.AI.DeckAnalysis
  alias Manavault.Catalog.{Card, Deck, DeckCard}

  @result %{
    "summary" => "A focused tempo deck.",
    "themes" => ["Tempo"],
    "game_plan" => "Apply pressure while interacting.",
    "strengths" => ["Efficient threats"],
    "weaknesses" => ["Limited late game"],
    "official_bracket" => 2,
    "play_bracket" => 3,
    "bracket_rationale" => "The list plays above its card-based minimum.",
    "power_up" => ["Add stronger interaction"],
    "power_down" => ["Use slower threats"],
    "consistency" => ["Tighten the curve"],
    "custom_sections" => []
  }

  test "preserves practical bracket differences while enforcing Game Changer minimums" do
    payload = %{deck: %{format: "commander"}, facts: %{game_changer_count: 1}}

    assert {:ok, result} = DeckAnalysis.normalize_result(@result, payload)
    assert result.official_bracket == 3
    assert result.play_bracket == 3

    weaker = Map.put(@result, "play_bracket", 2)
    assert {:ok, weaker_result} = DeckAnalysis.normalize_result(weaker, payload)

    assert DeckAnalysis.bracket_label(weaker_result.official_bracket, weaker_result.play_bracket) ==
             "Bracket 3 (plays like Bracket 2)"
  end

  test "Commander brackets do not apply to other formats" do
    payload = %{deck: %{format: "modern"}, facts: %{game_changer_count: 4}}

    assert {:ok, result} = DeckAnalysis.normalize_result(@result, payload)
    assert result.official_bracket == nil
    assert result.play_bracket == nil
  end

  test "rejects incomplete structured responses" do
    assert {:error, "The AI provider returned an incomplete analysis."} =
             DeckAnalysis.normalize_result(%{"summary" => "Only a summary"}, %{
               deck: %{format: "commander"},
               facts: %{game_changer_count: 0}
             })
  end

  test "includes custom instructions in the system prompt and renders requested sections" do
    prompt =
      DeckAnalysis.system_prompt(
        "Never suggest infinite combos. Add another section for budget upgrades."
      )

    assert prompt =~ "Never suggest infinite combos."
    assert prompt =~ "Add another section for budget upgrades."
    assert prompt =~ "authoritative metadata calculated by ManaVault"

    payload = %{deck: %{format: "modern"}, facts: %{game_changer_count: 0}}

    result =
      Map.put(@result, "custom_sections", [
        %{
          "title" => "  Budget upgrades  ",
          "content" => "  - Start with [[Counterspell]].  "
        }
      ])

    assert {:ok, normalized} = DeckAnalysis.normalize_result(result, payload)

    assert normalized.custom_sections == [
             %{title: "Budget upgrades", content: "- Start with [[Counterspell]]."}
           ]

    assert DeckAnalysis.render_markdown(normalized) =~
             "## Budget upgrades\n\n- Start with [[Counterspell]]."
  end

  test "payload includes authoritative land metadata from counted deck zones" do
    deck = %Deck{name: "Land Count", format: "commander"}

    deck_cards = [
      %DeckCard{
        quantity: 38,
        zone: "mainboard",
        card: %Card{name: "Plains", type_line: "Basic Land — Plains"}
      },
      %DeckCard{
        quantity: 1,
        zone: "mainboard",
        card: %Card{
          name: "Bala Ged Recovery // Bala Ged Sanctuary",
          type_line: "Sorcery // Land"
        }
      },
      %DeckCard{
        quantity: 1,
        zone: "commander",
        card: %Card{name: "Test Commander", type_line: "Legendary Creature — Cat"}
      },
      %DeckCard{
        quantity: 4,
        zone: "considering",
        card: %Card{name: "Island", type_line: "Basic Land — Island"}
      }
    ]

    payload = DeckAnalysis.payload(deck, deck_cards)

    assert payload.facts.card_count == 40
    assert payload.facts.land_count == 39
    assert payload.facts.nonland_count == 1
  end
end
