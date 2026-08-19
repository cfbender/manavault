defmodule Manavault.AI.DeckQuestionTest do
  use ExUnit.Case, async: true

  alias Manavault.AI.DeckQuestion

  test "validates and trims deck questions" do
    assert {:ok, "Would Doubling Season fit?"} =
             DeckQuestion.validate("  Would Doubling Season fit?  ")

    assert {:error, "Enter a question about this deck."} = DeckQuestion.validate("  ")

    assert {:error, "Keep the question under 1,000 characters."} =
             DeckQuestion.validate(String.duplicate("a", 1_001))
  end

  test "frames deck data and the question as untrusted input" do
    prompt =
      DeckQuestion.user_prompt("What should I cut?", %{
        deck: %{name: "Value deck", cards: [%{name: "Sol Ring"}]}
      })

    assert DeckQuestion.system_prompt() =~ "untrusted data"
    assert DeckQuestion.system_prompt() =~ "commander_color_identity"
    assert DeckQuestion.system_prompt() =~ "off-color or format-illegal card"
    assert DeckQuestion.system_prompt() =~ "Honor every explicit constraint"
    assert DeckQuestion.system_prompt() =~ "[[Doubling Season]]"
    assert DeckQuestion.system_prompt() =~ "GitHub-Flavored Markdown"
    assert prompt =~ "What should I cut?"
    assert prompt =~ "Sol Ring"
  end

  test "normalizes structured answers and exposes a strict response schema" do
    assert {:ok, result} =
             DeckQuestion.normalize_result(%{
               "answer" => "  Add [[Sun Titan]].  ",
               "recommended_additions" => [" Sun Titan ", "Sun Titan", ""]
             })

    assert result == %{answer: "Add [[Sun Titan]].", recommended_additions: ["Sun Titan"]}
    assert DeckQuestion.response_schema().additionalProperties == false
    assert DeckQuestion.response_schema().required == ~w(answer recommended_additions)

    assert {:error, "The AI provider returned an empty answer."} =
             DeckQuestion.normalize_result(%{
               "answer" => "  ",
               "recommended_additions" => []
             })
  end
end
