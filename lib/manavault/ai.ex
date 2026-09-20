defmodule Manavault.AI do
  @moduledoc "AI provider settings, deck analysis, and saved deck questions."

  alias Manavault.AI.{
    AnalyzeDeck,
    AnalyzeDeckList,
    AnswerDeckQuestion,
    ListDeckAnalysisRequests,
    UpdateSettings
  }

  defdelegate settings(), to: UpdateSettings
  defdelegate sanitized_settings(), to: UpdateSettings
  defdelegate update_settings(attrs), to: UpdateSettings, as: :run

  defdelegate analyze_deck(deck), to: AnalyzeDeck, as: :run
  defdelegate refresh_all_deck_analyses(), to: AnalyzeDeck, as: :refresh_all

  defdelegate analyze_deck_list(args), to: AnalyzeDeckList, as: :run
  defdelegate list_deck_analysis_requests(opts \\ []), to: ListDeckAnalysisRequests, as: :run

  defdelegate ask_deck_question(deck, question), to: AnswerDeckQuestion, as: :enqueue
  defdelegate answer_deck_question(id), to: AnswerDeckQuestion, as: :run
  defdelegate fail_deck_question(id, reason), to: AnswerDeckQuestion, as: :fail
end
