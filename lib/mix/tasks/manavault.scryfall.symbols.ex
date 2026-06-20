defmodule Mix.Tasks.Manavault.Scryfall.Symbols do
  use Mix.Task

  @shortdoc "Refreshes runtime-cached Scryfall symbol and set SVG assets"

  @impl Mix.Task
  def run(_args) do
    Mix.Task.run("app.start")

    case Manavault.ScryfallAssets.sync() do
      {:ok, %{symbols_count: symbols_count, sets_count: sets_count}} ->
        Mix.shell().info(
          "Downloaded #{symbols_count} Scryfall card symbols and #{sets_count} set icons."
        )

      {:error, reason} ->
        Mix.raise("Scryfall symbol sync failed: #{inspect(reason)}")
    end
  end
end
