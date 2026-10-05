defmodule Manavault.Catalog.ScryfallCatalogWorker do
  @moduledoc false

  use Oban.Worker,
    queue: :catalog,
    max_attempts: 3,
    unique: [period: :infinity, fields: [:worker], states: :incomplete]

  require Logger

  alias Manavault.Catalog
  alias Manavault.Catalog.Scryfall.Sync

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

  @doc """
  Whether the catalog needs another sync: none succeeded yet, the last success
  is older than a day, or it was produced by an older importer version (see
  `Manavault.Catalog.Scryfall.Sync.bulk_type/0`).
  """
  def stale?(nil), do: true

  def stale?(%{status: "succeeded", bulk_type: bulk_type, completed_at: %DateTime{} = at}) do
    bulk_type != Sync.bulk_type() or
      DateTime.diff(DateTime.utc_now(), at, :millisecond) >= @sync_interval
  end

  def stale?(_sync), do: true

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
