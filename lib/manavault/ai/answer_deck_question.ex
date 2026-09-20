defmodule Manavault.AI.AnswerDeckQuestion do
  @moduledoc false

  alias Ecto.Multi

  alias Manavault.AI.{
    DeckAnalysis,
    DeckQuestion,
    DeckQuestionWorker,
    Provider,
    UpdateSettings
  }

  alias Manavault.Catalog
  alias Manavault.Catalog.{Deck, DeckQuestionAnswer, Util}
  alias Manavault.Catalog.Search.CardsByName
  alias Manavault.Repo

  def enqueue(%Deck{} = deck, question) do
    settings = UpdateSettings.settings()

    with {:ok, question} <- DeckQuestion.validate(question),
         :ok <- UpdateSettings.configured(settings),
         {:ok, _provider} <- Provider.module(settings.provider) do
      enqueue_question(deck, question)
    end
  end

  def run(id) do
    case Catalog.get_deck_question_answer(id) do
      nil -> :ok
      %DeckQuestionAnswer{status: status} when status != "pending" -> :ok
      %DeckQuestionAnswer{} = question_answer -> answer(question_answer)
    end
  end

  def fail(id, reason) do
    case Catalog.get_deck_question_answer(id) do
      nil -> :ok
      %DeckQuestionAnswer{status: status} when status != "pending" -> :ok
      %DeckQuestionAnswer{} = question_answer -> persist_failure(question_answer, reason)
    end
  end

  defp enqueue_question(deck, question) do
    Multi.new()
    |> Multi.insert(
      :question_answer,
      Catalog.change_deck_question_answer(deck, %{question: question, status: "pending"})
    )
    |> Oban.insert(:job, fn %{question_answer: answer} ->
      DeckQuestionWorker.new(%{question_answer_id: answer.id})
    end)
    |> Repo.transaction()
    |> case do
      {:ok, %{question_answer: question_answer}} -> {:ok, question_answer}
      {:error, _operation, reason, _changes} -> {:error, reason}
    end
  end

  defp answer(question_answer) do
    deck = Catalog.get_deck!(question_answer.deck_id)
    settings = UpdateSettings.settings()

    with :ok <- UpdateSettings.configured(settings),
         {:ok, provider} <- Provider.module(settings.provider),
         payload <- DeckAnalysis.payload(deck, Catalog.deck_cards(deck)),
         {:ok, result} <- generate(provider, settings, payload, question_answer.question, 1),
         {:ok, _question_answer} <- complete(question_answer, result, settings.model) do
      :ok
    end
  end

  defp complete(question_answer, result, model) do
    Catalog.complete_deck_question_answer(question_answer, %{
      answer: result.answer,
      model: model,
      recommendations: %{
        "cuts" => result.recommended_cuts,
        "additions" => result.recommended_additions
      }
    })
  end

  defp persist_failure(question_answer, reason) do
    error =
      if is_binary(reason),
        do: String.slice(reason, 0, 2_000),
        else: "The AI question could not be completed."

    case Catalog.fail_deck_question_answer(question_answer, error) do
      {:ok, _question_answer} -> :ok
      {:error, changeset} -> {:error, changeset}
    end
  end

  defp generate(provider, settings, payload, question, corrections_left) do
    with {:ok, provider_result} <- provider.ask_deck_question(settings, payload, question),
         {:ok, result} <- DeckQuestion.normalize_result(provider_result) do
      validate_recommendations(provider, settings, payload, question, result, corrections_left)
    end
  end

  defp validate_recommendations(provider, settings, payload, question, result, corrections_left) do
    case recommendation_issues(result, payload) do
      [] ->
        {:ok, canonicalize_recommendations(result, payload)}

      issues when corrections_left > 0 ->
        correction = DeckQuestion.correction_prompt(question, issues)
        generate(provider, settings, payload, correction, corrections_left - 1)

      _issues ->
        {:error, "The AI provider could not produce a legal recommendation. Try asking again."}
    end
  end

  defp recommendation_issues(result, payload) do
    cut_issues(result.recommended_cuts, payload) ++
      addition_issues(result.recommended_additions, payload)
  end

  defp cut_issues([], _payload), do: []

  defp cut_issues(card_names, payload) do
    deck_card_names = MapSet.new(payload.deck.cards, &CardsByName.key(&1.name))

    Enum.flat_map(card_names, fn card_name ->
      if MapSet.member?(deck_card_names, CardsByName.key(card_name)),
        do: [],
        else: ["#{card_name} is not in the current deck."]
    end)
  end

  defp addition_issues([], _payload), do: []

  defp addition_issues(card_names, payload) do
    cards = Catalog.cards_by_names(card_names)

    Enum.flat_map(card_names, fn card_name ->
      case Map.get(cards, CardsByName.key(card_name)) do
        nil ->
          ["#{card_name} was not found in the current card catalog."]

        card ->
          format_issue(card_name, card, payload.deck.format) ++
            color_issue(card_name, card, payload.deck)
      end
    end)
  end

  defp canonicalize_recommendations(result, payload) do
    deck_card_names = Map.new(payload.deck.cards, &{CardsByName.key(&1.name), &1.name})
    cards = Catalog.cards_by_names(result.recommended_additions)

    %{
      result
      | recommended_cuts:
          Enum.map(result.recommended_cuts, &Map.fetch!(deck_card_names, CardsByName.key(&1))),
        recommended_additions:
          Enum.map(result.recommended_additions, fn card_name ->
            cards |> Map.fetch!(CardsByName.key(card_name)) |> Map.fetch!(:name)
          end)
    }
  end

  defp format_issue(_name, _card, format) when format in ~w(limited casual), do: []

  defp format_issue(name, card, format) do
    status = card.legalities |> Util.decode_json(%{}) |> Map.get(format)
    if status in ~w(legal restricted), do: [], else: ["#{name} is not legal in #{format}."]
  end

  defp color_issue(name, card, %{format: "commander", commander_color_identity: identity})
       when is_list(identity) do
    card_identity = card.color_identity |> Util.decode_json([]) |> MapSet.new()

    if MapSet.subset?(card_identity, MapSet.new(identity)),
      do: [],
      else: ["#{name} is outside the commander's color identity."]
  end

  defp color_issue(_name, _card, _deck), do: []
end
