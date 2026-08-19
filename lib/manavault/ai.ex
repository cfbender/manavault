defmodule Manavault.AI do
  @moduledoc "AI provider settings, deck analysis, and saved deck questions."

  import Ecto.Changeset, only: [add_error: 3, apply_changes: 1]

  alias Manavault.AI.{DeckAnalysis, DeckQuestion, Provider, Settings}
  alias Manavault.Catalog
  alias Manavault.Catalog.{Deck, Util}
  alias Manavault.Catalog.Search.CardsByName
  alias Manavault.Repo

  @singleton_id 1

  def settings do
    Repo.get(Settings, @singleton_id) || insert_default!()
  end

  def sanitized_settings do
    settings = settings()

    %{
      id: settings.id,
      provider: settings.provider,
      model: settings.model,
      has_api_key: Settings.secret_present?(settings)
    }
  end

  def update_settings(attrs) do
    settings = settings()
    changeset = Settings.changeset(settings, preserve_api_key(attrs, settings))

    if changeset.valid? do
      candidate = apply_changes(changeset)

      with {:ok, provider} <- Provider.module(candidate.provider),
           :ok <- provider.validate_settings(candidate) do
        Repo.update(changeset)
      else
        {:error, field, message} -> {:error, add_error(changeset, field, message)}
        {:error, message} -> {:error, add_error(changeset, :provider, message)}
      end
    else
      {:error, changeset}
    end
  end

  def analyze_deck(%Deck{} = deck) do
    settings = settings()

    with :ok <- configured(settings),
         {:ok, provider} <- Provider.module(settings.provider),
         payload <- DeckAnalysis.payload(deck, Catalog.deck_cards(deck)),
         {:ok, provider_result} <- provider.analyze_deck(settings, payload),
         {:ok, result} <- DeckAnalysis.normalize_result(provider_result, payload),
         attrs <- analysis_attrs(result, settings),
         {:ok, deck} <- Catalog.save_deck_analysis(deck, attrs) do
      {:ok, deck}
    end
  end

  def ask_deck_question(%Deck{} = deck, question) do
    settings = settings()

    with {:ok, question} <- DeckQuestion.validate(question),
         :ok <- configured(settings),
         {:ok, provider} <- Provider.module(settings.provider),
         payload <- DeckAnalysis.payload(deck, Catalog.deck_cards(deck)),
         {:ok, answer} <- generate_deck_answer(provider, settings, payload, question, 1) do
      Catalog.create_deck_question_answer(deck, %{question: question, answer: answer})
    end
  end

  defp generate_deck_answer(provider, settings, payload, question, corrections_left) do
    with {:ok, provider_result} <- provider.ask_deck_question(settings, payload, question),
         {:ok, result} <- DeckQuestion.normalize_result(provider_result) do
      case recommendation_issues(result.recommended_additions, payload) do
        [] ->
          {:ok, result.answer}

        issues when corrections_left > 0 ->
          correction = DeckQuestion.correction_prompt(question, issues)
          generate_deck_answer(provider, settings, payload, correction, corrections_left - 1)

        _issues ->
          {:error, "The AI provider could not produce a legal recommendation. Try asking again."}
      end
    end
  end

  defp recommendation_issues([], _payload), do: []

  defp recommendation_issues(card_names, payload) do
    cards = Catalog.cards_by_names(card_names)

    Enum.flat_map(card_names, fn card_name ->
      case Map.get(cards, CardsByName.key(card_name)) do
        nil ->
          ["#{card_name} was not found in the current card catalog."]

        card ->
          format_issue(card_name, card, payload.deck.format) ++
            color_identity_issue(card_name, card, payload.deck)
      end
    end)
  end

  defp format_issue(_card_name, _card, format) when format in ~w(limited casual), do: []

  defp format_issue(card_name, card, format) do
    status = card.legalities |> Util.decode_json(%{}) |> Map.get(format)

    if status in ~w(legal restricted),
      do: [],
      else: ["#{card_name} is not legal in #{format}."]
  end

  defp color_identity_issue(card_name, card, %{
         format: "commander",
         commander_color_identity: commander_identity
       })
       when is_list(commander_identity) do
    card_identity = card.color_identity |> Util.decode_json([]) |> MapSet.new()
    commander_identity = MapSet.new(commander_identity)

    if MapSet.subset?(card_identity, commander_identity),
      do: [],
      else: ["#{card_name} is outside the commander's color identity."]
  end

  defp color_identity_issue(_card_name, _card, _deck), do: []

  defp configured(%Settings{} = settings) do
    if Settings.secret_present?(settings) and is_binary(settings.model) and settings.model != "" do
      :ok
    else
      {:error, "Configure an AI provider, API key, and model in Settings first."}
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

  defp insert_default! do
    %Settings{id: @singleton_id, provider: "openrouter"}
    |> Repo.insert!(on_conflict: :nothing)

    Repo.get!(Settings, @singleton_id)
  end

  defp preserve_api_key(attrs, settings) do
    attrs = Enum.into(attrs, %{})
    key = if Map.has_key?(attrs, :api_key), do: :api_key, else: "api_key"

    case Map.fetch(attrs, key) do
      :error ->
        attrs

      {:ok, nil} ->
        Map.put(attrs, key, settings.api_key)

      {:ok, value} when is_binary(value) ->
        if String.trim(value) == "", do: Map.put(attrs, key, settings.api_key), else: attrs

      {:ok, _value} ->
        attrs
    end
  end
end
