defmodule Manavault.Catalog.ScryfallAssetsWorker do
  @moduledoc false

  use Oban.Worker,
    queue: :catalog,
    max_attempts: 3,
    unique: [period: :infinity, fields: [:worker], states: :incomplete]

  require Logger

  alias Manavault.ScryfallAssets

  @sync_interval :timer.hours(24)

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    if args["force"] || stale?(ScryfallAssets.latest_sync_completed_at()) do
      sync()
    else
      :ok
    end
  end

  @impl Oban.Worker
  def timeout(_job), do: :timer.minutes(10)

  defp stale?(nil), do: true

  defp stale?(%DateTime{} = completed_at) do
    DateTime.diff(DateTime.utc_now(), completed_at, :millisecond) >= @sync_interval
  end

  defp sync do
    case ScryfallAssets.sync() do
      {:ok, %{symbols_count: symbols_count, sets_count: sets_count}} ->
        Logger.info(
          "Scryfall asset sync completed: #{symbols_count} symbols, #{sets_count} set icons"
        )

        :ok

      {:error, reason} ->
        Logger.warning("Scryfall asset sync failed: #{inspect(reason)}")
        {:error, reason}
    end
  end
end
