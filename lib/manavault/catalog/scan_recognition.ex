defmodule Manavault.Catalog.ScanRecognition do
  @moduledoc """
  Server-side OCR and local Scryfall matching for captured scan images.
  """

  import Ecto.Query

  alias Manavault.Catalog.{Card, Printing, ScanItem}
  alias Manavault.Repo

  @default_max_candidates 5

  def recognize(scan_item, opts \\ [])

  def recognize(%ScanItem{image_path: image_path} = scan_item, opts)
      when is_binary(image_path) do
    with {:ok, text} <- run_ocr(image_path, opts) do
      parsed = parse_text(text)
      candidates = match_candidates(parsed, opts)
      {:ok, %{scan_item: scan_item, text: text, parsed: parsed, candidates: candidates}}
    end
  end

  def recognize(%ScanItem{} = scan_item, _opts) do
    {:ok, %{scan_item: scan_item, text: "", parsed: %{}, candidates: []}}
  end

  def parse_text(text) when is_binary(text) do
    lines =
      text
      |> String.split(~r/\R/, trim: true)
      |> Enum.map(&String.trim/1)
      |> Enum.reject(&(&1 == ""))

    joined = Enum.join(lines, "\n")

    %{
      text: joined,
      name: likely_name(lines),
      set_code: likely_set_code(joined),
      collector_number: likely_collector_number(joined),
      language: likely_language(joined)
    }
  end

  def match_candidates(parsed, opts \\ []) when is_map(parsed) do
    max_candidates = Keyword.get(opts, :max_candidates, @default_max_candidates)
    name = parsed |> Map.get(:name) |> normalize_text()
    set_code = parsed |> Map.get(:set_code) |> normalize_set_code()
    collector_number = parsed |> Map.get(:collector_number) |> normalize_collector_number()
    language = parsed |> Map.get(:language) |> normalize_language()

    Printing
    |> join(:inner, [printing], card in assoc(printing, :card))
    |> maybe_candidate_name(name)
    |> maybe_candidate_set(set_code)
    |> maybe_candidate_collector(collector_number)
    |> preload([_printing, card], card: card)
    |> limit(^max(max_candidates * 5, max_candidates))
    |> Repo.all()
    |> Enum.map(&score_candidate(&1, parsed, name, set_code, collector_number, language))
    |> Enum.filter(&(&1.confidence > 0.0))
    |> Enum.sort_by(&{-&1.confidence, &1.printing.scryfall_id})
    |> Enum.take(max_candidates)
  end

  defp run_ocr(image_path, opts) do
    runner = Keyword.get(opts, :ocr_runner, configured_ocr_runner())

    case runner.(image_path) do
      {:ok, text} when is_binary(text) -> {:ok, text}
      {:error, reason} -> {:error, format_reason(reason)}
      other -> {:error, "OCR returned an unexpected result: #{inspect(other)}"}
    end
  rescue
    exception -> {:error, Exception.message(exception)}
  end

  defp configured_ocr_runner do
    Application.get_env(:manavault, :ocr_runner, &tesseract_ocr/1)
  end

  defp tesseract_ocr(image_path) do
    case System.cmd("tesseract", [image_path, "stdout"], stderr_to_stdout: true) do
      {text, 0} -> {:ok, text}
      {output, status} -> {:error, "tesseract exited with #{status}: #{String.trim(output)}"}
    end
  rescue
    ErlangError -> {:error, "tesseract executable is not available"}
  end

  defp likely_name([]), do: nil

  defp likely_name(lines) do
    Enum.find(lines, fn line ->
      clean = String.trim(line)

      String.length(clean) >= 3 and String.match?(clean, ~r/[[:alpha:]]/u) and
        not String.match?(clean, ~r/^\d+[a-zA-Z]?\/?\d*$/)
    end)
  end

  defp likely_set_code(text) do
    case Regex.run(~r/(?:set|edition|expansion)\s*[:#-]?\s*([A-Z0-9]{2,5})/i, text) do
      [_, code] -> code
      _ -> nil
    end
  end

  defp likely_collector_number(text) do
    case Regex.run(~r/(?:collector|number|#)\s*[:#-]?\s*([0-9]+[a-zA-Z]?)/i, text) do
      [_, number] ->
        number

      _ ->
        case Regex.run(~r/\b([0-9]{1,4}[a-zA-Z]?)\s*\/\s*[0-9]{1,4}\b/, text) do
          [_, number] -> number
          _ -> nil
        end
    end
  end

  defp likely_language(text) do
    case Regex.run(~r/\b(?:language|lang)\b\s*[:#-]?\s*([a-z]{2})/i, text) do
      [_, language] -> language
      _ -> nil
    end
  end

  defp maybe_candidate_name(query, ""), do: query

  defp maybe_candidate_name(query, name) do
    pattern = "%#{name}%"
    where(query, [_printing, card], fragment("lower(?) LIKE ?", card.name, ^pattern))
  end

  defp maybe_candidate_set(query, ""), do: query

  defp maybe_candidate_set(query, set_code),
    do: where(query, [printing, _card], printing.set_code == ^set_code)

  defp maybe_candidate_collector(query, ""), do: query

  defp maybe_candidate_collector(query, collector_number) do
    where(query, [printing, _card], printing.collector_number == ^collector_number)
  end

  defp score_candidate(
         %Printing{card: %Card{name: card_name}} = printing,
         parsed,
         name,
         set_code,
         collector_number,
         language
       ) do
    name_score = name_score(card_name, name)
    set_score = field_score(printing.set_code, set_code, 0.2)
    collector_score = field_score(printing.collector_number, collector_number, 0.25)
    language_score = field_score(printing.lang, language, 0.05)

    confidence = min(name_score + set_score + collector_score + language_score, 1.0)

    %{
      printing: printing,
      confidence: confidence,
      evidence: %{
        ocr_text: Map.get(parsed, :text, ""),
        parsed_name: Map.get(parsed, :name),
        parsed_set_code: Map.get(parsed, :set_code),
        parsed_collector_number: Map.get(parsed, :collector_number),
        parsed_language: Map.get(parsed, :language),
        matched_name: card_name,
        matched_set_code: printing.set_code,
        matched_collector_number: printing.collector_number,
        scores: %{
          name: name_score,
          set_code: set_score,
          collector_number: collector_score,
          language: language_score
        }
      }
    }
  end

  defp name_score(_card_name, ""), do: 0.0

  defp name_score(card_name, parsed_name) do
    normalized_card = normalize_text(card_name)

    cond do
      normalized_card == parsed_name -> 0.65
      String.contains?(normalized_card, parsed_name) -> 0.55
      String.contains?(parsed_name, normalized_card) -> 0.5
      true -> 0.0
    end
  end

  defp field_score(_actual, "", _score), do: 0.0

  defp field_score(actual, expected, score) when is_binary(actual) do
    if normalize_text(actual) == expected, do: score, else: 0.0
  end

  defp field_score(_actual, _expected, _score), do: 0.0

  defp normalize_set_code(nil), do: ""
  defp normalize_set_code(value), do: value |> normalize_text() |> String.downcase()

  defp normalize_collector_number(nil), do: ""
  defp normalize_collector_number(value), do: normalize_text(value)

  defp normalize_language(nil), do: ""
  defp normalize_language(value), do: value |> normalize_text() |> String.downcase()

  defp normalize_text(nil), do: ""

  defp normalize_text(value) when is_binary(value) do
    value
    |> String.trim()
    |> String.downcase()
  end

  defp format_reason(reason) when is_binary(reason), do: reason
  defp format_reason(reason), do: inspect(reason)
end
