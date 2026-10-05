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
    "bracket_rating" => "3+",
    "bracket_rationale" => "The list plays above its card-based minimum.",
    "power_up" => ["Add stronger interaction"],
    "power_down" => ["Use slower threats"],
    "consistency" => ["Tighten the curve"],
    "mulligan_guide" => ["Keep an early threat and interaction"],
    "custom_sections" => []
  }

  test "requests linked card references and preserves them in rendered analysis" do
    assert DeckAnalysis.system_prompt() =~ "wrap every exact Magic card name in double"
    assert DeckAnalysis.system_prompt() =~ "square brackets, for example [[Sun Titan]]"

    payload = %{deck: %{format: "commander"}, facts: %{game_changer_count: 0}}

    response =
      Map.merge(@result, %{
        "summary" => "Recur [[Sun Titan]].",
        "power_up" => ["Add [[Emeria, the Sky Ruin]]."],
        "custom_sections" => [
          %{"title" => "Budget", "content" => "Try [[Sevinne's Reclamation]]."}
        ]
      })

    assert {:ok, result} = DeckAnalysis.normalize_result(response, payload, "Include Budget")
    markdown = DeckAnalysis.render_markdown(result)
    assert markdown =~ "## Overview\n\nRecur [[Sun Titan]]."
    assert markdown =~ "- Add [[Emeria, the Sky Ruin]]."
    assert markdown =~ "## Budget\n\nTry [[Sevinne's Reclamation]]."
  end

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
             "Bracket 3-"
  end

  test "renders independently assessed placement while keeping official guidance and pace in the body" do
    payload = %{deck: %{format: "commander"}, facts: %{game_changer_count: 0}}

    for rating <- ["3-", "3", "3+"] do
      response =
        Map.merge(@result, %{
          "official_bracket" => 3,
          "play_bracket" => 3,
          "bracket_rating" => rating,
          "bracket_rationale" => "Its engines support a turn-eight win with limited redundancy."
        })

      assert {:ok, result} = DeckAnalysis.normalize_result(response, payload)
      assert result.bracket_rating == rating
      assert DeckAnalysis.bracket_label(3, 3, rating) == "Bracket #{rating}"

      assert DeckAnalysis.render_markdown(result) =~
               "## Bracket read\n\n**Bracket #{rating}**\n\nOfficial WotC bracket: 3.\n\nIts engines support a turn-eight win with limited redundancy."
    end
  end

  test "legacy ratings use the higher bracket with a minus when the old values differ" do
    assert DeckAnalysis.bracket_label(2, 3) == "Bracket 3-"
    assert DeckAnalysis.bracket_label(4, 3) == "Bracket 4-"
    assert DeckAnalysis.bracket_label(3, 3) == "Bracket 3"
    assert DeckAnalysis.bracket_label(3, nil) == "Bracket 3"
    assert DeckAnalysis.bracket_label(2, 3, "3+") == "Bracket 3+"
  end

  test "requires a valid explicit rating in new Commander responses" do
    payload = %{deck: %{format: "commander"}, facts: %{game_changer_count: 0}}

    for rating <- [nil, "", "0", "6-", "3++", "3+\n", 3] do
      assert {:error, "The AI provider returned an invalid Commander bracket."} =
               DeckAnalysis.normalize_result(Map.put(@result, "bracket_rating", rating), payload)
    end

    schema = DeckAnalysis.response_schema()
    assert "bracket_rating" in schema.required

    # Azure rejects null enum members on a union type; keep each branch single-typed.
    assert schema.properties.bracket_rating == %{
             anyOf: [
               %{
                 type: "string",
                 enum: [
                   "1-",
                   "1",
                   "1+",
                   "2-",
                   "2",
                   "2+",
                   "3-",
                   "3",
                   "3+",
                   "4-",
                   "4",
                   "4+",
                   "5-",
                   "5",
                   "5+"
                 ]
               },
               %{type: "null"}
             ]
           }
  end

  test "Commander brackets do not apply to other formats" do
    payload = %{deck: %{format: "modern"}, facts: %{game_changer_count: 4}}

    assert {:ok, result} = DeckAnalysis.normalize_result(@result, payload)
    assert result.official_bracket == nil
    assert result.play_bracket == nil
    assert result.bracket_rating == nil
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

  test "grounds Commander analysis in multiplayer finishers, resources, and cohesion" do
    prompt = DeckAnalysis.system_prompt() |> String.replace(~r/\s+/, " ")

    assert prompt =~ "three opponents starting at 40 life each, 120 life in total"
    assert prompt =~ "is a partial finisher, not a win condition"
    assert prompt =~ "Take inventory of the resources the deck's engine actually produces"
    assert prompt =~ "Base every claim about what a deck card does on its supplied oracle_text"
    assert prompt =~ "The Command Zone's 2025 template"
    assert prompt =~ "Never cut a card from a role you call thin"
    assert prompt =~ "Consistency changes must not weaken a thin link"

    user_prompt = DeckAnalysis.user_prompt(%{deck: %{}, facts: %{}})
    assert user_prompt =~ "multiplayer deck that must defeat"
  end

  test "frames Commander brackets as a holistic guideline rather than a card checklist" do
    prompt = DeckAnalysis.system_prompt() |> String.replace(~r/\s+/, " ")

    assert prompt =~ "flexible matchmaking guidelines"
    assert prompt =~ "violating an expectation once does not immediately move a deck"
    assert prompt =~ "One [[Nexus of Fate]] is not a chained or looped extra-turn plan"
    assert prompt =~ "One [[Mana Vault]]"
    assert prompt =~ "does not, by itself, make an otherwise moderate deck Bracket 4"
    assert prompt =~ "density, redundancy, synergy, tutorability"
    assert prompt =~ "Do not recite each bracket's restrictions"
    assert prompt =~ "Do not calculate the suffix from the difference"
    assert prompt =~ "plus means the upper end without quite reaching the next bracket"
    assert prompt =~ "keeping the official comparison in the analysis body"
    assert prompt =~ "not official WotC sub-brackets"
    refute prompt =~ "required by the literal Commander Brackets guidelines"
  end

  test "weighs interaction tradeoffs without treating symmetrical effects as inherent weaknesses" do
    prompt = DeckAnalysis.system_prompt() |> String.replace(~r/\s+/, " ")

    assert prompt =~ "Judge interaction by its net value in a multiplayer game"
    assert prompt =~ "Ordinary costs or symmetrical effects are not inherently anti-synergy"
    assert prompt =~ "cite a weakness only when the list shows a meaningful structural problem"
    refute prompt =~ "sweepers that leave its board intact"
  end

  test "frames the analysis around deck structure, role balance, and synergy" do
    prompt = DeckAnalysis.system_prompt() |> String.replace(~r/\s+/, " ")

    assert prompt =~ "State its objective as a chain"
    assert prompt =~ "engine pieces that perform the core action, multipliers"
    assert prompt =~ "fewer cards in whatever role the commander fills"
    assert prompt =~ "Prefer synergy over generic staples"
    assert prompt =~ "Size interaction to the plan"
    assert prompt =~ "remove the lowest-synergy cards from over-represented roles first"
    assert prompt =~ "In power_up, lead with the change that most strengthens the thinnest link"
    assert prompt =~ "pair each addition with the low-synergy card it should replace"
    assert prompt =~ "In consistency, judge whether the deck reliably assembles its chain on time"
    assert prompt =~ "Distinguish improvements that make the deck more reliable"

    user_prompt =
      %{deck: %{format: "commander", cards: []}, facts: %{}}
      |> DeckAnalysis.user_prompt()
      |> String.replace(~r/\s+/, " ")

    assert user_prompt =~ "Identify its objective chain"
    assert user_prompt =~ "naming both the cards to add and the cards to cut"
  end

  test "limits consistency improvements to card changes rather than gameplay advice" do
    prompt = DeckAnalysis.system_prompt() |> String.replace(~r/\s+/, " ")

    assert prompt =~
             "Every consistency item must recommend a concrete card addition, cut, replacement, or quantity change"

    assert prompt =~ "explain how it improves reliability"

    assert prompt =~
             "Do not include gameplay advice, sequencing tips, mulligan decisions, or other ways to pilot the deck in consistency"

    assert prompt =~ "keep those in game_plan or mulligan_guide as appropriate"
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
