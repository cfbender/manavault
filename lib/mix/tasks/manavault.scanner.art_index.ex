defmodule Mix.Tasks.Manavault.Scanner.ArtIndex do
  @moduledoc """
  Builds the local Scryfall art hash index used by the scanner art-first path.
  """

  use Mix.Task

  alias Manavault.Catalog.ArtIndex

  @shortdoc "Builds scanner art hash index"
  @switches [limit: :integer, force: :boolean]

  @impl true
  def run(args) do
    Mix.Task.run("app.start")

    {opts, _rest, _invalid} = OptionParser.parse(args, strict: @switches)

    if opts[:limit] do
      Mix.shell().info(
        "Limited art indexes are benchmark/dev-only and are ignored by live art-first scanning."
      )
    end

    {:ok, %{indexed: indexed, candidates: candidates}} = ArtIndex.build(opts)
    Mix.shell().info("Scanner art index: #{indexed}/#{candidates} hashes indexed")
  end
end
