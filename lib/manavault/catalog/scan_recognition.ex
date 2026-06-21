defmodule Manavault.Catalog.ScanRecognition do
  @moduledoc """
  Server-side OCR and local Scryfall matching for captured scan images.
  """

  import Ecto.Query
  require Logger

  alias Manavault.Catalog.{
    ArtMatcher,
    Card,
    Printing,
    RuntimeImageMatcher,
    ScanItem,
    ScannerTelemetry
  }

  alias Manavault.Repo

  @default_max_candidates 5
  @title_ocr_min_confidence 0.7
  @art_first_min_confidence 0.7
  @art_first_min_score 0.875
  @art_first_min_margin 0.06
  @image_confirmed_title_min_score 0.9
  @image_confirmed_title_min_margin 0.04
  @title_art_gate_min_score 0.75
  @min_token_length 3
  @max_candidate_tokens 20
  @phrase_min_words 2

  @fuzzy_compact_title_candidate_min_similarity 0.88
  @fuzzy_title_token_min_similarity 0.82
  @uncertain_ocr_confidence_cap 0.69
  @candidate_index_cache_key {__MODULE__, :candidate_index}
  @candidate_index_multiplier 40
  @max_fuzzy_token_postings 3_000
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
    ScannerTelemetry.span(
      :recognition,
      %{
        image_path: image_path,
        scan_item_id: scan_item.id,
        mode: recognition_mode(opts)
      },
      fn -> do_recognize(scan_item, image_path, opts) end,
      &recognition_span_metadata/1
    )
  end

  def recognize(%ScanItem{} = scan_item, _opts) do
    {:ok, %{scan_item: scan_item, text: "", parsed: %{}, candidates: []}}
  end

  defp do_recognize(scan_item, image_path, opts) do
    cond do
      art_first_enabled?(opts) ->
        recognize_with_art_first(scan_item, image_path, opts)

      title_ocr_fast_path?(opts) ->
        recognize_with_title_ocr(scan_item, image_path, opts)

      true ->
        recognize_with_full_ocr(scan_item, image_path, opts)
    end
  end

  def clear_candidate_index_cache do
    :persistent_term.erase(@candidate_index_cache_key)
    :ok
  end

  def warm_candidate_index_cache do
    candidate_index()
    :ok
  end

  defp recognize_with_art_first(scan_item, image_path, opts) do
    art_opts = Keyword.put(opts, :art_first, false)

    case recognize_after_ocr_error(scan_item, image_path, art_opts, :no_art_match) do
      {:ok, recognition} ->
        recognition = put_art_first_timing(recognition, true, nil)

        if art_first_confident?(recognition, opts) do
          {:ok, recognition}
        else
          fallback_after_art_match(scan_item, image_path, opts, recognition, :weak_art_match)
        end

      {:error, reason} ->
        if require_art_match?(opts) and not ocr_candidate_image_fallback?(opts) do
          {:error, reason}
        else
          fallback_after_art_match(scan_item, image_path, opts, nil, reason)
        end
    end
  end

  defp fallback_after_art_match(scan_item, image_path, opts, recognition, reason) do
    fallback_opts =
      opts
      |> Keyword.put(:art_first, false)
      |> Keyword.put_new(:skip_initial_image_matching, true)
      |> Keyword.put(:allow_candidate_image_matching_with_image_matches, true)
      |> put_art_image_matches(recognition)

    result =
      if title_ocr_fast_path?(fallback_opts) do
        recognize_with_title_ocr(scan_item, image_path, fallback_opts)
      else
        recognize_with_full_ocr(scan_item, image_path, fallback_opts)
      end

    case result do
      {:ok, fallback_recognition} ->
        fallback_recognition =
          fallback_recognition
          |> add_art_attempt_timing(recognition)
          |> put_art_first_timing(false, reason)

        {:ok, fallback_recognition}

      {:error, fallback_reason} ->
        {:error, fallback_reason}
    end
  end

  defp put_art_image_matches(opts, %{image_matches: image_matches}) when is_list(image_matches) do
    Keyword.put_new(opts, :image_matches, image_matches)
  end

  defp put_art_image_matches(opts, _recognition), do: opts

  defp add_art_attempt_timing(fallback_recognition, nil), do: fallback_recognition

  defp add_art_attempt_timing(%{timings: fallback_timings} = fallback_recognition, %{
         timings: art_timings
       }) do
    timings =
      Enum.reduce([:parse_us, :image_us, :match_us, :total_us], fallback_timings, fn key,
                                                                                     timings ->
        case Map.get(art_timings, key) do
          value when is_number(value) -> Map.update(timings, key, value, &(&1 + value))
          _value -> timings
        end
      end)

    Map.put(fallback_recognition, :timings, timings)
  end

  defp add_art_attempt_timing(fallback_recognition, _recognition), do: fallback_recognition

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
    title_opts =
      opts
      |> Keyword.put(:ocr_crop, :title)
      |> Keyword.put(:skip_initial_image_matching, true)
      |> Keyword.put(:skip_confident_title_candidate_image_matching, true)

    case timed(fn -> run_ocr(image_path, title_opts) end) do
      {:ok, text, title_ocr_us} ->
        Logger.debug("Title OCR raw output for #{image_path}:\n#{text}")

        {:ok, recognition} =
          recognize_with_text(scan_item, text, image_path, title_opts, title_ocr_us)

        recognition = put_title_ocr_timing(recognition, title_ocr_us, nil, true)

        cond do
          title_ocr_confident?(recognition, opts) ->
            {:ok, maybe_refine_ambiguous_title_with_image(recognition, image_path, opts)}

          image_confirmed_title_candidate?(recognition, opts) ->
            {:ok, recognition}

          full_ocr_fallback?(opts) ->
            fallback_to_image_or_full_ocr(
              scan_item,
              image_path,
              opts,
              title_ocr_us,
              :weak_title_match
            )

          true ->
            {:ok, reject_title_recognition(recognition, title_ocr_us, :weak_title_match)}
        end

      {:error, reason} ->
        if full_ocr_fallback?(opts) do
          fallback_to_image_or_full_ocr(
            scan_item,
            image_path,
            opts,
            nil,
            {:title_ocr_error, reason}
          )
        else
          {:error, reason}
        end
    end
  end

  defp fallback_to_image_or_full_ocr(scan_item, image_path, opts, title_ocr_us, fallback_reason) do
    case recognize_after_ocr_error(scan_item, image_path, opts, fallback_reason) do
      {:ok, recognition} ->
        {:ok, put_title_ocr_timing(recognition, title_ocr_us, fallback_reason, false)}

      {:error, _reason} ->
        fallback_to_full_ocr(scan_item, image_path, opts, title_ocr_us, fallback_reason)
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

  defp reject_title_recognition(recognition, title_ocr_us, reason) do
    recognition
    |> Map.put(:candidates, [])
    |> Map.put(:image_matches, [])
    |> put_title_ocr_timing(title_ocr_us, reason, true)
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

  defp recognition_mode(opts) do
    cond do
      art_first_enabled?(opts) -> :art_first
      title_ocr_fast_path?(opts) -> :title_ocr
      true -> :full_ocr
    end
  end

  defp art_first_enabled?(opts) do
    Keyword.get(opts, :art_first, Application.get_env(:manavault, :scan_art_first, true)) and
      not Keyword.get(opts, :skip_image_matching, false) and image_matching_enabled?()
  end

  defp require_art_match?(opts), do: Keyword.get(opts, :require_art_match, false)

  defp ocr_candidate_image_fallback?(opts),
    do: Keyword.get(opts, :ocr_candidate_image_fallback, false)

  defp full_ocr_fallback?(opts) do
    Keyword.get(
      opts,
      :full_ocr_fallback,
      Application.get_env(:manavault, :scan_full_ocr_fallback, true)
    )
  end

  defp title_ocr_confident?(%{candidates: [top | _rest], parsed: parsed}, opts) do
    top.confidence >= Keyword.get(opts, :title_ocr_min_confidence, @title_ocr_min_confidence) and
      title_text_matches_printing_name?(parsed, top.printing) and
      enough_title_evidence?(top)
  end

  defp title_ocr_confident?(_recognition, _opts), do: false

  defp image_confirmed_title_candidate?(%{candidates: [top | rest]}, opts) do
    top_match = get_in(top, [:evidence, :image_match]) || %{}
    top_score = image_evidence_score(top)
    second_score = rest |> Enum.map(&image_evidence_score/1) |> Enum.max(fn -> 0.0 end)
    margin = Map.get(top_match, :margin, top_score - second_score)
    source = Map.get(top_match, :source)
    index_complete? = Map.get(top_match, :index_complete, true)

    source != :art and index_complete? != false and
      top.confidence >= Keyword.get(opts, :title_ocr_min_confidence, @title_ocr_min_confidence) and
      top_score >=
        Keyword.get(opts, :image_confirmed_title_min_score, @image_confirmed_title_min_score) and
      margin >=
        Keyword.get(opts, :image_confirmed_title_min_margin, @image_confirmed_title_min_margin)
  end

  defp image_confirmed_title_candidate?(_recognition, _opts), do: false

  defp art_first_confident?(%{candidates: [top | rest]}, opts) do
    top_match = get_in(top, [:evidence, :image_match]) || %{}
    top_score = image_evidence_score(top)
    second_score = rest |> Enum.map(&image_evidence_score/1) |> Enum.max(fn -> 0.0 end)
    margin = Map.get(top_match, :margin, top_score - second_score)
    index_complete? = Map.get(top_match, :index_complete, true)

    top.confidence >= Keyword.get(opts, :art_first_min_confidence, @art_first_min_confidence) and
      top_score >= Keyword.get(opts, :art_first_min_score, @art_first_min_score) and
      margin >= Keyword.get(opts, :art_first_min_margin, @art_first_min_margin) and
      (index_complete? or Keyword.get(opts, :allow_partial_art_index, false))
  end

  defp art_first_confident?(_recognition, _opts), do: false

  defp image_evidence_score(%{evidence: %{image_match: %{score: score}}}), do: float_score(score)
  defp image_evidence_score(_candidate), do: 0.0

  defp enough_title_evidence?(%{printing: %Printing{} = printing, evidence: evidence}) do
    printing
    |> title_names()
    |> Enum.any?(fn name ->
      name
      |> meaningful_token_set()
      |> MapSet.size()
      |> case do
        0 -> title_name_evidence?(name, evidence)
        1 -> title_name_evidence?(name, evidence) or footer_evidence?(evidence)
        _many -> true
      end
    end)
  end

  defp enough_title_evidence?(_candidate), do: false

  defp title_name_evidence?(card_name, %{phrase_hits: phrase_hits}) when is_list(phrase_hits) do
    (title_word_count(card_name) >= @phrase_min_words or
       String.length(compact_alpha(card_name)) >= 6) and
      Enum.any?(phrase_hits, fn
        %{field: :name, line: line} -> text_matches_card_name?(line, card_name)
        _hit -> false
      end)
  end

  defp title_name_evidence?(_card_name, _evidence), do: false

  defp footer_evidence?(%{scores: scores}) when is_map(scores) do
    float_score(Map.get(scores, :set_code, 0.0)) > 0.0 or
      float_score(Map.get(scores, :collector_number, 0.0)) > 0.0
  end

  defp footer_evidence?(_evidence), do: false

  defp title_text_matches_printing_name?(parsed, %Printing{} = printing) do
    title_lines =
      parsed
      |> Map.get(:lines, [])
      |> Enum.take(4)

    title_candidates = title_line_candidates(title_lines)

    printing
    |> title_names()
    |> Enum.any?(fn name ->
      Enum.any?(title_candidates, &text_matches_card_name?(&1, name))
    end)
  end

  defp title_text_matches_printing_name?(_parsed, _printing), do: false

  defp title_line_candidates(lines) do
    adjacent_lines =
      lines
      |> Enum.chunk_every(2, 1, :discard)
      |> Enum.map(&Enum.join(&1, " "))

    lines ++ adjacent_lines
  end

  defp text_matches_card_name?(title_text, card_name) do
    title_compact = compact_alpha(title_text)
    name_compact = compact_alpha(card_name)
    title_tokens = meaningful_token_set(title_text)
    name_tokens = meaningful_token_set(card_name)

    (title_compact != "" and title_compact == name_compact) or
      (MapSet.size(title_tokens) > 0 and title_tokens == name_tokens) or
      fuzzy_title_name_match?(title_text, card_name, title_compact, name_compact)
  end

  defp fuzzy_title_name_match?(title_text, card_name, title_compact, name_compact) do
    phrase_word_count(card_name) >= @phrase_min_words and
      String.length(title_compact) >= 6 and
      String.length(name_compact) >= 6 and
      abs(String.length(title_compact) - String.length(name_compact)) <= 2 and
      (title_name_tokens_match?(title_text, card_name) or
         compact_title_name_match?(card_name, title_text))
  end

  defp title_names(%Printing{card: %Card{name: card_name}, flavor_name: flavor_name}) do
    [flavor_name, card_name]
    |> Enum.filter(&(is_binary(&1) and String.trim(&1) != ""))
    |> Enum.uniq()
  end

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

  defp maybe_refine_ambiguous_title_with_image(
         %{candidates: candidates} = recognition,
         image_path,
         opts
       ) do
    if ambiguous_title_candidates?(candidates) do
      {image_matches, image_us} =
        timed_value(fn -> run_initial_image_matching(image_path, opts) end)

      if image_matches == [] do
        recognition
      else
        {candidates, match_us} =
          timed_value(fn ->
            match_candidates(recognition.parsed, Keyword.put(opts, :image_matches, image_matches))
          end)

        recognition
        |> Map.put(:image_matches, image_matches)
        |> Map.put(:candidates, candidates)
        |> add_recognition_timing(:image_us, image_us)
        |> add_recognition_timing(:match_us, match_us)
        |> add_recognition_timing(:total_us, image_us + match_us)
      end
    else
      recognition
    end
  end

  defp ambiguous_title_candidates?([%{printing: %{card: %{name: name}}} | rest]) do
    normalized_name = normalize_text(name)

    phrase_word_count(normalized_name) == 1 and
      Enum.any?(rest, fn
        %{printing: %{card: %{name: other_name}}} -> normalize_text(other_name) == normalized_name
        _candidate -> false
      end)
  end

  defp ambiguous_title_candidates?(_candidates), do: false

  defp add_recognition_timing(%{timings: timings} = recognition, key, us) do
    Map.put(recognition, :timings, Map.update(timings, key, us, &(&1 + us)))
  end

  defp put_art_first_timing(%{timings: timings} = recognition, accepted?, reason) do
    timings =
      timings
      |> Map.put(:art_first, true)
      |> Map.put(:art_first_accepted, accepted?)
      |> Map.put(:art_first_fallback_reason, format_fallback_reason(reason))

    Map.put(recognition, :timings, timings)
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
      case title_candidate_image_matches(parsed, initial_candidates, initial_image_matches, opts) do
        {:skip, matches} ->
          {matches, 0}

        :run ->
          timed_value(fn ->
            run_candidate_image_matching(image_path, opts, initial_candidates)
          end)
      end

    {candidates, rematch_us} =
      if candidate_image_matches == [] do
        {initial_candidates, 0}
      else
        timed_value(fn ->
          rescore_candidate_printings(parsed, initial_candidates, candidate_image_matches, opts)
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

  defp title_candidate_image_matches(parsed, [top | _] = candidates, initial_image_matches, opts) do
    cond do
      not Keyword.get(opts, :skip_confident_title_candidate_image_matching, false) ->
        :run

      not title_ocr_confident?(%{parsed: parsed, candidates: candidates}, opts) ->
        :run

      ambiguous_title_candidates?(candidates) ->
        :run

      not require_art_match?(opts) or trusted_image_evidence?(top) ->
        {:skip, []}

      art_gate_match = title_art_gate_match(top, initial_image_matches, opts) ->
        {:skip, [art_gate_match]}

      true ->
        :run
    end
  end

  defp title_candidate_image_matches(_parsed, _candidates, _initial_image_matches, _opts),
    do: :run

  defp title_art_gate_match(%{printing: %Printing{scryfall_id: scryfall_id}}, image_matches, opts) do
    min_score = Keyword.get(opts, :title_art_gate_min_score, @title_art_gate_min_score)

    case image_matches do
      [%{score: score} = top_match | _] when is_number(score) and score >= min_score ->
        top_match
        |> Map.take([:margin, :rank, :index_complete, :index_size])
        |> Map.merge(%{scryfall_id: scryfall_id, score: score, source: :art_gate})

      _ ->
        nil
    end
  end

  defp title_art_gate_match(_candidate, _image_matches, _opts), do: nil

  defp trusted_image_evidence?(%{evidence: %{image_match: %{score: score} = image_match}})
       when is_number(score) do
    score > 0.0 and Map.get(image_match, :index_complete, true) != false
  end

  defp trusted_image_evidence?(_candidate), do: false

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
    ScannerTelemetry.span(
      :candidate_match,
      %{
        token_count: parsed |> Map.get(:tokens, []) |> length(),
        line_count: parsed |> Map.get(:lines, []) |> length(),
        match_count: opts |> Keyword.get(:image_matches, []) |> length()
      },
      fn -> do_match_candidates(parsed, opts) end,
      &candidate_match_span_metadata/1
    )
  end

  defp do_match_candidates(parsed, opts) do
    max_candidates = Keyword.get(opts, :max_candidates, @default_max_candidates)
    tokens = parsed |> Map.get(:tokens, [])
    lines = parsed |> Map.get(:lines, [])
    set_code = parsed |> Map.get(:set_code) |> normalize_set_code()
    collector_number = parsed |> Map.get(:collector_number) |> normalize_collector_number()
    language = parsed |> Map.get(:language) |> normalize_language()
    image_matches = Keyword.get(opts, :image_matches, [])
    set_codes = opts |> Keyword.get(:set_codes, []) |> normalize_set_codes()

    Logger.debug(fn ->
      "OCR match_candidates — tokens: #{inspect(tokens)}, lines: #{inspect(lines)}, set_code: #{inspect(set_code)}, collector_number: #{inspect(collector_number)}, language: #{inspect(language)}\nOCR raw text:\n#{Map.get(parsed, :text, "")}"
    end)

    fast_title_only? = Keyword.get(opts, :fast_title_only, false)

    printings =
      candidate_printings(
        tokens,
        lines,
        max_candidates,
        image_matches,
        set_codes,
        fast_title_only?
      )

    candidates = score_printing_candidates(parsed, printings, opts)

    log_top_candidates(candidates)

    Enum.take(candidates, max_candidates)
  end

  defp rescore_candidate_printings(parsed, initial_candidates, image_matches, opts) do
    max_candidates = Keyword.get(opts, :max_candidates, @default_max_candidates)
    set_codes = opts |> Keyword.get(:set_codes, []) |> normalize_set_codes()
    printings = Enum.map(initial_candidates, & &1.printing)
    printing_ids = MapSet.new(printings, & &1.scryfall_id)

    missing_image_ids =
      image_matches
      |> Enum.map(& &1.scryfall_id)
      |> Enum.reject(&MapSet.member?(printing_ids, &1))

    parsed
    |> score_printing_candidates(
      printings ++ load_printings_by_ids(missing_image_ids, set_codes),
      Keyword.put(opts, :image_matches, image_matches)
    )
    |> Enum.take(max_candidates)
  end

  defp score_printing_candidates(parsed, printings, opts) do
    tokens = parsed |> Map.get(:tokens, [])
    lines = parsed |> Map.get(:lines, [])
    set_code = parsed |> Map.get(:set_code) |> normalize_set_code()
    collector_number = parsed |> Map.get(:collector_number) |> normalize_collector_number()
    language = parsed |> Map.get(:language) |> normalize_language()
    image_matches = Keyword.get(opts, :image_matches, [])
    image_match_by_printing_id = image_match_by_printing_id(image_matches)

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
  end

  defp log_top_candidates(candidates) do
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
  end

  defp candidate_has_recognition_evidence?(%{evidence: %{scores: scores}}) do
    float_score(scores.token_match) > 0.0 or float_score(scores.phrase_match) > 0.0 or
      float_score(scores.image_match) > 0.0
  end

  defp candidate_printings([], [], _max_candidates, [], _set_codes, _fast_title_only?), do: []

  defp candidate_printings(
         [],
         [],
         _max_candidates,
         [_ | _] = image_matches,
         set_codes,
         _fast_title_only?
       ) do
    image_matches
    |> Enum.map(& &1.scryfall_id)
    |> Enum.uniq()
    |> load_printings_by_ids(set_codes)
  end

  defp candidate_printings(
         tokens,
         lines,
         max_candidates,
         image_matches,
         set_codes,
         _fast_title_only?
       ) do
    fuzzy_limit = max(max_candidates * @candidate_index_multiplier, 200)

    ids =
      case title_fts_candidate_ids(lines, fuzzy_limit) do
        [] -> fuzzy_candidate_ids(tokens, lines, fuzzy_limit, set_codes)
        title_ids -> title_ids
      end
      |> append_image_match_ids(image_matches)

    load_printings_by_ids(ids, set_codes)
  end

  defp append_image_match_ids(ids, image_matches) do
    (ids ++ Enum.map(image_matches, & &1.scryfall_id))
    |> Enum.uniq()
  end

  defp fuzzy_candidate_ids(tokens, lines, limit, set_codes) do
    title_candidates =
      lines
      |> Enum.take(4)
      |> title_line_candidates()
      |> Enum.flat_map(&line_variants/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq()

    fuzzy_title_candidates =
      lines
      |> Enum.take(1)
      |> Enum.flat_map(&line_variants/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq()

    token_set = MapSet.new(tokens)
    locked_sets? = set_codes != []
    index = candidate_index()
    title_source_tokens = eligible_title_candidate_tokens(lines, index)
    source_tokens = candidate_source_tokens(tokens, lines, index)

    ids =
      source_tokens
      |> candidate_token_counts(index)
      |> Enum.flat_map(fn {scryfall_id, token_hits} ->
        entry = Map.fetch!(index.entries_by_id, scryfall_id)

        if locked_sets? and entry.set_code not in set_codes do
          []
        else
          score = fuzzy_candidate_score(entry, title_candidates, token_set, token_hits)
          if score > 0.0, do: [{scryfall_id, score}], else: []
        end
      end)
      |> Enum.sort_by(fn {scryfall_id, score} -> {-score, scryfall_id} end)
      |> Enum.take(limit)
      |> Enum.map(fn {scryfall_id, _score} -> scryfall_id end)

    ids =
      if title_source_tokens == [] do
        (ids ++ fuzzy_title_candidate_ids(fuzzy_title_candidates, index, limit, set_codes))
        |> Enum.uniq()
        |> Enum.take(limit)
      else
        ids
      end

    if ids == [] do
      tokens
      |> broad_fts_query(lines)
      |> search_printing_ids(limit)
    else
      ids
    end
  end

  defp fuzzy_title_candidate_ids([], _index, _limit, _set_codes), do: []

  defp fuzzy_title_candidate_ids(title_candidates, index, limit, set_codes) do
    compact_titles =
      title_candidates
      |> Enum.map(&compact_text/1)
      |> Enum.filter(&(String.length(&1) >= 6))
      |> Enum.uniq()

    locked_sets? = set_codes != []

    compact_titles
    |> Enum.flat_map(&bucketed_compact_name_matches(&1, index))
    |> Enum.reduce(%{}, fn {scryfall_id, set_code, score}, scores ->
      if locked_sets? and set_code not in set_codes do
        scores
      else
        Map.update(scores, scryfall_id, score, &max(&1, score))
      end
    end)
    |> Enum.sort_by(fn {scryfall_id, score} -> {-score, scryfall_id} end)
    |> Enum.take(limit)
    |> Enum.map(fn {scryfall_id, _score} -> scryfall_id end)
  end

  defp bucketed_compact_name_matches(compact_title, index) do
    compact_title
    |> compact_title_bucket_keys()
    |> Enum.flat_map(&Map.get(index.compact_name_buckets, &1, []))
    |> Enum.uniq()
    |> Enum.flat_map(fn {scryfall_id, set_code, compact_name} ->
      score = fuzzy_compact_title_similarity(compact_title, compact_name)

      if score >= @fuzzy_compact_title_candidate_min_similarity do
        [{scryfall_id, set_code, score}]
      else
        []
      end
    end)
  end

  defp candidate_index do
    case :persistent_term.get(@candidate_index_cache_key, :missing) do
      :missing ->
        index = load_candidate_index()
        :persistent_term.put(@candidate_index_cache_key, index)
        index

      index ->
        index
    end
  end

  defp load_candidate_index do
    entries =
      Printing
      |> join(:inner, [printing], card in assoc(printing, :card))
      |> where([_printing, card], card.type_line not in ["Card", "Card // Card"])
      |> select([printing, card], %{
        scryfall_id: printing.scryfall_id,
        set_code: printing.set_code,
        collector_number: printing.collector_number,
        flavor_name: printing.flavor_name,
        name: card.name,
        type_line: card.type_line,
        oracle_text: card.oracle_text,
        flavor_text: printing.flavor_text
      })
      |> Repo.all()
      |> Enum.map(&candidate_index_entry/1)

    %{
      entries_by_id: Map.new(entries, &{&1.scryfall_id, &1}),
      token_ids: build_candidate_token_index(entries),
      compact_name_buckets: build_compact_name_buckets(entries)
    }
  end

  defp candidate_index_entry(row) do
    names =
      [row.flavor_name, row.name]
      |> Enum.filter(&(is_binary(&1) and String.trim(&1) != ""))
      |> Enum.uniq()

    search_tokens =
      [
        names,
        row.type_line,
        row.oracle_text,
        row.flavor_text,
        row.set_code,
        row.collector_number
      ]
      |> List.flatten()
      |> Enum.join(" ")
      |> extract_index_tokens()

    normalized_names = Enum.map(names, &normalize_text/1)

    %{
      scryfall_id: row.scryfall_id,
      set_code: normalize_set_code(row.set_code),
      names: normalized_names,
      compact_names: Enum.map(names, &compact_text/1),
      name_token_sets: Enum.map(normalized_names, &meaningful_token_set/1),
      search_tokens: search_tokens
    }
  end

  defp build_candidate_token_index(entries) do
    Enum.reduce(entries, %{}, fn entry, index ->
      Enum.reduce(entry.search_tokens, index, fn token, index ->
        Map.update(index, token, [entry.scryfall_id], &[entry.scryfall_id | &1])
      end)
    end)
  end

  defp build_compact_name_buckets(entries) do
    Enum.reduce(entries, %{}, fn entry, buckets ->
      entry.compact_names
      |> Enum.filter(&(String.length(&1) >= 6))
      |> Enum.uniq()
      |> Enum.reduce(buckets, fn compact_name, buckets ->
        ref = {entry.scryfall_id, entry.set_code, compact_name}
        Map.update(buckets, compact_name_bucket_key(compact_name), [ref], &[ref | &1])
      end)
    end)
  end

  defp compact_name_bucket_key(compact_name) do
    {String.first(compact_name), String.length(compact_name)}
  end

  defp compact_title_bucket_keys(compact_title) do
    length = String.length(compact_title)
    gap = max(2, div(length, 4))

    for candidate_length <- max(6, length - gap)..(length + gap) do
      {String.first(compact_title), candidate_length}
    end
  end

  defp extract_index_tokens(text) do
    text
    |> normalize_text()
    |> String.replace(~r/[^a-z0-9\s]/, " ")
    |> String.split(~r/\s+/, trim: true)
    |> Enum.reject(fn token ->
      String.length(token) < @min_token_length or token in @noise_tokens or
        String.match?(token, ~r/^\d+$/)
    end)
    |> Enum.uniq()
  end

  defp candidate_token_counts(tokens, index) do
    Enum.reduce(tokens, %{}, fn token, counts ->
      index.token_ids
      |> Map.get(token, [])
      |> Enum.reduce(counts, &Map.update(&2, &1, 1, fn count -> count + 1 end))
    end)
  end

  defp candidate_source_tokens(tokens, lines, index) do
    case eligible_title_candidate_tokens(lines, index) do
      [] ->
        case eligible_candidate_tokens(tokens, index) do
          [] -> rarest_candidate_tokens(tokens, index)
          eligible_tokens -> eligible_tokens
        end

      eligible_title_tokens ->
        eligible_title_tokens
    end
  end

  defp eligible_title_candidate_tokens(lines, index) do
    lines
    |> Enum.take(1)
    |> Enum.join(" ")
    |> extract_index_tokens()
    |> eligible_candidate_tokens(index)
  end

  defp eligible_candidate_tokens(tokens, index) do
    tokens
    |> Enum.uniq()
    |> Enum.map(&{&1, token_candidate_count(&1, index)})
    |> Enum.filter(fn {_token, count} -> count > 0 and count <= @max_fuzzy_token_postings end)
    |> Enum.sort_by(fn {token, count} -> {count, token} end)
    |> Enum.take(3)
    |> Enum.map(fn {token, _count} -> token end)
  end

  defp rarest_candidate_tokens(tokens, index) do
    tokens
    |> Enum.map(&{&1, token_candidate_count(&1, index)})
    |> Enum.reject(fn {_token, count} -> count == 0 end)
    |> Enum.sort_by(fn {token, count} -> {count, token} end)
    |> Enum.take(2)
    |> Enum.map(fn {token, _count} -> token end)
  end

  defp token_candidate_count(token, index) do
    index.token_ids
    |> Map.get(token, [])
    |> length()
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

  defp title_fts_candidate_ids(lines, limit) do
    lines
    |> Enum.take(1)
    |> title_line_candidates()
    |> Enum.flat_map(&fts_terms/1)
    |> Enum.uniq()
    |> Enum.take(8)
    |> fts_or_query()
    |> search_printing_ids(limit)
  end

  defp broad_fts_query(tokens, lines) do
    (title_line_candidates(Enum.take(lines, 2)) ++ tokens)
    |> Enum.flat_map(&fts_terms/1)
    |> Enum.uniq()
    |> Enum.take(16)
    |> fts_or_query()
  end

  defp fts_or_query(terms) do
    Enum.map_join(terms, " OR ", &~s("#{String.replace(&1, ~s("), ~s(""))}"))
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

  defp fuzzy_candidate_score(entry, title_candidates, token_set, token_hits) do
    title_score =
      title_candidates
      |> Enum.map(&best_title_candidate_score(entry, &1))
      |> Enum.max(fn -> 0.0 end)

    title_score + token_hits * 0.05 + min(MapSet.size(token_set), token_hits) * 0.01
  end

  defp best_title_candidate_score(entry, title_candidate) do
    compact_title = compact_text(title_candidate)
    title_tokens = meaningful_token_set(title_candidate)

    entry.names
    |> Enum.zip(entry.compact_names)
    |> Enum.zip(entry.name_token_sets)
    |> Enum.map(fn {{name, compact_name}, name_tokens} ->
      cond do
        title_candidate == name or compact_title == compact_name ->
          8.0

        MapSet.size(title_tokens) > 0 and title_tokens == name_tokens ->
          7.5

        fuzzy_title_name_match?(title_candidate, name, compact_title, compact_name) ->
          7.0

        MapSet.size(MapSet.intersection(title_tokens, name_tokens)) > 0 ->
          1.0

        true ->
          0.0
      end
    end)
    |> Enum.max(fn -> 0.0 end)
  end

  defp load_printings_by_ids([], _set_codes), do: []

  defp load_printings_by_ids(ids, set_codes) do
    Printing
    |> join(:inner, [printing], card in assoc(printing, :card))
    |> where([printing, _card], printing.scryfall_id in ^ids)
    |> where([_printing, card], card.type_line not in ["Card", "Card // Card"])
    |> maybe_filter_set_codes(set_codes)
    |> preload([_printing, card], card: card)
    |> Repo.all()
  end

  defp maybe_filter_set_codes(query, []), do: query

  defp maybe_filter_set_codes(query, set_codes) do
    where(query, [printing, _card], printing.set_code in ^set_codes)
  end

  defp line_variants(line) do
    [normalize_text(line), normalize_titleish_text(line)]
    |> Enum.reject(&(&1 == ""))
    |> Enum.uniq()
  end

  defp run_ocr(image_path, opts) do
    ScannerTelemetry.span(
      :ocr,
      %{image_path: image_path, ocr_crop: Keyword.get(opts, :ocr_crop, :full)},
      fn -> do_run_ocr(image_path, opts) end,
      &ocr_span_metadata/1
    )
  end

  defp do_run_ocr(image_path, opts) do
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
    ScannerTelemetry.span(
      :image_match,
      %{image_path: image_path, phase: :initial, crop: Keyword.get(opts, :crop, "art")},
      fn -> do_run_initial_image_matching(image_path, opts) end,
      &image_match_span_metadata/1
    )
  end

  defp do_run_initial_image_matching(image_path, opts) do
    cond do
      Keyword.has_key?(opts, :image_matches) ->
        opts
        |> Keyword.get(:image_matches)
        |> normalize_image_matches()

      Keyword.get(opts, :skip_initial_image_matching, false) or
          Keyword.get(opts, :skip_image_matching, false) ->
        []

      matcher = image_matcher(opts, 1) ->
        matcher
        |> apply([image_path])
        |> normalize_image_matches()

      image_matching_enabled?() ->
        ArtMatcher.match(
          image_path,
          Keyword.take(opts, [
            :limit,
            :threshold,
            :crop,
            :set_codes,
            :allow_partial_art_index
          ])
        )

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

    ScannerTelemetry.span(
      :image_match,
      %{
        image_path: image_path,
        phase: :candidate,
        crop: Keyword.get(opts, :crop, "art"),
        candidate_count: length(printings)
      },
      fn -> do_run_candidate_image_matching(image_path, opts, printings) end,
      &image_match_span_metadata/1
    )
  end

  defp do_run_candidate_image_matching(image_path, opts, printings) do
    cond do
      Keyword.get(opts, :skip_image_matching, false) or
          Keyword.get(opts, :skip_candidate_image_matching, false) ->
        []

      Keyword.has_key?(opts, :image_matches) and
          not Keyword.get(opts, :allow_candidate_image_matching_with_image_matches, false) ->
        []

      matcher = image_matcher(opts, 2) ->
        matcher
        |> apply([image_path, printings])
        |> normalize_image_matches()

      image_matching_enabled?() ->
        RuntimeImageMatcher.match(image_path, printings, candidate_image_match_opts(opts))
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

  defp candidate_image_match_opts(opts) do
    candidate_threshold = Keyword.get(opts, :candidate_image_threshold)

    opts
    |> Keyword.take([:crop, :limit])
    |> maybe_put_candidate_threshold(candidate_threshold)
  end

  defp maybe_put_candidate_threshold(opts, nil), do: opts

  defp maybe_put_candidate_threshold(opts, threshold),
    do: Keyword.put(opts, :threshold, threshold)

  defp image_matching_enabled? do
    Application.get_env(:manavault, :scan_image_matching, true)
  end

  defp normalize_image_matches(matches) when is_list(matches) do
    matches
    |> Enum.flat_map(fn
      %{scryfall_id: scryfall_id, score: score} = match when is_binary(scryfall_id) ->
        [
          match
          |> image_match_base(scryfall_id, score, Map.get(match, :source, :image))
          |> maybe_put_image_match_meta(:margin, match)
          |> maybe_put_image_match_meta(:rank, match)
          |> maybe_put_image_match_meta(:index_complete, match)
          |> maybe_put_image_match_meta(:index_size, match)
        ]

      %{"scryfall_id" => scryfall_id, "score" => score} = match when is_binary(scryfall_id) ->
        [
          match
          |> image_match_base(scryfall_id, score, Map.get(match, "source", :image))
          |> maybe_put_image_match_meta(:margin, match)
          |> maybe_put_image_match_meta(:rank, match)
          |> maybe_put_image_match_meta(:index_complete, match)
          |> maybe_put_image_match_meta(:index_size, match)
        ]

      _ ->
        []
    end)
  end

  defp normalize_image_matches(_matches), do: []

  defp recognition_span_metadata({:ok, recognition}) do
    recognition
    |> recognition_metadata()
    |> Map.put(:outcome, :ok)
  end

  defp recognition_span_metadata({:error, reason}), do: %{outcome: :error, reason: reason}
  defp recognition_span_metadata(_result), do: %{}

  defp ocr_span_metadata({:ok, text}) when is_binary(text) do
    %{outcome: :ok, text_bytes: byte_size(text), line_count: line_count(text)}
  end

  defp ocr_span_metadata({:error, reason}), do: %{outcome: :error, reason: reason}
  defp ocr_span_metadata(_result), do: %{}

  defp image_match_span_metadata(matches) when is_list(matches) do
    %{
      outcome: :ok,
      match_count: length(matches),
      top_image_score: top_image_score(matches)
    }
  end

  defp image_match_span_metadata(_result), do: %{}

  defp candidate_match_span_metadata(candidates) when is_list(candidates) do
    candidates
    |> candidate_list_metadata()
    |> Map.put(:outcome, :ok)
  end

  defp candidate_match_span_metadata(_result), do: %{}

  defp recognition_metadata(%{candidates: candidates, image_matches: image_matches} = recognition) do
    candidates
    |> candidate_list_metadata()
    |> Map.merge(%{
      match_count: length(image_matches || []),
      top_image_score: top_image_score(image_matches || []),
      title_ocr_fast_path: get_in(recognition, [:timings, :title_ocr_fast_path]),
      art_first: get_in(recognition, [:timings, :art_first]),
      art_first_accepted: get_in(recognition, [:timings, :art_first_accepted])
    })
  end

  defp recognition_metadata(_recognition), do: %{}

  defp candidate_list_metadata(candidates) when is_list(candidates) do
    candidates
    |> List.first()
    |> candidate_metadata()
    |> Map.put(:candidate_count, length(candidates))
  end

  defp candidate_list_metadata(_candidates), do: %{candidate_count: 0}

  defp candidate_metadata(%{confidence: confidence, printing: %Printing{} = printing}) do
    %{
      confidence: confidence,
      accepted_printing_id: printing.scryfall_id,
      card_name: get_in(printing.card, [Access.key(:name)])
    }
  end

  defp candidate_metadata(_candidate), do: %{}

  defp top_image_score([%{score: score} | _matches]), do: float_score(score)
  defp top_image_score(_matches), do: nil

  defp line_count(""), do: 0
  defp line_count(text), do: text |> String.split(~r/\R/, trim: true) |> length()

  defp image_match_base(_match, scryfall_id, score, source) do
    %{scryfall_id: scryfall_id, score: float_score(score), source: source}
  end

  defp maybe_put_image_match_meta(normalized, key, match) do
    string_key = Atom.to_string(key)

    value =
      cond do
        Map.has_key?(match, key) -> Map.fetch!(match, key)
        Map.has_key?(match, string_key) -> Map.fetch!(match, string_key)
        true -> nil
      end

    if is_nil(value) do
      normalized
    else
      Map.put(normalized, key, value)
    end
  end

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
        cond do
          match =
              Regex.run(~r/(?:^|[^\d])(\d{2,4}[a-zA-Z]?)\s*\/\s*\d{2,4}[a-zA-Z]?(?:\b|$)/, text) ->
            Enum.at(match, 1)

          match = Regex.run(~r/(?:^|\n)\s*[a-zA-Z]\s*(\d{2,4})\s*[a-zA-Z]?(?:\s|$)/, text) ->
            Enum.at(match, 1)

          match = Regex.run(~r/(?:^|\n)\s*(\d{2,4}[a-zA-Z]?)\s*(?:\n|$)/, text) ->
            Enum.at(match, 1)

          true ->
            nil
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

    scores = %{
      token_match: token_score,
      phrase_match: phrase_score,
      set_code: field_set_score,
      collector_number: field_collector_score,
      language: field_lang_score,
      image_match: image_score
    }

    confidence =
      scores
      |> combined_confidence(phrase_evidence)
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
        matched_flavor_name: printing.flavor_name,
        matched_flavor_text: printing.flavor_text,
        matched_set_code: printing.set_code,
        matched_collector_number: printing.collector_number,
        image_match: image_match,
        scores: scores,
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
    |> Kernel.*(0.9)
    |> float_score()
  end

  defp combined_confidence(scores, phrase_evidence) do
    confidence =
      min(
        scores.token_match + scores.phrase_match + scores.set_code + scores.collector_number +
          scores.language + scores.image_match,
        1.0
      )

    if reliable_recognition_evidence?(scores, phrase_evidence) do
      confidence
    else
      min(confidence, @uncertain_ocr_confidence_cap)
    end
  end

  defp reliable_recognition_evidence?(scores, phrase_evidence) do
    Enum.any?(phrase_evidence, &(&1.field == :name)) or
      (float_score(scores.set_code) > 0.0 and float_score(scores.collector_number) > 0.0) or
      float_score(scores.image_match) >= @title_ocr_min_confidence
  end

  defp normalized_score_fields(%Printing{card: card} = printing) do
    names = Enum.map(title_names(printing), &normalize_text/1)

    %{
      name: Enum.join(names, " "),
      names: names,
      compact_name: Enum.map_join(names, " ", &compact_text/1),
      type_line: normalize_text(card.type_line || ""),
      oracle_text: normalize_text(card.oracle_text || ""),
      flavor_text: normalize_text(printing.flavor_text || ""),
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
      if(name_phrase_hit?, do: 0, else: 1),
      if(token_printing?(candidate.printing), do: 1, else: 0),
      -float_score(scores.image_match),
      -float_score(scores.collector_number),
      -float_score(scores.set_code),
      -float_score(scores.phrase_match),
      if(type_phrase_hit?, do: 0, else: 1),
      -float_score(scores.language),
      -float_score(scores.token_match),
      -name_token_weight,
      -type_token_weight,
      -oracle_token_weight,
      candidate.printing.scryfall_id
    }
  end

  defp token_printing?(%Printing{card: %Card{type_line: type_line}}) when is_binary(type_line) do
    type_line
    |> normalize_text()
    |> String.starts_with?("token")
  end

  defp token_printing?(_printing), do: false

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
      {:oracle_text, 1, score_fields.oracle_text},
      {:flavor_text, 1, score_fields.flavor_text}
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
    name_texts = score_fields.names
    oracle_text_n = score_fields.oracle_text
    flavor_text_n = score_fields.flavor_text
    type_text = score_fields.type_line

    phrase_hits =
      lines
      |> phrase_scoring_lines()
      |> Enum.map(fn {line, index} ->
        line_variants = line_variants(line)
        title_line? = index == 0
        title_name_line? = index <= 1

        cond do
          title_name_line? and
              Enum.any?(name_texts, fn name_text ->
                Enum.any?(line_variants, &name_phrase_match?(name_text, &1, title_line?))
              end) ->
            weight = if title_line?, do: @phrase_name_weight, else: @phrase_name_weight / 2
            {:name, line, weight}

          Enum.any?(line_variants, &(&1 == type_text)) ->
            {:type_line, line, @phrase_type_weight}

          Enum.any?(line_variants, fn normalized_line ->
            phrase_word_count(normalized_line) >= @phrase_min_words and
                phrase_contains?(oracle_text_n, normalized_line)
          end) ->
            {:oracle_text, line, @phrase_oracle_weight}

          Enum.any?(line_variants, fn normalized_line ->
            phrase_word_count(normalized_line) >= @phrase_min_words and
                phrase_contains?(flavor_text_n, normalized_line)
          end) ->
            {:flavor_text, line, @phrase_oracle_weight}

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

  defp phrase_scoring_lines(lines) do
    indexed_lines = Enum.with_index(lines)

    joined_title_lines =
      for chunk_size <- [2, 3],
          chunk <- indexed_lines |> Enum.take(5) |> Enum.chunk_every(chunk_size, 1, :discard) do
        first_index = chunk |> hd() |> elem(1)
        line = chunk |> Enum.map_join(" ", &elem(&1, 0))
        {line, first_index}
      end

    indexed_lines ++ joined_title_lines
  end

  defp phrase_word_count(text) do
    text
    |> normalize_titleish_text()
    |> String.replace(~r/[-\/]+/, " ")
    |> String.replace(~r/[^a-z0-9\s]/, " ")
    |> String.split(~r/\s+/, trim: true)
    |> length()
  end

  defp title_word_count(text) do
    text
    |> normalize_titleish_text()
    |> String.replace(~r/[-\/]+/, " ")
    |> phrase_word_count()
  end

  defp name_phrase_match?(card_name, ocr_line, title_line?) do
    cond do
      card_name == "" or ocr_line == "" ->
        false

      card_name == ocr_line ->
        true

      compact_name_candidate?(ocr_line) ->
        compact_title_name_match?(card_name, ocr_line)

      not title_line? and phrase_word_count(card_name) < @phrase_min_words ->
        false

      phrase_word_count(card_name) >= @phrase_min_words and
          phrase_word_count(ocr_line) >= @phrase_min_words ->
        title_name_phrase_match?(card_name, ocr_line, title_line?)

      true ->
        false
    end
  end

  defp title_name_phrase_match?(card_name, ocr_line, true) do
    text_matches_card_name?(ocr_line, card_name) or
      exact_name_inside_ocr_line?(card_name, ocr_line)
  end

  defp title_name_phrase_match?(card_name, ocr_line, false),
    do: phrase_contains?(card_name, ocr_line)

  defp title_name_tokens_match?(title_text, card_name) do
    title_tokens = fuzzy_title_tokens(title_text)
    name_tokens = fuzzy_title_tokens(card_name)

    name_tokens != [] and
      Enum.all?(name_tokens, fn name_token ->
        Enum.any?(title_tokens, &fuzzy_title_token_match?(&1, name_token))
      end)
  end

  defp fuzzy_title_tokens(text) do
    text
    |> normalize_titleish_text()
    |> String.replace(~r/[-\/]+/, " ")
    |> String.replace(~r/[^a-z0-9\s]/, " ")
    |> String.split(~r/\s+/, trim: true)
    |> Enum.reject(fn token ->
      String.length(token) < @min_token_length or token in @noise_tokens
    end)
    |> Enum.uniq()
  end

  defp fuzzy_title_token_match?(title_token, name_token) do
    title_token == name_token or
      (not String.match?(title_token <> name_token, ~r/\d/) and
         min(String.length(title_token), String.length(name_token)) >= 3 and
         abs(String.length(title_token) - String.length(name_token)) <= 2 and
         String.jaro_distance(title_token, name_token) >= @fuzzy_title_token_min_similarity)
  end

  defp compact_title_name_match?(card_name, ocr_line) do
    fuzzy_compact_title_similarity(compact_text(ocr_line), compact_text(card_name)) >=
      @fuzzy_compact_title_candidate_min_similarity
  end

  defp fuzzy_compact_title_similarity(compact_title, compact_name) do
    max_length = max(String.length(compact_title), String.length(compact_name))

    cond do
      compact_title == "" or compact_name == "" ->
        0.0

      max_length < 6 ->
        0.0

      compact_title == compact_name ->
        1.0

      (String.starts_with?(compact_title, compact_name) or
         String.starts_with?(compact_name, compact_title)) and
          abs(String.length(compact_title) - String.length(compact_name)) >= 3 ->
        0.0

      abs(String.length(compact_title) - String.length(compact_name)) > max(2, div(max_length, 4)) ->
        0.0

      true ->
        String.jaro_distance(compact_title, compact_name)
    end
  end

  defp exact_name_inside_ocr_line?(card_name, ocr_line) do
    normalized_card_name = normalize_text(card_name)
    normalized_ocr_line = normalize_text(ocr_line)
    compact_card_name = compact_text(card_name)
    compact_ocr_line = compact_text(ocr_line)

    phrase_word_count(normalized_ocr_line) > phrase_word_count(normalized_card_name) and
      (String.contains?(normalized_ocr_line, normalized_card_name) or
         String.contains?(compact_ocr_line, compact_card_name))
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
