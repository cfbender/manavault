defmodule Manavault.Catalog.ScanRecognition do
  @moduledoc """
  Server-side OCR and local Scryfall matching for captured scan images.
  """

  import Ecto.Query
  require Logger

  alias Manavault.Catalog.{Card, Printing, RuntimeImageMatcher, ScanItem}
  alias Manavault.Repo

  @default_max_candidates 5
  @title_ocr_min_confidence 0.7
  @min_token_length 3
  @max_candidate_tokens 20
  @phrase_min_words 2

  @noise_tokens ~w(
    the and for was are its has had not but all can may new
    any you his her our out use how who why what when where which
    from have been were they them this that with each more some
    about other their being also into only over than then under
    very will just like make made come take know look part same
    such most even much must both does your who get got put let
    see say way too old few big day now off she him ago did had
    has per saw try yet nor own
  )

  def recognize(scan_item, opts \\ [])

  def recognize(%ScanItem{image_path: image_path} = scan_item, opts)
      when is_binary(image_path) do
    if title_ocr_fast_path?(opts) do
      recognize_with_title_ocr(scan_item, image_path, opts)
    else
      recognize_with_full_ocr(scan_item, image_path, opts)
    end
  end

  def recognize(%ScanItem{} = scan_item, _opts) do
    {:ok, %{scan_item: scan_item, text: "", parsed: %{}, candidates: []}}
  end

  defp recognize_with_full_ocr(scan_item, image_path, opts) do
    case timed(fn -> run_ocr(image_path, Keyword.delete(opts, :ocr_crop)) end) do
      {:ok, text, ocr_us} ->
        Logger.debug("OCR raw output for #{image_path}:\n#{text}")
        recognize_with_text(scan_item, text, image_path, opts, ocr_us)

      {:error, reason} ->
        recognize_after_ocr_error(scan_item, image_path, opts, reason)
    end
  end

  defp recognize_with_title_ocr(scan_item, image_path, opts) do
    title_opts = opts |> Keyword.put(:ocr_crop, :title) |> Keyword.put(:skip_image_matching, true)

    case timed(fn -> run_ocr(image_path, title_opts) end) do
      {:ok, text, title_ocr_us} ->
        Logger.debug("Title OCR raw output for #{image_path}:\n#{text}")

        {:ok, recognition} =
          recognize_with_text(scan_item, text, image_path, title_opts, title_ocr_us)

        recognition = put_title_ocr_timing(recognition, title_ocr_us, nil, true)

        if title_ocr_confident?(recognition, opts) do
          {:ok, recognition}
        else
          fallback_to_full_ocr(scan_item, image_path, opts, title_ocr_us, :weak_title_match)
        end

      {:error, reason} ->
        fallback_to_full_ocr(scan_item, image_path, opts, nil, {:title_ocr_error, reason})
    end
  end

  defp fallback_to_full_ocr(scan_item, image_path, opts, title_ocr_us, fallback_reason) do
    case recognize_with_full_ocr(scan_item, image_path, opts) do
      {:ok, recognition} ->
        {:ok, put_title_ocr_timing(recognition, title_ocr_us, fallback_reason, false)}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp timed(fun) do
    start = System.monotonic_time(:microsecond)

    case fun.() do
      {:ok, value} -> {:ok, value, System.monotonic_time(:microsecond) - start}
      {:error, reason} -> {:error, reason}
    end
  end

  defp timed_value(fun) do
    start = System.monotonic_time(:microsecond)
    value = fun.()
    {value, System.monotonic_time(:microsecond) - start}
  end

  defp title_ocr_fast_path?(opts) do
    Keyword.get(
      opts,
      :title_ocr_fast_path,
      Application.get_env(:manavault, :scan_title_ocr_fast_path, true)
    ) and ocr_runner_supports_options?(Keyword.get(opts, :ocr_runner, configured_ocr_runner()))
  end

  defp ocr_runner_supports_options?(runner), do: is_function(runner, 2)

  defp title_ocr_confident?(%{candidates: [top | _rest], parsed: parsed}, opts) do
    top.confidence >= Keyword.get(opts, :title_ocr_min_confidence, @title_ocr_min_confidence) and
      title_text_matches_card_name?(parsed, top.printing.card.name)
  end

  defp title_ocr_confident?(_recognition, _opts), do: false

  defp title_text_matches_card_name?(parsed, card_name) when is_binary(card_name) do
    title_text =
      parsed
      |> Map.get(:lines, [])
      |> Enum.take(4)
      |> Enum.join(" ")

    title_compact = compact_alpha(title_text)
    name_compact = compact_alpha(card_name)
    title_tokens = meaningful_token_set(title_text)
    name_tokens = meaningful_token_set(card_name)

    (title_compact != "" and title_compact == name_compact) or
      (MapSet.size(title_tokens) > 0 and title_tokens == name_tokens)
  end

  defp title_text_matches_card_name?(_parsed, _card_name), do: false

  defp compact_alpha(text) do
    text
    |> normalize_text()
    |> String.replace(~r/[^a-z]+/, "")
  end

  defp meaningful_token_set(text) do
    text
    |> normalize_text()
    |> String.split(~r/\s+/, trim: true)
    |> Enum.reject(fn token ->
      String.length(token) < @min_token_length or token in @noise_tokens or
        String.match?(token, ~r/^\d+$/)
    end)
    |> MapSet.new()
  end

  defp put_title_ocr_timing(%{timings: timings} = recognition, title_ocr_us, reason, fast_path?) do
    timings =
      timings
      |> maybe_add_title_ocr_to_totals(title_ocr_us, fast_path?)
      |> Map.put(:title_ocr_us, title_ocr_us)
      |> Map.put(:full_ocr_us, if(fast_path?, do: nil, else: Map.get(timings, :ocr_us)))
      |> Map.put(:title_ocr_fast_path, fast_path?)
      |> Map.put(:title_ocr_fallback_reason, format_fallback_reason(reason))

    Map.put(recognition, :timings, timings)
  end

  defp maybe_add_title_ocr_to_totals(timings, _title_ocr_us, true), do: timings
  defp maybe_add_title_ocr_to_totals(timings, nil, false), do: timings

  defp maybe_add_title_ocr_to_totals(timings, title_ocr_us, false) do
    timings
    |> Map.update(:ocr_us, title_ocr_us, fn
      nil -> title_ocr_us
      ocr_us -> ocr_us + title_ocr_us
    end)
    |> Map.update(:total_us, title_ocr_us, &(&1 + title_ocr_us))
  end

  defp format_fallback_reason(nil), do: nil
  defp format_fallback_reason(reason) when is_atom(reason), do: Atom.to_string(reason)

  defp format_fallback_reason({reason, detail}),
    do: "#{format_fallback_reason(reason)}: #{detail}"

  defp format_fallback_reason(reason), do: to_string(reason)

  defp recognize_with_text(scan_item, text, image_path, opts, ocr_us) do
    {parsed, parse_us} = timed_value(fn -> parse_text(text) end)

    {initial_image_matches, image_us} =
      timed_value(fn -> run_initial_image_matching(image_path, opts) end)

    {initial_candidates, initial_match_us} =
      timed_value(fn ->
        match_candidates(parsed, Keyword.put(opts, :image_matches, initial_image_matches))
      end)

    {candidate_image_matches, candidate_image_us} =
      timed_value(fn -> run_candidate_image_matching(image_path, opts, initial_candidates) end)

    {candidates, rematch_us} =
      if candidate_image_matches == [] do
        {initial_candidates, 0}
      else
        timed_value(fn ->
          match_candidates(parsed, Keyword.put(opts, :image_matches, candidate_image_matches))
        end)
      end

    image_matches =
      if candidate_image_matches == [], do: initial_image_matches, else: candidate_image_matches

    image_us = image_us + candidate_image_us
    match_us = initial_match_us + rematch_us

    {:ok,
     %{
       scan_item: scan_item,
       text: text,
       parsed: parsed,
       image_matches: image_matches,
       candidates: candidates,
       timings: %{
         ocr_us: ocr_us,
         parse_us: parse_us,
         image_us: image_us,
         match_us: match_us,
         total_us: ocr_us + parse_us + image_us + match_us
       }
     }}
  end

  defp recognize_after_ocr_error(scan_item, image_path, opts, reason) do
    {parsed, parse_us} = timed_value(fn -> parse_text("") end)

    {image_matches, image_us} =
      timed_value(fn -> run_initial_image_matching(image_path, opts) end)

    {candidates, match_us} =
      timed_value(fn ->
        match_candidates(parsed, Keyword.put(opts, :image_matches, image_matches))
      end)

    if candidates == [] do
      {:error, reason}
    else
      {:ok,
       %{
         scan_item: scan_item,
         text: "",
         parsed: parsed,
         image_matches: image_matches,
         candidates: candidates,
         timings: %{
           ocr_us: nil,
           parse_us: parse_us,
           image_us: image_us,
           match_us: match_us,
           total_us: parse_us + image_us + match_us
         }
       }}
    end
  end

  def parse_text(text) when is_binary(text) do
    raw_lines =
      text
      |> String.split(~r/\R/, trim: true)
      |> Enum.map(&String.trim/1)

    # Filter footer/garbage lines for token extraction, but keep raw text
    # for collector number / set code extraction (those live in the footer).
    clean_lines = Enum.reject(raw_lines, &(&1 == "" or ignored_ocr_line?(&1)))
    joined = Enum.join(clean_lines, "\n")
    raw_joined = Enum.join(raw_lines, "\n")

    %{
      text: joined,
      tokens: extract_ocr_tokens(joined),
      lines: clean_lines,
      set_code: likely_set_code(raw_joined),
      collector_number: likely_collector_number(raw_joined),
      language: likely_language(raw_joined)
    }
  end

  defp extract_ocr_tokens(text) do
    text
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9\s]/, " ")
    |> String.split(~r/\s+/, trim: true)
    |> Enum.reject(fn token ->
      String.length(token) < @min_token_length or
        token in @noise_tokens or
        String.match?(token, ~r/^\d+$/)
    end)
    |> Enum.uniq()
    |> Enum.take(@max_candidate_tokens)
  end

  def match_candidates(parsed, opts \\ []) when is_map(parsed) do
    max_candidates = Keyword.get(opts, :max_candidates, @default_max_candidates)
    tokens = parsed |> Map.get(:tokens, [])
    lines = parsed |> Map.get(:lines, [])
    set_code = parsed |> Map.get(:set_code) |> normalize_set_code()
    collector_number = parsed |> Map.get(:collector_number) |> normalize_collector_number()
    language = parsed |> Map.get(:language) |> normalize_language()
    image_matches = Keyword.get(opts, :image_matches, [])
    image_match_by_printing_id = image_match_by_printing_id(image_matches)
    set_codes = opts |> Keyword.get(:set_codes, []) |> normalize_set_codes()

    Logger.debug(fn ->
      "OCR match_candidates — tokens: #{inspect(tokens)}, lines: #{inspect(lines)}, set_code: #{inspect(set_code)}, collector_number: #{inspect(collector_number)}, language: #{inspect(language)}\nOCR raw text:\n#{Map.get(parsed, :text, "")}"
    end)

    printings = candidate_printings(tokens, lines, max_candidates, image_matches, set_codes)

    candidates =
      printings
      |> Enum.map(
        &score_candidate(
          &1,
          parsed,
          tokens,
          lines,
          set_code,
          collector_number,
          language,
          image_match_by_printing_id
        )
      )
      |> Enum.filter(&candidate_has_recognition_evidence?/1)
      |> Enum.sort_by(&candidate_sort_key/1)

    Logger.debug(fn ->
      top = Enum.take(candidates, 3)

      breakdowns =
        Enum.map(top, fn c ->
          s = c.evidence.scores

          "#{c.printing.card.name} (#{c.printing.set_code} ##{c.printing.collector_number}) " <>
            "conf=#{round_score(c.confidence)} " <>
            "t=#{round_score(s.token_match)} p=#{round_score(s.phrase_match)} " <>
            "set=#{round_score(s.set_code)} col=#{round_score(s.collector_number)}"
        end)

      "Top candidates:\n  #{Enum.join(breakdowns, "\n  ")}"
    end)

    Enum.take(candidates, max_candidates)
  end

  defp candidate_has_recognition_evidence?(%{evidence: %{scores: scores}}) do
    float_score(scores.token_match) > 0.0 or float_score(scores.phrase_match) > 0.0 or
      float_score(scores.image_match) > 0.0
  end

  defp candidate_printings(tokens, lines, max_candidates, image_matches, set_codes) do
    locked_sets? = set_codes != []

    priority_ids =
      lines
      |> priority_fts_query()
      |> search_printing_ids(max(max_candidates * if(locked_sets?, do: 30, else: 10), 50))

    ids =
      if !locked_sets? and length(priority_ids) >= max_candidates do
        priority_ids
      else
        broad_ids =
          tokens
          |> broad_fts_query(lines)
          |> search_printing_ids(max(max_candidates * if(locked_sets?, do: 80, else: 40), 200))

        (priority_ids ++ broad_ids)
        |> Enum.uniq()
      end

    image_ids = Enum.map(image_matches, & &1.scryfall_id)

    load_printings_by_ids(ids, set_codes)
    |> then(fn printings ->
      missing_image_ids =
        image_ids -- Enum.map(printings, & &1.scryfall_id)

      printings ++ load_printings_by_ids(missing_image_ids, set_codes)
    end)
  end

  defp search_printing_ids("", _limit), do: []

  defp search_printing_ids(query, limit) do
    %{rows: rows} =
      Repo.query!(
        """
        SELECT scryfall_id
        FROM scryfall_printing_search
        WHERE scryfall_printing_search MATCH ?
        ORDER BY bm25(scryfall_printing_search)
        LIMIT ?
        """,
        [query, limit]
      )

    Enum.map(rows, fn [scryfall_id] -> scryfall_id end)
  rescue
    _exception -> []
  end

  defp load_printings_by_ids([], _set_codes), do: []

  defp load_printings_by_ids(ids, set_codes) do
    Printing
    |> join(:inner, [printing], card in assoc(printing, :card))
    |> where([printing, _card], printing.scryfall_id in ^ids)
    |> maybe_filter_set_codes(set_codes)
    |> preload([_printing, card], card: card)
    |> Repo.all()
  end

  defp maybe_filter_set_codes(query, []), do: query

  defp maybe_filter_set_codes(query, set_codes) do
    where(query, [printing, _card], printing.set_code in ^set_codes)
  end

  defp priority_fts_query(lines) do
    lines
    |> Enum.take(1)
    |> Enum.flat_map(&line_variants/1)
    |> Enum.filter(&(phrase_word_count(&1) >= @phrase_min_words))
    |> Enum.flat_map(&fts_terms/1)
    |> Enum.uniq()
    |> Enum.take(8)
    |> fts_or_query()
  end

  defp broad_fts_query(tokens, lines) do
    (title_name_candidates(lines) ++ tokens)
    |> Enum.flat_map(&fts_terms/1)
    |> Enum.uniq()
    |> Enum.take(24)
    |> fts_or_query()
  end

  defp fts_or_query(terms) do
    terms
    |> Enum.map_join(" OR ", &~s("#{String.replace(&1, ~s("), ~s(""))}"))
  end

  defp fts_terms(value) when is_binary(value) do
    normalized =
      value
      |> normalize_text()
      |> String.replace(~r/[^a-z0-9\s]+/u, " ")
      |> String.replace(~r/\s+/, " ")
      |> String.trim()

    compact = compact_text(value)

    [normalized, compact]
    |> Enum.reject(fn term -> String.length(term) < @min_token_length end)
  end

  defp title_name_candidates(lines) do
    normalized_lines = Enum.flat_map(lines, &line_variants/1)
    title_line_candidates = lines |> Enum.take(1) |> Enum.flat_map(&line_variants/1)

    joined_title_lines =
      normalized_lines
      |> Enum.take(5)
      |> Enum.chunk_every(2, 1, :discard)
      |> Enum.map(&Enum.join(&1, " "))

    (title_line_candidates ++ normalized_lines ++ joined_title_lines)
    |> Enum.filter(fn candidate ->
      candidate in title_line_candidates or phrase_word_count(candidate) >= @phrase_min_words or
        compact_name_candidate?(candidate)
    end)
    |> Enum.uniq()
  end

  defp line_variants(line) do
    [normalize_text(line), normalize_titleish_text(line)]
    |> Enum.reject(&(&1 == ""))
    |> Enum.uniq()
  end

  defp run_ocr(image_path, opts) do
    runner = Keyword.get(opts, :ocr_runner, configured_ocr_runner())

    result = run_ocr_runner(runner, image_path, opts)

    case result do
      {:ok, text} when is_binary(text) -> {:ok, clean_ocr_text(text)}
      {:error, reason} -> {:error, format_reason(reason)}
      other -> {:error, "OCR returned an unexpected result: #{inspect(other)}"}
    end
  rescue
    exception -> {:error, Exception.message(exception)}
  end

  defp run_ocr_runner(runner, image_path, opts) when is_function(runner, 2) do
    runner.(image_path, Keyword.take(opts, [:ocr_crop]))
  end

  defp run_ocr_runner(runner, image_path, _opts) when is_function(runner, 1) do
    runner.(image_path)
  end

  defp run_initial_image_matching(image_path, opts) do
    cond do
      Keyword.get(opts, :skip_image_matching, false) ->
        []

      matches = Keyword.get(opts, :image_matches) ->
        normalize_image_matches(matches)

      matcher = image_matcher(opts, 1) ->
        matcher
        |> apply([image_path])
        |> normalize_image_matches()

      image_matching_enabled?() ->
        []

      true ->
        []
    end
  rescue
    exception ->
      Logger.warning("Image matching failed for #{image_path}: #{Exception.message(exception)}")
      []
  end

  defp run_candidate_image_matching(image_path, opts, candidates) do
    printings = Enum.map(candidates, & &1.printing)

    cond do
      Keyword.get(opts, :skip_image_matching, false) ->
        []

      Keyword.has_key?(opts, :image_matches) ->
        []

      matcher = image_matcher(opts, 2) ->
        matcher
        |> apply([image_path, printings])
        |> normalize_image_matches()

      image_matching_enabled?() ->
        RuntimeImageMatcher.match(image_path, printings)
        |> normalize_image_matches()

      true ->
        []
    end
  rescue
    exception ->
      Logger.warning(
        "Candidate image matching failed for #{image_path}: #{Exception.message(exception)}"
      )

      []
  end

  defp image_matcher(opts, arity) do
    cond do
      is_function(Keyword.get(opts, :image_matcher), arity) ->
        Keyword.get(opts, :image_matcher)

      is_function(Application.get_env(:manavault, :scan_image_matcher), arity) ->
        Application.get_env(:manavault, :scan_image_matcher)

      true ->
        nil
    end
  end

  defp image_matching_enabled? do
    Application.get_env(:manavault, :scan_image_matching, true)
  end

  defp normalize_image_matches(matches) when is_list(matches) do
    matches
    |> Enum.flat_map(fn
      %{scryfall_id: scryfall_id, score: score} = match when is_binary(scryfall_id) ->
        [
          %{
            scryfall_id: scryfall_id,
            score: float_score(score),
            source: Map.get(match, :source, :image)
          }
        ]

      %{"scryfall_id" => scryfall_id, "score" => score} when is_binary(scryfall_id) ->
        [%{scryfall_id: scryfall_id, score: float_score(score), source: :image}]

      _ ->
        []
    end)
  end

  defp normalize_image_matches(_matches), do: []

  defp image_match_by_printing_id(image_matches) do
    Map.new(image_matches, &{&1.scryfall_id, &1})
  end

  defp clean_ocr_text(text) do
    text
    |> String.split(~r/\R/, trim: true)
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&ignored_ocr_line?/1)
    |> Enum.join("\n")
  end

  defp ignored_ocr_line?(line) do
    ocr_diagnostic?(line) or copyright_line?(line) or credit_line?(line) or
      footer_metadata_line?(line)
  end

  # Detects card-footer lines that mix collector info with copyright/artist text.
  # Pattern: lines that start with a letter+number (collector/rarity) followed by
  # a 4–5 digit number (year-like: 2022, 02022, etc.).
  defp footer_metadata_line?(line) do
    String.match?(line, ~r/^[a-zA-Z]\s*\d{2,4}.*\b\d{4,5}\b/i)
  end

  defp ocr_diagnostic?(line) do
    String.match?(line, ~r/^estimating resolution as \d+$/i) or
      String.match?(line, ~r/^empty page!!$/i) or
      String.match?(line, ~r/^warning:/i)
  end

  defp configured_ocr_runner do
    Application.get_env(:manavault, :ocr_runner, &rapidocr_ocr/2)
  end

  defp rapidocr_python_path do
    Application.get_env(
      :manavault,
      :rapidocr_python,
      Path.expand(".venv/bin/python", File.cwd!())
    )
  end

  defp rapidocr_script_path do
    Application.app_dir(:manavault, "priv/rapidocr_scan.py")
  end

  defp rapidocr_ocr(image_path, opts) do
    # Try the persistent daemon first (fast, model already loaded).
    # Fall back only to the one-shot RapidOCR script if the daemon is not running.
    case daemon_ocr(image_path, opts) do
      {:ok, _text} = ok -> ok
      {:error, _reason} = error -> error
      :not_running -> fallback_ocr(image_path, opts)
    end
  end

  defp daemon_ocr(image_path, opts) do
    case Process.whereis(Manavault.Catalog.RapidOCRDaemon) do
      nil -> :not_running
      pid when is_pid(pid) -> Manavault.Catalog.RapidOCRDaemon.recognize(image_path, opts)
    end
  rescue
    _ -> :not_running
  end

  defp fallback_ocr(image_path, opts) do
    case System.cmd(rapidocr_python_path(), [rapidocr_script_path(), image_path, ocr_crop(opts)],
           stderr_to_stdout: true
         ) do
      {text, 0} when is_binary(text) and byte_size(text) > 0 ->
        {:ok, String.trim(text)}

      {output, status} ->
        {:error, "RapidOCR exited with #{status}: #{String.trim(output)}"}
    end
  rescue
    ErlangError ->
      {:error,
       "RapidOCR is not available. Run `mise exec -- mix manavault.ocr.setup` and restart the server."}
  end

  defp ocr_crop(opts), do: opts |> Keyword.get(:ocr_crop, :full) |> to_string()

  defp likely_set_code(text) do
    case Regex.run(
           ~r/(?:set|edition|expansion)[ \t]*[:#-]?[ \t]*\b([A-Z0-9]{2,5})\b/i,
           text
         ) do
      [_, code] ->
        code

      _ ->
        case Regex.run(~r/(?:^|\n)\s*([A-Z0-9]{2,5})\s*[·•★* -]\s*[A-Z]{2}\b/u, text) do
          [_, code] -> code
          _ -> nil
        end
    end
  end

  defp likely_collector_number(text) do
    case Regex.run(~r/(?:collector|number|#)\s*[:#-]?\s*([0-9]+[a-zA-Z]?)/i, text) do
      [_, number] ->
        number

      _ ->
        case Regex.run(~r/\b([0-9]{1,4}[a-zA-Z]?)\s*\/\s*[0-9]{1,4}\b/, text) do
          [_, number] ->
            number

          _ ->
            # Modern card footer: "R 0228" or "0228 R" (rarity + collector number)
            # Line-anchored to avoid mid-paragraph false positives.
            case Regex.run(~r/(?:^|\n)\s*[a-zA-Z]\s*(\d{2,4})\s*[a-zA-Z]?(?:\s|$)/, text) do
              [_, number] -> number
              _ -> nil
            end
        end
    end
  end

  defp likely_language(text) do
    case Regex.run(~r/\b(?:language|lang)\b\s*[:#-]?\s*([a-z]{2})/i, text) do
      [_, language] ->
        language

      _ ->
        case Regex.run(~r/(?:^|\n)\s*[A-Z0-9]{2,5}\s*[·•★* -]\s*([A-Z]{2})\b/u, text) do
          [_, language] -> language
          _ -> nil
        end
    end
  end

  defp copyright_line?(line) do
    String.match?(line, ~r/(©|™|®|wizards of the coast|all rights reserved)/i) or
      String.match?(line, ~r/^\w?\s*\d{3,4}\s*[™®&©]/iu)
  end

  defp credit_line?(line) do
    String.match?(line, ~r/(illustrated by|artist:)/i) or
      String.match?(line, ~r/^\w?\s*\d{2,4}[a-z]?\s*(\+|%|•|·|★)/iu)
  end

  defp score_candidate(
         %Printing{card: %Card{name: card_name}} = printing,
         parsed,
         tokens,
         lines,
         set_code,
         collector_number,
         language,
         image_match_by_printing_id
       ) do
    score_fields = normalized_score_fields(printing)
    field_set_score = field_score(printing.set_code, set_code, 0.2)
    field_collector_score = field_score(printing.collector_number, collector_number, 0.25)
    field_lang_score = field_score(printing.lang, language, 0.05)

    {token_score, token_evidence} = token_match_score(score_fields, tokens)
    {phrase_score, phrase_evidence} = phrase_match_score(score_fields, lines)
    image_match = Map.get(image_match_by_printing_id, printing.scryfall_id)
    image_score = image_match_score(image_match)

    confidence =
      min(
        token_score + phrase_score + field_set_score + field_collector_score + field_lang_score +
          image_score,
        1.0
      )
      |> float_score()

    %{
      printing: printing,
      confidence: confidence,
      evidence: %{
        ocr_text: Map.get(parsed, :text, ""),
        tokens: tokens,
        parsed_set_code: Map.get(parsed, :set_code),
        parsed_collector_number: Map.get(parsed, :collector_number),
        parsed_language: Map.get(parsed, :language),
        matched_name: card_name,
        matched_set_code: printing.set_code,
        matched_collector_number: printing.collector_number,
        image_match: image_match,
        scores: %{
          token_match: token_score,
          phrase_match: phrase_score,
          set_code: field_set_score,
          collector_number: field_collector_score,
          language: field_lang_score,
          image_match: image_score
        },
        token_hits: token_evidence,
        phrase_hits: phrase_evidence
      }
    }
  end

  defp image_match_score(nil), do: 0.0

  defp image_match_score(%{score: score}) do
    score
    |> max(0.0)
    |> min(1.0)
    |> Kernel.*(0.85)
    |> float_score()
  end

  defp normalized_score_fields(%Printing{card: card}) do
    %{
      name: normalize_text(card.name),
      compact_name: compact_text(card.name),
      type_line: normalize_text(card.type_line || ""),
      oracle_text: normalize_text(card.oracle_text || ""),
      compact_oracle_text: compact_text(card.oracle_text || "")
    }
  end

  defp candidate_sort_key(%{confidence: confidence, evidence: %{scores: scores}} = candidate) do
    phrase_hits = get_in(candidate, [:evidence, :phrase_hits]) || []
    token_hits = get_in(candidate, [:evidence, :token_hits]) || []

    name_phrase_hit? = Enum.any?(phrase_hits, &(&1.field == :name))
    type_phrase_hit? = Enum.any?(phrase_hits, &(&1.field == :type_line))
    name_token_weight = max_token_hit_weight(token_hits, :name)
    type_token_weight = max_token_hit_weight(token_hits, :type_line)
    oracle_token_weight = max_token_hit_weight(token_hits, :oracle_text)

    {
      -confidence,
      -float_score(scores.phrase_match),
      if(name_phrase_hit?, do: 0, else: 1),
      if(type_phrase_hit?, do: 0, else: 1),
      -float_score(scores.image_match),
      -float_score(scores.set_code),
      -float_score(scores.collector_number),
      -float_score(scores.language),
      -float_score(scores.token_match),
      -name_token_weight,
      -type_token_weight,
      -oracle_token_weight,
      candidate.printing.scryfall_id
    }
  end

  defp max_token_hit_weight(token_hits, field) do
    token_hits
    |> Enum.flat_map(& &1.hits)
    |> Enum.filter(&(&1.field == field))
    |> Enum.map(& &1.weight)
    |> Enum.max(fn -> 0 end)
  end

  defp token_match_score(_score_fields, []), do: {0.0, []}

  defp token_match_score(score_fields, tokens) do
    card_fields = [
      {:name, 3, score_fields.name},
      {:type_line, 2, score_fields.type_line},
      {:oracle_text, 1, score_fields.oracle_text}
    ]

    token_results =
      tokens
      |> Enum.map(fn token ->
        hits =
          card_fields
          |> Enum.filter(fn {_field, _weight, text} -> String.contains?(text, token) end)
          |> Enum.map(fn {field, weight, _text} -> %{field: field, weight: weight} end)

        {token, hits}
      end)
      |> Enum.reject(fn {_token, hits} -> hits == [] end)

    max_possible_score = length(tokens) * 3

    actual_score =
      token_results
      |> Enum.map(fn {_token, hits} ->
        hits |> Enum.map(& &1.weight) |> Enum.max(fn -> 0 end)
      end)
      |> Enum.sum()

    normalized = if max_possible_score > 0, do: actual_score / max_possible_score, else: 0.0

    {normalized, Enum.map(token_results, fn {token, hits} -> %{token: token, hits: hits} end)}
  end

  # Scores multi-word OCR lines as substring matches against card fields.
  # Lines matching the card name are weighted most heavily (0.8),
  # type line matches get 0.12, oracle text matches get 0.08.
  # Checks both directions: line ⊆ field AND field ⊆ line,
  # because OCR may produce a line that is just the name, OR a longer line
  # (e.g. the full rules text) that contains the name.
  # Single-word lines are skipped (already handled by token_match_score).
  # Bonus accumulates across lines, capped at 0.95.
  @phrase_name_weight 0.8
  @phrase_type_weight 0.12
  @phrase_oracle_weight 0.08
  @phrase_bonus_cap 0.95

  defp phrase_match_score(_score_fields, []), do: {0.0, []}

  defp phrase_match_score(score_fields, lines) do
    name_text = score_fields.name
    oracle_text_n = score_fields.oracle_text
    type_text = score_fields.type_line

    phrase_hits =
      lines
      |> Enum.with_index()
      |> Enum.map(fn {line, index} ->
        line_variants = line_variants(line)
        title_line? = index == 0

        cond do
          Enum.any?(line_variants, &name_phrase_match?(name_text, &1, title_line?)) ->
            weight = if title_line?, do: @phrase_name_weight, else: @phrase_name_weight / 2
            {:name, line, weight}

          Enum.any?(line_variants, &(&1 == type_text)) ->
            {:type_line, line, @phrase_type_weight}

          Enum.any?(line_variants, fn normalized_line ->
            phrase_word_count(normalized_line) >= @phrase_min_words and
                phrase_contains?(oracle_text_n, normalized_line)
          end) ->
            {:oracle_text, line, @phrase_oracle_weight}

          true ->
            nil
        end
      end)
      |> Enum.reject(&is_nil/1)

    score =
      phrase_hits
      |> Enum.map(fn {_field, _line, weight} -> weight end)
      |> Enum.sum()
      |> min(@phrase_bonus_cap)

    evidence =
      Enum.map(phrase_hits, fn {field, line, weight} ->
        %{field: field, line: line, weight: weight}
      end)

    {score, evidence}
  end

  defp phrase_word_count(text) do
    text |> String.split(~r/\s+/, trim: true) |> length()
  end

  defp name_phrase_match?(card_name, ocr_line, title_line?) do
    cond do
      card_name == "" or ocr_line == "" ->
        false

      card_name == ocr_line ->
        true

      compact_name_candidate?(ocr_line) ->
        compact_text(card_name) == compact_text(ocr_line)

      not title_line? and phrase_word_count(card_name) < @phrase_min_words ->
        false

      phrase_word_count(card_name) >= @phrase_min_words and
          phrase_word_count(ocr_line) >= @phrase_min_words ->
        phrase_contains?(card_name, ocr_line)

      true ->
        false
    end
  end

  defp phrase_contains?(card_field_text, ocr_line)
       when card_field_text == "" or ocr_line == "",
       do: false

  defp phrase_contains?(card_field_text, ocr_line) do
    compact_card_field = compact_text(card_field_text)
    compact_ocr_line = compact_text(ocr_line)

    String.contains?(card_field_text, ocr_line) or
      String.contains?(ocr_line, card_field_text) or
      String.contains?(compact_card_field, compact_ocr_line) or
      String.contains?(compact_ocr_line, compact_card_field)
  end

  defp compact_name_candidate?(text) do
    String.length(text) >= 6 and String.match?(text, ~r/^[a-z]+$/)
  end

  defp field_score(_actual, "", _score), do: 0.0

  defp field_score(actual, expected, score) when is_binary(actual) do
    if normalize_text(actual) == expected, do: float_score(score), else: 0.0
  end

  defp field_score(_actual, _expected, _score), do: 0.0

  defp float_score(score) when is_integer(score), do: score * 1.0
  defp float_score(score) when is_float(score), do: score
  defp float_score(_score), do: 0.0

  defp round_score(score), do: score |> float_score() |> Float.round(3)

  defp normalize_set_code(nil), do: ""
  defp normalize_set_code(value), do: value |> normalize_text() |> String.downcase()

  defp normalize_set_codes(values) when is_list(values) do
    values
    |> Enum.map(&normalize_set_code/1)
    |> Enum.reject(&(&1 == ""))
    |> Enum.uniq()
  end

  defp normalize_set_codes(_values), do: []

  defp normalize_collector_number(nil), do: ""

  defp normalize_collector_number(value) do
    value
    |> normalize_text()
    # Strip leading zeros for numeric comparison: "0228" → "228"
    # Preserves trailing letters: "228a" → "228a"
    |> String.replace(~r/^0+(\d)/, "\\1")
  end

  defp normalize_language(nil), do: ""
  defp normalize_language(value), do: value |> normalize_text() |> String.downcase()

  defp normalize_text(nil), do: ""

  defp normalize_text(value) when is_binary(value) do
    value
    |> String.trim()
    |> String.downcase()
  end

  defp normalize_titleish_text(nil), do: ""

  defp normalize_titleish_text(value) when is_binary(value) do
    value
    |> String.replace(~r/([a-z])([A-Z])/, "\\1 \\2")
    |> String.replace(~r/[,_:;]+/, " ")
    |> normalize_text()
    |> String.replace(~r/\s+/, " ")
  end

  defp compact_text(text) do
    text
    |> normalize_text()
    |> String.replace(~r/[^a-z0-9]/, "")
  end

  defp format_reason(reason) when is_binary(reason), do: reason
  defp format_reason(reason), do: inspect(reason)
end
