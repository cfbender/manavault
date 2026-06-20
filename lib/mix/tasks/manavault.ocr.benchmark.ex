defmodule Mix.Tasks.Manavault.Ocr.Benchmark do
  @moduledoc """
  Runs OCR recognition against downloaded Scryfall image fixtures.
  """

  use Mix.Task

  alias Manavault.Catalog.OCRBenchmark

  @switches [max_failures: :integer, limit: :integer, image_match: :boolean]

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
    |> Keyword.put_new(:image_match, false)
  end

  defp print_timings(timings) do
    Mix.shell().info(
      "Timing avg: total=#{format_ms(timings.total_us)} ocr=#{format_ms(timings.ocr_us)} parse=#{format_ms(timings.parse_us)} image=#{format_ms(timings[:image_us])} match=#{format_ms(timings.match_us)}"
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
