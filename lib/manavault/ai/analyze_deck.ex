defmodule Manavault.AI.AnalyzeDeck do
  @moduledoc false

  alias Manavault.AI.{DeckAnalysis, DeckAnalysisWorker, Provider, UpdateSettings}
  alias Manavault.Catalog
  alias Manavault.Catalog.Deck

  def run(%Deck{} = deck) do
    settings = UpdateSettings.settings()

    with :ok <- UpdateSettings.configured(settings),
         payload <- DeckAnalysis.payload(deck, Catalog.deck_cards(deck)),
         {:ok, result} <- analyze_payload(settings, payload) do
      Catalog.save_deck_analysis(deck, analysis_attrs(result, settings))
    end
  end

  def refresh_all do
    with :ok <- UpdateSettings.settings() |> UpdateSettings.configured() do
      jobs =
        Catalog.list_decks()
        |> Enum.map(&DeckAnalysisWorker.new(%{deck_id: &1.id}))
        |> Oban.insert_all()

      {:ok, length(jobs)}
    end
  end

  def analyze_payload(settings, payload) do
    with {:ok, provider} <- Provider.module(settings.provider),
         {:ok, provider_result} <- provider.analyze_deck(settings, payload) do
      DeckAnalysis.normalize_result(
        provider_result,
        payload,
        settings.deck_analysis_instructions
      )
    end
  end

  defp analysis_attrs(result, settings) do
    %{
      ai_analysis: DeckAnalysis.render_markdown(result),
      ai_analysis_model: settings.model,
      ai_analyzed_at: DateTime.utc_now() |> DateTime.truncate(:second),
      commander_bracket: result.official_bracket,
      commander_bracket_estimate: result.play_bracket
    }
  end
end
