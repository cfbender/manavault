defmodule Manavault.Catalog.ScryfallSyncWorker do
  @moduledoc false

  use GenServer

  require Logger

  alias Manavault.ScryfallAssets
  alias Manavault.Catalog

  @default_interval :timer.hours(24)
  @default_initial_delay :timer.seconds(30)

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(opts) do
    interval = Keyword.get(opts, :interval, configured_interval())
    initial_delay = Keyword.get(opts, :initial_delay, configured_initial_delay())

    state = %{
      interval: interval,
      initial_delay: initial_delay,
      sync_fun: Keyword.get(opts, :sync_fun, &Catalog.sync_scryfall/0),
      latest_sync_fun: Keyword.get(opts, :latest_sync_fun, &Catalog.latest_sync/0),
      asset_sync_fun: Keyword.get(opts, :asset_sync_fun, &ScryfallAssets.sync/0),
      latest_asset_sync_fun:
        Keyword.get(opts, :latest_asset_sync_fun, &ScryfallAssets.latest_sync_completed_at/0)
    }

    schedule_sync(initial_delay)
    {:ok, state}
  end

  @impl true
  def handle_info(:sync_if_stale, state) do
    sync_catalog_if_stale(state)
    sync_assets_if_stale(state)
    schedule_sync(state.interval)
    {:noreply, state}
  end

  defp stale?(nil, _interval), do: true

  defp stale?(%{status: "succeeded", completed_at: %DateTime{} = completed_at}, interval) do
    DateTime.diff(DateTime.utc_now(), completed_at, :millisecond) >= interval
  end

  defp stale?(%DateTime{} = completed_at, interval) do
    DateTime.diff(DateTime.utc_now(), completed_at, :millisecond) >= interval
  end

  defp stale?(_sync, _interval), do: true

  defp sync_catalog_if_stale(state) do
    if stale?(state.latest_sync_fun.(), state.interval) do
      case state.sync_fun.() do
        {:ok, sync} ->
          Logger.info("Scryfall catalog sync completed: #{sync.printings_count} printings")

        {:error, %{error: error}} ->
          Logger.warning("Scryfall catalog sync failed: #{error}")

        {:error, reason} ->
          Logger.warning("Scryfall catalog sync failed: #{inspect(reason)}")
      end
    end
  end

  defp sync_assets_if_stale(state) do
    if stale?(state.latest_asset_sync_fun.(), state.interval) do
      case state.asset_sync_fun.() do
        {:ok, %{symbols_count: symbols_count, sets_count: sets_count}} ->
          Logger.info(
            "Scryfall asset sync completed: #{symbols_count} symbols, #{sets_count} set icons"
          )

        {:error, reason} ->
          Logger.warning("Scryfall asset sync failed: #{inspect(reason)}")
      end
    end
  end

  defp schedule_sync(delay), do: Process.send_after(self(), :sync_if_stale, delay)

  defp configured_interval do
    :manavault
    |> Application.get_env(__MODULE__, [])
    |> Keyword.get(:interval, @default_interval)
  end

  defp configured_initial_delay do
    :manavault
    |> Application.get_env(__MODULE__, [])
    |> Keyword.get(:initial_delay, @default_initial_delay)
  end
end
