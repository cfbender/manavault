defmodule Manavault.AI.DeckAnalysis do
  @moduledoc false

  alias Manavault.AI.DeckAnalysis.{Payload, Prompt, Result}

  defdelegate payload(deck, deck_cards), to: Payload, as: :build
  defdelegate system_prompt(custom_instructions \\ nil), to: Prompt, as: :system
  defdelegate user_prompt(payload), to: Prompt, as: :user
  defdelegate response_schema(custom_instructions \\ nil), to: Prompt, as: :schema

  defdelegate normalize_result(result, payload, custom_instructions \\ nil),
    to: Result,
    as: :normalize

  defdelegate render_markdown(result), to: Result, as: :render_markdown
  defdelegate bracket_label(official, practical), to: Result
end
