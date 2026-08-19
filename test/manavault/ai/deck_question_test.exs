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
    assert prompt =~ "What should I cut?"
    assert prompt =~ "Sol Ring"
  end
end
