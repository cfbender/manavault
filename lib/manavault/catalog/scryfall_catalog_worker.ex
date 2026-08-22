defmodule Manavault.Catalog.ScryfallCatalogWorker do
  @moduledoc false

  use Oban.Worker,
    queue: :catalog,
    max_attempts: 3,
    unique: [period: :infinity, fields: [:worker], states: :incomplete]

  require Logger

  alias Manavault.Catalog

  @sync_interval :timer.hours(24)

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    if args["force"] || stale?(Catalog.latest_sync()) do
      sync()
    else
      :ok
    end
  end

  @impl Oban.Worker
  def timeout(_job), do: :timer.minutes(30)

  defp stale?(nil), do: true

  defp stale?(%{status: "succeeded", completed_at: %DateTime{} = completed_at}) do
    DateTime.diff(DateTime.utc_now(), completed_at, :millisecond) >= @sync_interval
  end

  defp stale?(_sync), do: true

  defp sync do
    case Catalog.sync_scryfall() do
      {:ok, sync} ->
        Logger.info("Scryfall catalog sync completed: #{sync.printings_count} printings")
        :ok

      {:error, %{error: error}} ->
        Logger.warning("Scryfall catalog sync failed: #{error}")
        {:error, error}

      {:error, reason} ->
        Logger.warning("Scryfall catalog sync failed: #{inspect(reason)}")
        {:error, reason}
    end
  end
end
