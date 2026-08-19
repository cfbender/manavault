defmodule Manavault.AI.DeckAnalysisTest do
  use ExUnit.Case, async: true

  alias Manavault.AI.DeckAnalysis

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
    "consistency" => ["Tighten the curve"]
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
end
