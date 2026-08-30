defmodule Manavault.AI do
  @moduledoc "AI provider settings, deck analysis, and saved deck questions."

  import Ecto.Changeset, only: [add_error: 3, apply_changes: 1]
  import Ecto.Query

  alias Ecto.Multi

  alias Manavault.AI.{
    DeckAnalysis,
    DeckAnalysisRequest,
    DeckAnalysisWorker,
    DeckQuestion,
    DeckQuestionWorker,
    Provider,
    Settings
  }

  alias Manavault.Catalog
  alias Manavault.Catalog.{Deck, DeckCard, DeckQuestionAnswer, Util}
  alias Manavault.Catalog.Search.CardsByName
  alias Manavault.Repo
  alias Manavault.Trade.Lists

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
      deck_analysis_instructions: settings.deck_analysis_instructions,
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
         payload <- DeckAnalysis.payload(deck, Catalog.deck_cards(deck)),
         {:ok, result} <- analyze_payload(settings, payload),
         attrs <- analysis_attrs(result, settings) do
      Catalog.save_deck_analysis(deck, attrs)
    end
  end

  def list_deck_analysis_requests do
    DeckAnalysisRequest
    |> order_by([request], desc: request.inserted_at, desc: request.id)
    |> Repo.all()
  end

  def analyze_deck_list(args) when is_map(args) do
    settings = settings()

    with {:ok, source_type, source} <- analysis_source(args),
         {:ok, format} <- analysis_format(Map.get(args, :format)),
         :ok <- configured(settings),
         {:ok, %{source_name: source_name, entries: entries}} <-
           Lists.resolve(%{
             url: if(source_type == "url", do: source),
             text: if(source_type == "text", do: source)
           }),
         {:ok, deck_cards} <- external_deck_cards(entries),
         source_name <- analysis_source_name(source_name, source_type),
         deck <- %Deck{name: source_name, format: format},
         payload <- DeckAnalysis.payload(deck, deck_cards),
         {:ok, result} <- analyze_payload(settings, payload) do
      %DeckAnalysisRequest{}
      |> DeckAnalysisRequest.changeset(%{
        source_type: source_type,
        source: source,
        source_name: source_name,
        format: format,
        analysis: DeckAnalysis.render_markdown(result),
        model: settings.model,
        commander_bracket: result.official_bracket,
        commander_bracket_estimate: result.play_bracket
      })
      |> Repo.insert()
    end
  end

  def refresh_all_deck_analyses do
    with :ok <- configured(settings()) do
      jobs =
        Catalog.list_decks()
        |> Enum.map(&DeckAnalysisWorker.new(%{deck_id: &1.id}))
        |> Oban.insert_all()

      {:ok, length(jobs)}
    end
  end

  def ask_deck_question(%Deck{} = deck, question) do
    settings = settings()

    with {:ok, question} <- DeckQuestion.validate(question),
         :ok <- configured(settings),
         {:ok, _provider} <- Provider.module(settings.provider) do
      Multi.new()
      |> Multi.insert(
        :question_answer,
        Catalog.change_deck_question_answer(deck, %{question: question, status: "pending"})
      )
      |> Oban.insert(:job, fn %{question_answer: question_answer} ->
        DeckQuestionWorker.new(%{question_answer_id: question_answer.id})
      end)
      |> Repo.transaction()
      |> case do
        {:ok, %{question_answer: question_answer}} -> {:ok, question_answer}
        {:error, _operation, reason, _changes} -> {:error, reason}
      end
    end
  end

  def answer_deck_question(id) do
    case Catalog.get_deck_question_answer(id) do
      nil ->
        :ok

      %DeckQuestionAnswer{status: status} when status != "pending" ->
        :ok

      %DeckQuestionAnswer{} = question_answer ->
        deck = Catalog.get_deck!(question_answer.deck_id)
        settings = settings()

        with :ok <- configured(settings),
             {:ok, provider} <- Provider.module(settings.provider),
             payload <- DeckAnalysis.payload(deck, Catalog.deck_cards(deck)),
             {:ok, result} <-
               generate_deck_answer(provider, settings, payload, question_answer.question, 1),
             {:ok, _question_answer} <-
               Catalog.complete_deck_question_answer(question_answer, %{
                 answer: result.answer,
                 model: settings.model,
                 recommendations: %{
                   "cuts" => result.recommended_cuts,
                   "additions" => result.recommended_additions
                 }
               }) do
          :ok
        end
    end
  end

  def fail_deck_question(id, reason) do
    case Catalog.get_deck_question_answer(id) do
      nil -> :ok
      %DeckQuestionAnswer{status: status} when status != "pending" -> :ok
      %DeckQuestionAnswer{} = question_answer -> persist_question_failure(question_answer, reason)
    end
  end

  defp persist_question_failure(question_answer, reason) do
    error =
      if is_binary(reason),
        do: String.slice(reason, 0, 2_000),
        else: "The AI question could not be completed."

    case Catalog.fail_deck_question_answer(question_answer, error) do
      {:ok, _question_answer} -> :ok
      {:error, changeset} -> {:error, changeset}
    end
  end

  defp generate_deck_answer(provider, settings, payload, question, corrections_left) do
    with {:ok, provider_result} <- provider.ask_deck_question(settings, payload, question),
         {:ok, result} <- DeckQuestion.normalize_result(provider_result) do
      case recommendation_issues(result, payload) do
        [] ->
          {:ok, canonicalize_recommendations(result, payload)}

        issues when corrections_left > 0 ->
          correction = DeckQuestion.correction_prompt(question, issues)
          generate_deck_answer(provider, settings, payload, correction, corrections_left - 1)

        _issues ->
          {:error, "The AI provider could not produce a legal recommendation. Try asking again."}
      end
    end
  end

  defp recommendation_issues(result, payload) do
    cut_recommendation_issues(result.recommended_cuts, payload) ++
      addition_recommendation_issues(result.recommended_additions, payload)
  end

  defp cut_recommendation_issues([], _payload), do: []

  defp cut_recommendation_issues(card_names, payload) do
    deck_card_names = MapSet.new(payload.deck.cards, &CardsByName.key(&1.name))

    Enum.flat_map(card_names, fn card_name ->
      if MapSet.member?(deck_card_names, CardsByName.key(card_name)),
        do: [],
        else: ["#{card_name} is not in the current deck."]
    end)
  end

  defp addition_recommendation_issues([], _payload), do: []

  defp addition_recommendation_issues(card_names, payload) do
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

  defp analyze_payload(settings, payload) do
    with {:ok, provider} <- Provider.module(settings.provider),
         {:ok, provider_result} <- provider.analyze_deck(settings, payload) do
      DeckAnalysis.normalize_result(
        provider_result,
        payload,
        settings.deck_analysis_instructions
      )
    end
  end

  defp analysis_source(args) do
    url = args |> Map.get(:url) |> trimmed_string()
    text = args |> Map.get(:text) |> trimmed_string()

    cond do
      present?(text) and String.length(text) <= 200_000 -> {:ok, "text", text}
      present?(text) -> {:error, "The pasted decklist is too large."}
      present?(url) and String.length(url) <= 2_000 -> {:ok, "url", url}
      present?(url) -> {:error, "The deck link is too long."}
      true -> {:error, "Paste a decklist or a supported link to analyze."}
    end
  end

  defp analysis_format(format)
       when format in ~w(commander standard pioneer modern legacy vintage pauper limited casual),
       do: {:ok, format}

  defp analysis_format(_format), do: {:error, "Choose a supported deck format."}

  defp external_deck_cards(entries) when is_list(entries) do
    cards_by_name = entries |> Enum.map(& &1.name) |> CardsByName.by_names()

    {deck_cards, unrecognized} =
      Enum.reduce(entries, {[], []}, fn entry, {deck_cards, unrecognized} ->
        case Map.get(cards_by_name, CardsByName.key(entry.name)) do
          nil ->
            {deck_cards, [entry.name | unrecognized]}

          card ->
            deck_card = %DeckCard{
              card: card,
              oracle_id: card.oracle_id,
              quantity: entry.quantity,
              zone: normalize_external_zone(entry.zone)
            }

            {[deck_card | deck_cards], unrecognized}
        end
      end)

    cond do
      unrecognized != [] ->
        {:error, unrecognized_cards_message(unrecognized)}

      Enum.any?(deck_cards, &DeckCard.counts_toward_deck_total?/1) ->
        {:ok, Enum.reverse(deck_cards)}

      true ->
        {:error, "The decklist does not contain any mainboard or commander cards."}
    end
  end

  defp analysis_source_name(source_name, source_type) do
    fallback = if source_type == "url", do: "Linked decklist", else: "Pasted decklist"

    source_name
    |> trimmed_string()
    |> case do
      nil -> fallback
      "" -> fallback
      name -> String.slice(name, 0, 200)
    end
  end

  defp normalize_external_zone(zone) when zone in ~w(mainboard commander considering), do: zone
  defp normalize_external_zone(_zone), do: "mainboard"

  defp unrecognized_cards_message(names) do
    names = names |> Enum.reverse() |> Enum.uniq()
    shown = names |> Enum.take(5) |> Enum.join(", ")
    suffix = if length(names) > 5, do: " and #{length(names) - 5} more", else: ""

    "These cards are not in the local catalog: #{shown}#{suffix}. Sync the catalog or correct the list and try again."
  end

  defp trimmed_string(value) when is_binary(value), do: String.trim(value)
  defp trimmed_string(_value), do: nil
  defp present?(value), do: is_binary(value) and value != ""

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
