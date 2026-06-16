defmodule Mix.Tasks.Manavault.Ocr.Fixtures do
  @moduledoc """
  Downloads random Scryfall card images for OCR benchmark fixtures.
  """

  use Mix.Task

  alias Manavault.Catalog.OCRBenchmark

  @shortdoc "Downloads random Scryfall OCR fixtures"

  @impl true
  def run(args) do
    Mix.Task.run("app.start")

    count = parse_count(args)

    Mix.shell().info("Downloading OCR fixtures to #{OCRBenchmark.fixtures_dir()}...")

    case OCRBenchmark.download_random_fixtures(count) do
      {:ok, fixtures} ->
        Mix.shell().info("OCR fixture manifest ready: #{length(fixtures)} cards")
        Mix.shell().info(OCRBenchmark.manifest_path())
    end
  end

  defp parse_count(args) do
    {opts, _rest, _invalid} = OptionParser.parse(args, strict: [count: :integer])
    Keyword.get(opts, :count, 200)
  end
end
