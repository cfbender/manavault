defmodule Mix.Tasks.Manavault.Ocr.Benchmark do
  @moduledoc """
  Runs OCR recognition against downloaded Scryfall image fixtures.
  """

  use Mix.Task

  alias Manavault.Catalog.OCRBenchmark

  @switches [
    max_failures: :integer,
    limit: :integer,
    skip: :integer,
    image_match: :boolean,
    title_fast_path: :boolean,
    full_ocr_fallback: :boolean,
    art_first: :boolean,
    indexed_art: :boolean,
    synthetic_camera: :boolean,
    fast_title_only: :boolean
  ]

  @shortdoc "Runs OCR benchmark fixtures"

  @impl true
  def run(args) do
    Mix.Task.run("app.start")

    opts = parse_opts(args)

    case OCRBenchmark.run(opts) do
      {:ok, summary} ->
        Mix.shell().info("OCR benchmark: #{summary.correct}/#{summary.total} correct")
        print_timings(summary.timings)
        Mix.shell().info("Report: #{summary.report_path}")

        Enum.each(summary.failures, &print_failure/1)

        if summary.failed > 0 do
          Mix.raise("OCR benchmark failed: #{summary.failed}/#{summary.total} incorrect")
        end

      {:error, reason} ->
        Mix.raise(reason)
    end
  end

  defp parse_opts(args) do
    {opts, _rest, _invalid} = OptionParser.parse(args, strict: @switches)

    opts
    |> Keyword.put_new(:max_failures, 20)
    |> Keyword.put_new(:limit, :all)
    |> Keyword.put_new(:skip, 0)
    |> Keyword.put_new(:image_match, image_match_from_env())
    |> Keyword.put_new(:art_first, art_first_from_env())
    |> Keyword.put_new(:indexed_art, false)
    |> Keyword.put_new(:synthetic_camera, false)
    |> Keyword.put_new(:title_fast_path, title_fast_path_from_env())
    |> Keyword.put_new(:full_ocr_fallback, full_ocr_fallback_from_env())
    |> Keyword.put_new(:fast_title_only, false)
  end

  defp image_match_from_env do
    case System.get_env("SCAN_IMAGE_MATCHING") do
      nil -> true
      value -> value |> String.downcase() |> then(&(&1 not in ["0", "false", "no", "off"]))
    end
  end

  defp art_first_from_env do
    case System.get_env("SCAN_ART_FIRST") do
      nil -> true
      value -> value |> String.downcase() |> then(&(&1 not in ["0", "false", "no", "off"]))
    end
  end

  defp title_fast_path_from_env do
    case System.get_env("SCAN_TITLE_OCR_FAST_PATH") do
      nil -> true
      value -> value |> String.downcase() |> then(&(&1 not in ["0", "false", "no", "off"]))
    end
  end

  defp full_ocr_fallback_from_env do
    case System.get_env("SCAN_FULL_OCR_FALLBACK") do
      nil -> true
      value -> value |> String.downcase() |> then(&(&1 not in ["0", "false", "no", "off"]))
    end
  end

  defp print_timings(timings) do
    Mix.shell().info(
      "Timing avg: total=#{format_ms(timings.total_us)} ocr=#{format_ms(timings.ocr_us)} title=#{format_ms(timings[:title_ocr_us])} full=#{format_ms(timings[:full_ocr_us])} parse=#{format_ms(timings.parse_us)} image=#{format_ms(timings[:image_us])} match=#{format_ms(timings.match_us)} max_total=#{format_ms(timings[:max_total_us])} max_image=#{format_ms(timings[:max_image_us])} max_match=#{format_ms(timings[:max_match_us])} art_first=#{timings[:art_first_count]} art_accepted=#{timings[:art_first_accepted_count]} title_fast=#{timings[:title_fast_path_count]} title_fallback=#{timings[:title_fallback_count]}"
    )
  end

  defp format_ms(nil), do: "n/a"
  defp format_ms(us), do: "#{Float.round(us / 1_000, 1)}ms"

  defp print_failure(failure) do
    Mix.shell().error("""

    FAIL #{failure.expected_name}
      image: #{failure.fixture["image_path"]}
      expected printing: #{failure.expected_printing_id}
      actual: #{failure.actual_name || "<none>"} #{inspect(failure.actual_printing_id)} conf=#{inspect(failure.confidence)}
      error: #{inspect(Map.get(failure, :error))}
      parsed: #{inspect(failure.parsed)}
      text:\n#{indent(failure.text)}
      candidates: #{inspect(failure.candidates, pretty: true)}
    """)
  end

  defp indent(text) do
    text
    |> String.split("\n")
    |> Enum.map_join("\n", &("        " <> &1))
  end
end
