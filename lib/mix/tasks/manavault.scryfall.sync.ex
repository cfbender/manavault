defmodule Mix.Tasks.Manavault.Scryfall.Sync do
  @moduledoc """
  Syncs the local Scryfall catalog from Scryfall bulk data.

      mix manavault.scryfall.sync
  """

  use Mix.Task

  @shortdoc "Syncs the local Scryfall catalog"

  @impl Mix.Task
  def run(_args) do
    Mix.Task.run("app.start")

    case Manavault.Catalog.sync_scryfall() do
      {:ok, sync} ->
        Mix.shell().info(
          "Scryfall sync succeeded: #{sync.cards_count} cards, #{sync.printings_count} printings"
        )

      {:error, changeset} ->
        Mix.raise("Scryfall sync failed to record status: #{inspect(changeset.errors)}")
    end
  end
end
