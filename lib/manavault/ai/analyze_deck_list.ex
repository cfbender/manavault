defmodule Manavault.AI.AnalyzeDeckList do
  @moduledoc false

  alias Manavault.AI.{AnalyzeDeck, DeckAnalysis, DeckAnalysisRequest, UpdateSettings}
  alias Manavault.Catalog.{Deck, DeckCard}
  alias Manavault.Catalog.Search.CardsByName
  alias Manavault.Repo
  alias Manavault.Trade.Lists

  def run(args) when is_map(args) do
    settings = UpdateSettings.settings()

    with {:ok, source_type, source} <- analysis_source(args),
         {:ok, format} <- analysis_format(Map.get(args, :format)),
         :ok <- UpdateSettings.configured(settings),
         {:ok, %{source_name: source_name, entries: entries}} <- resolve(source_type, source),
         {:ok, deck_cards} <- external_deck_cards(entries),
         source_name <- analysis_source_name(source_name, source_type),
         deck <- %Deck{name: source_name, format: format},
         payload <- DeckAnalysis.payload(deck, deck_cards),
         {:ok, result} <- AnalyzeDeck.analyze_payload(settings, payload) do
      insert_request(source_type, source, source_name, format, result, settings.model)
    end
  end

  defp resolve(source_type, source) do
    Lists.resolve(%{
      url: if(source_type == "url", do: source),
      text: if(source_type == "text", do: source)
    })
  end

  defp insert_request(source_type, source, source_name, format, result, model) do
    %DeckAnalysisRequest{}
    |> DeckAnalysisRequest.changeset(%{
      source_type: source_type,
      source: source,
      source_name: source_name,
      format: format,
      analysis: DeckAnalysis.render_markdown(result),
      model: model,
      commander_bracket: result.official_bracket,
      commander_bracket_estimate: result.play_bracket
    })
    |> Repo.insert()
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

  defp external_deck_cards(entries) do
    cards_by_name = entries |> Enum.map(& &1.name) |> CardsByName.by_names()

    {deck_cards, unrecognized} =
      Enum.reduce(entries, {[], []}, fn entry, {deck_cards, unrecognized} ->
        case Map.get(cards_by_name, CardsByName.key(entry.name)) do
          nil -> {deck_cards, [entry.name | unrecognized]}
          card -> {[external_deck_card(entry, card) | deck_cards], unrecognized}
        end
      end)

    validate_deck_cards(deck_cards, unrecognized)
  end

  defp external_deck_card(entry, card) do
    %DeckCard{
      card: card,
      oracle_id: card.oracle_id,
      quantity: entry.quantity,
      zone: normalize_external_zone(entry.zone)
    }
  end

  defp validate_deck_cards(deck_cards, []) do
    if Enum.any?(deck_cards, &DeckCard.counts_toward_deck_total?/1),
      do: {:ok, Enum.reverse(deck_cards)},
      else: {:error, "The decklist does not contain any mainboard or commander cards."}
  end

  defp validate_deck_cards(_deck_cards, unrecognized),
    do: {:error, unrecognized_cards_message(unrecognized)}

  defp analysis_source_name(source_name, source_type) do
    fallback = if source_type == "url", do: "Linked decklist", else: "Pasted decklist"

    case trimmed_string(source_name) do
      name when name in [nil, ""] -> fallback
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
end
