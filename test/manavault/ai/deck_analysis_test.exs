defmodule Manavault.AI.DeckAnalysisTest do
  use ExUnit.Case, async: true

  alias Manavault.AI.DeckAnalysis
  alias Manavault.Catalog.{Card, Deck, DeckCard}

  @result %{
    "summary" => "A focused tempo deck.",
    "themes" => ["Tempo"],
    "game_plan" => "Apply pressure while interacting.",
    "opponent_experience" => "Its turns are quick and leave room for interaction.",
    "strengths" => ["Efficient threats"],
    "weaknesses" => ["Limited late game"],
    "official_bracket" => 2,
    "play_bracket" => 3,
    "bracket_rationale" => "The list plays above its card-based minimum.",
    "power_up" => ["Add stronger interaction"],
    "power_down" => ["Use slower threats"],
    "consistency" => ["Tighten the curve"],
    "mulligan_guide" => ["Keep an early threat and interaction"],
    "custom_sections" => []
  }

  test "preserves practical bracket differences while enforcing Game Changer minimums" do
    payload = %{deck: %{format: "commander"}, facts: %{game_changer_count: 1}}

    assert {:ok, result} = DeckAnalysis.normalize_result(@result, payload)
    assert result.official_bracket == 3
    assert result.play_bracket == 3
    assert result.bracket_rationale =~ "require at least Bracket 3"
    assert result.bracket_rationale =~ "1 Game Changer"

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
    assert prompt =~ "mulligan_guide"
    assert prompt =~ "opponent_experience"
    assert prompt =~ "long and solitaire-like"
    assert prompt =~ "repeated discard, stax, locks"
    assert prompt =~ "Do not duplicate this or another standard field"

    payload = %{deck: %{format: "modern"}, facts: %{game_changer_count: 0}}

    result =
      Map.put(@result, "custom_sections", [
        %{
          "title" => "  Budget upgrades  ",
          "content" => "  - Start with [[Counterspell]].  "
        }
      ])

    assert {:ok, normalized} =
             DeckAnalysis.normalize_result(result, payload, "Add a budget upgrades section.")

    assert normalized.custom_sections == [
             %{title: "Budget upgrades", content: "- Start with [[Counterspell]]."}
           ]

    assert DeckAnalysis.render_markdown(normalized) =~
             "## Budget upgrades\n\n- Start with [[Counterspell]]."
  end

  test "requires empty custom sections when no custom instructions exist" do
    schema = DeckAnalysis.response_schema()
    assert schema.properties.custom_sections.maxItems == 0

    custom_schema =
      DeckAnalysis.response_schema("Add a budget section.").properties.custom_sections

    refute Map.has_key?(custom_schema, :maxItems)

    result =
      Map.put(@result, "custom_sections", [
        %{"title" => "Strengths", "content" => "Duplicated standard content."}
      ])

    payload = %{deck: %{format: "modern"}, facts: %{game_changer_count: 0}}
    assert {:ok, normalized} = DeckAnalysis.normalize_result(result, payload)
    assert normalized.custom_sections == []
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

  test "payload omits repeated card defaults without losing exceptional values" do
    deck = %Deck{name: "Compact", format: "commander"}

    deck_cards = [
      %DeckCard{
        quantity: 1,
        zone: "mainboard",
        card: %Card{
          name: "Ordinary Spell",
          type_line: "Instant",
          oracle_text: "Draw a card.",
          cmc: 1.0,
          mana_cost: "{U}",
          color_identity: "[]",
          legalities: ~s({"commander":"legal"}),
          deck_themes: "[]",
          edhrec_saltiness: 0.5
        }
      },
      %DeckCard{
        quantity: 2,
        zone: "commander",
        card: %Card{
          name: "Exceptional Card",
          type_line: "Legendary Creature",
          oracle_text: "Flying",
          color_identity: ~s(["U"]),
          legalities: ~s({"commander":"restricted"}),
          game_changer: true,
          deck_category: "card_advantage",
          deck_themes: ~s(["draw"]),
          edhrec_saltiness: 3.25
        }
      }
    ]

    [ordinary, exceptional] = DeckAnalysis.payload(deck, deck_cards).deck.cards

    refute Map.has_key?(ordinary, :quantity)
    refute Map.has_key?(ordinary, :zone)
    refute Map.has_key?(ordinary, :color_identity)
    refute Map.has_key?(ordinary, :format_legality)
    refute Map.has_key?(ordinary, :game_changer)
    refute Map.has_key?(ordinary, :deck_themes)

    assert exceptional.quantity == 2
    assert exceptional.zone == "commander"
    assert exceptional.color_identity == ["U"]
    assert exceptional.format_legality == "restricted"
    assert exceptional.game_changer
    assert exceptional.deck_category == "card_advantage"
    assert exceptional.deck_themes == ["draw"]

    assert DeckAnalysis.payload(deck, deck_cards).facts.saltiest_cards == [
             %{name: "Exceptional Card", score: 3.25},
             %{name: "Ordinary Spell", score: 0.5}
           ]
  end
end
