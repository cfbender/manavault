defmodule Manavault.Catalog.OCRBenchmark do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog
  alias Manavault.Catalog.{ImageMatcher, Printing, ScanItem, ScanRecognition}
  alias Manavault.Repo

  @fixtures_dir Path.join([File.cwd!(), "test", "fixtures", "ocr", "scryfall_random"])
  @manifest_path Path.join(@fixtures_dir, "manifest.json")
  @user_agent "ManaVault/0.1 (+https://github.com/cfbender/manavault)"

  def fixtures_dir, do: @fixtures_dir
  def manifest_path, do: @manifest_path

  def download_random_fixtures(count \\ 200) do
    File.mkdir_p!(@fixtures_dir)

    existing = load_manifest()
    needed = max(count - length(existing), 0)

    cards =
      existing ++
        (needed
         |> sample_bulk_cards!()
         |> Enum.with_index(length(existing) + 1)
         |> Enum.map(fn {card, index} -> save_card_image!(card, index) end))

    cards = Enum.take(cards, count)
    write_manifest!(cards)
    {:ok, cards}
  end

  def run(opts \\ []) do
    Logger.configure(level: :warning)
    max_failures = Keyword.get(opts, :max_failures, :infinity)
    limit = Keyword.get(opts, :limit, :all)

    image_match? =
      Keyword.get(opts, :image_match, Application.get_env(:manavault, :scan_image_matching, true))

    title_fast_path? =
      Keyword.get(
        opts,
        :title_fast_path,
        Application.get_env(:manavault, :scan_title_ocr_fast_path, true)
      )

    full_ocr_fallback? =
      Keyword.get(
        opts,
        :full_ocr_fallback,
        Application.get_env(:manavault, :scan_full_ocr_fallback, true)
      )

    cards = load_manifest()

    if cards == [] do
      {:error, "No OCR fixtures found. Run `mix manavault.ocr.fixtures --count 200` first."}
    else
      Catalog.import_cards(Enum.map(cards, & &1["card"]))

      benchmark_cards = limit_cards(cards, limit)
      image_matcher = benchmark_image_matcher(benchmark_cards, image_match?)

      results =
        without_runtime_image_matching(fn ->
          Enum.map(
            benchmark_cards,
            &recognize_fixture(&1, image_matcher, title_fast_path?, full_ocr_fallback?)
          )
        end)

      failures = Enum.reject(results, & &1.correct?)

      limited_failures =
        case max_failures do
          :infinity -> failures
          max when is_integer(max) -> Enum.take(failures, max)
        end

      {:ok,
       %{
         total: length(results),
         correct: length(results) - length(failures),
         failed: length(failures),
         failures: limited_failures,
         results: results,
         timings: summarize_timings(results),
         report_path: write_report!(results, failures)
       }}
    end
  end

  defp limit_cards(cards, :all), do: cards
  defp limit_cards(cards, limit) when is_integer(limit), do: Enum.take(cards, limit)

  defp summarize_timings(results) do
    timing_keys = [
      :ocr_us,
      :title_ocr_us,
      :full_ocr_us,
      :parse_us,
      :image_us,
      :match_us,
      :total_us
    ]

    timing_keys
    |> Map.new(fn key ->
      values = results |> Enum.map(&get_in(&1, [:timings, key])) |> Enum.reject(&is_nil/1)
      {key, average(values)}
    end)
    |> Map.put(
      :title_fast_path_count,
      Enum.count(results, &(get_in(&1, [:timings, :title_ocr_fast_path]) == true))
    )
    |> Map.put(
      :title_fallback_count,
      Enum.count(results, &(get_in(&1, [:timings, :title_ocr_fast_path]) == false))
    )
  end

  defp average([]), do: nil
  defp average(values), do: Enum.sum(values) / length(values)

  defp benchmark_image_matcher(_cards, false), do: nil

  defp benchmark_image_matcher(cards, true) do
    references = ImageMatcher.build_references(cards)

    fn image_path ->
      ImageMatcher.match(image_path, references, limit: 8, threshold: 0.68)
    end
  end

  defp without_runtime_image_matching(fun) do
    previous = Application.fetch_env(:manavault, :scan_image_matching)
    Application.put_env(:manavault, :scan_image_matching, false)

    try do
      fun.()
    after
      restore_scan_image_matching(previous)
    end
  end

  defp restore_scan_image_matching({:ok, value}) do
    Application.put_env(:manavault, :scan_image_matching, value)
  end

  defp restore_scan_image_matching(:error) do
    Application.delete_env(:manavault, :scan_image_matching)
  end

  defp recognize_fixture(
         %{"image_path" => image_path, "card" => card} = fixture,
         image_matcher,
         title_fast_path?,
         full_ocr_fallback?
       ) do
    expected_name = card["name"]
    expected_printing_id = card["id"]

    opts =
      [
        max_candidates: 5,
        title_ocr_fast_path: title_fast_path?,
        full_ocr_fallback: full_ocr_fallback?
      ]
      |> maybe_put_image_matcher(image_matcher)

    case ScanRecognition.recognize(%ScanItem{image_path: image_path}, opts) do
      {:ok, %{text: text, parsed: parsed, candidates: [top | _] = candidates} = result} ->
        %{
          fixture: fixture,
          expected_name: expected_name,
          expected_printing_id: expected_printing_id,
          actual_name: top.printing.card.name,
          actual_printing_id: top.printing.scryfall_id,
          confidence: top.confidence,
          correct?:
            top.printing.oracle_id == card["oracle_id"] or
              top.printing.scryfall_id == expected_printing_id,
          text: text,
          parsed: parsed,
          image_matches: Map.get(result, :image_matches, []),
          timings: Map.get(result, :timings, %{}),
          candidates: Enum.map(candidates, &candidate_summary/1)
        }

      {:ok, %{text: text, parsed: parsed, candidates: []} = result} ->
        %{
          fixture: fixture,
          expected_name: expected_name,
          expected_printing_id: expected_printing_id,
          actual_name: nil,
          actual_printing_id: nil,
          confidence: nil,
          correct?: false,
          text: text,
          parsed: parsed,
          timings: Map.get(result, :timings, %{}),
          candidates: []
        }

      {:error, reason} ->
        %{
          fixture: fixture,
          expected_name: expected_name,
          expected_printing_id: expected_printing_id,
          actual_name: nil,
          actual_printing_id: nil,
          confidence: nil,
          correct?: false,
          error: reason,
          text: "",
          parsed: %{},
          image_matches: [],
          candidates: []
        }
    end
  end

  defp maybe_put_image_matcher(opts, nil), do: opts

  defp maybe_put_image_matcher(opts, image_matcher),
    do: Keyword.put(opts, :image_matcher, image_matcher)

  defp candidate_summary(candidate) do
    %{
      name: candidate.printing.card.name,
      printing_id: candidate.printing.scryfall_id,
      oracle_id: candidate.printing.oracle_id,
      set: candidate.printing.set_code,
      collector_number: candidate.printing.collector_number,
      confidence: candidate.confidence,
      scores: candidate.evidence.scores
    }
  end

  defp write_report!(results, failures) do
    path = Path.join(@fixtures_dir, "benchmark-report.json")

    report = %{
      total: length(results),
      correct: length(results) - length(failures),
      failed: length(failures),
      failures: failures
    }

    File.write!(path, Jason.encode!(report, pretty: true))
    path
  end

  defp save_card_image!(card, index) do
    image_url = image_url!(card)
    ext = image_url |> URI.parse() |> Map.get(:path, "") |> Path.extname()
    ext = if ext in [".jpg", ".jpeg", ".png", ".webp"], do: ext, else: ".jpg"

    filename =
      "#{String.pad_leading(Integer.to_string(index), 3, "0")}-#{slug(card["name"])}-#{card["id"]}#{ext}"

    path = Path.join(@fixtures_dir, filename)

    unless File.exists?(path) do
      body = fetch_binary!(image_url)
      File.write!(path, body)
    end

    %{
      "image_path" => path,
      "image_url" => image_url,
      "card" => card
    }
  end

  defp sample_bulk_cards!(0), do: []

  defp sample_bulk_cards!(count) do
    rows =
      Printing
      |> join(:inner, [printing], card in assoc(printing, :card))
      |> where([printing, _card], printing.lang == "en")
      |> where([printing, _card], not is_nil(printing.image_uris))
      |> preload([_printing, card], card: card)
      |> Repo.all()
      |> Enum.map(&printing_fixture_card/1)
      |> Enum.filter(&fixture_card?/1)
      |> Enum.shuffle()
      |> Enum.take(count)

    if length(rows) < count do
      raise "Only #{length(rows)} local catalog printings have image fixtures; run `mix manavault.scryfall.sync` first."
    end

    rows
  end

  defp printing_fixture_card(%Printing{} = printing) do
    %{
      "id" => printing.scryfall_id,
      "oracle_id" => printing.oracle_id,
      "name" => printing.card.name,
      "type_line" => printing.card.type_line,
      "oracle_text" => printing.card.oracle_text,
      "color_identity" => decode_json(printing.card.color_identity, []),
      "legalities" => decode_json(printing.card.legalities, %{}),
      "set" => printing.set_code,
      "set_name" => printing.set_name,
      "collector_number" => printing.collector_number,
      "lang" => printing.lang,
      "finishes" => decode_json(printing.finishes, []),
      "image_uris" => decode_json(printing.image_uris, %{}),
      "prices" => decode_json(printing.prices, %{}),
      "released_at" =>
        if(printing.released_at, do: Date.to_iso8601(printing.released_at), else: nil)
    }
  end

  defp fixture_card?(card) do
    is_binary(card["id"]) and is_binary(card["oracle_id"]) and is_binary(card["name"]) and
      image_available?(card)
  end

  defp image_available?(card) do
    try do
      image_url!(card)
      true
    rescue
      RuntimeError -> false
    end
  end

  defp fetch_binary!(url) do
    case Req.get(url,
           headers: [{"user-agent", @user_agent}],
           retry: :transient,
           max_retries: 3
         ) do
      {:ok, %{status: status, body: body}} when status in 200..299 and is_binary(body) ->
        body

      {:ok, %{status: status}} ->
        raise "Image download failed with HTTP #{status}: #{url}"

      {:error, reason} ->
        raise "Image download failed for #{url}: #{inspect(reason)}"
    end
  end

  defp decode_json(value, fallback) when is_binary(value) do
    case Jason.decode(value) do
      {:ok, decoded} -> decoded
      {:error, _reason} -> fallback
    end
  end

  defp decode_json(_value, fallback), do: fallback

  defp image_url!(%{"image_uris" => %{"normal" => url}}), do: url
  defp image_url!(%{"image_uris" => %{"large" => url}}), do: url
  defp image_url!(%{"image_uris" => %{"png" => url}}), do: url

  defp image_url!(%{"card_faces" => faces}) when is_list(faces) do
    faces
    |> Enum.find_value(fn face ->
      case face do
        %{"image_uris" => %{"normal" => url}} -> url
        %{"image_uris" => %{"large" => url}} -> url
        %{"image_uris" => %{"png" => url}} -> url
        _ -> nil
      end
    end) || raise "Card has no downloadable image"
  end

  defp image_url!(_card), do: raise("Card has no downloadable image")

  defp load_manifest do
    if File.exists?(@manifest_path) do
      @manifest_path
      |> File.read!()
      |> Jason.decode!()
      |> Enum.map(&normalize_fixture_path/1)
    else
      []
    end
  end

  defp write_manifest!(cards) do
    File.write!(@manifest_path, Jason.encode!(Enum.map(cards, &portable_fixture/1), pretty: true))
  end

  defp normalize_fixture_path(%{"image_path" => image_path} = fixture)
       when is_binary(image_path) do
    normalized_path =
      cond do
        Path.type(image_path) == :absolute and File.exists?(image_path) ->
          image_path

        Path.type(image_path) == :relative ->
          Path.expand(image_path, @fixtures_dir)

        true ->
          Path.join(@fixtures_dir, Path.basename(image_path))
      end

    Map.put(fixture, "image_path", normalized_path)
  end

  defp normalize_fixture_path(fixture), do: fixture

  defp portable_fixture(%{"image_path" => image_path} = fixture) when is_binary(image_path) do
    Map.put(fixture, "image_path", Path.basename(image_path))
  end

  defp portable_fixture(fixture), do: fixture

  defp slug(value) do
    value
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/, "-")
    |> String.trim("-")
    |> String.slice(0, 60)
  end
end
