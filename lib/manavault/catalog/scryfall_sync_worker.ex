defmodule Manavault.Catalog.ScryfallSyncWorker do
  @moduledoc false

  use GenServer

  require Logger

  alias Manavault.ScryfallAssets
  alias Manavault.Catalog

  @default_interval :timer.hours(24)
  @default_initial_delay :timer.seconds(30)
  @task_supervisor Manavault.Catalog.TaskSupervisor

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def reload_catalog_async(opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)

    case server_pid(server) do
      nil -> :not_started
      pid -> GenServer.cast(pid, :reload_catalog)
    end
  end

  def reload_assets_async(opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)

    case server_pid(server) do
      nil -> :not_started
      pid -> GenServer.cast(pid, :reload_assets)
    end
  end

  @impl true
  def init(opts) do
    interval = Keyword.get(opts, :interval, configured_interval())
    initial_delay = Keyword.get(opts, :initial_delay, configured_initial_delay())

    state = %{
      interval: interval,
      initial_delay: initial_delay,
      task_supervisor: Keyword.get(opts, :task_supervisor, @task_supervisor),
      catalog_task_ref: nil,
      assets_task_ref: nil,
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
  def handle_cast(:reload_catalog, state) do
    {:noreply, sync_catalog(state)}
  end

  def handle_cast(:reload_assets, state) do
    {:noreply, sync_assets(state)}
  end

  @impl true
  def handle_info(:sync_if_stale, state) do
    state =
      state
      |> sync_catalog_if_stale()
      |> sync_assets_if_stale()

    schedule_sync(state.interval)
    {:noreply, state}
  end

  # A sync task finished; log its result and free the slot.
  def handle_info({ref, result}, %{catalog_task_ref: ref} = state) do
    Process.demonitor(ref, [:flush])
    log_catalog_result(result)
    {:noreply, %{state | catalog_task_ref: nil}}
  end

  def handle_info({ref, result}, %{assets_task_ref: ref} = state) do
    Process.demonitor(ref, [:flush])
    log_assets_result(result)
    {:noreply, %{state | assets_task_ref: nil}}
  end

  def handle_info({:DOWN, ref, :process, _pid, reason}, %{catalog_task_ref: ref} = state) do
    Logger.warning("Scryfall catalog sync crashed: #{inspect(reason)}")
    {:noreply, %{state | catalog_task_ref: nil}}
  end

  def handle_info({:DOWN, ref, :process, _pid, reason}, %{assets_task_ref: ref} = state) do
    Logger.warning("Scryfall asset sync crashed: #{inspect(reason)}")
    {:noreply, %{state | assets_task_ref: nil}}
  end

  def handle_info(_message, state), do: {:noreply, state}

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
      sync_catalog(state)
    else
      state
    end
  end

  # Run the (multi-minute) sync in a supervised task so it never blocks the
  # GenServer, and drop the request if a catalog sync is already in flight so
  # rapid triggers can't stack up.
  defp sync_catalog(%{catalog_task_ref: ref} = state) when is_reference(ref) do
    Logger.debug("Scryfall catalog sync already running; skipping duplicate request")
    state
  end

  defp sync_catalog(state) do
    task = Task.Supervisor.async_nolink(state.task_supervisor, state.sync_fun)
    %{state | catalog_task_ref: task.ref}
  end

  defp sync_assets_if_stale(state) do
    if stale?(state.latest_asset_sync_fun.(), state.interval) do
      sync_assets(state)
    else
      state
    end
  end

  defp sync_assets(%{assets_task_ref: ref} = state) when is_reference(ref) do
    Logger.debug("Scryfall asset sync already running; skipping duplicate request")
    state
  end

  defp sync_assets(state) do
    task = Task.Supervisor.async_nolink(state.task_supervisor, state.asset_sync_fun)
    %{state | assets_task_ref: task.ref}
  end

  defp log_catalog_result({:ok, sync}) do
    Logger.info("Scryfall catalog sync completed: #{sync.printings_count} printings")
  end

  defp log_catalog_result({:error, %{error: error}}) do
    Logger.warning("Scryfall catalog sync failed: #{error}")
  end

  defp log_catalog_result({:error, reason}) do
    Logger.warning("Scryfall catalog sync failed: #{inspect(reason)}")
  end

  defp log_catalog_result(other) do
    Logger.debug("Scryfall catalog sync returned #{inspect(other)}")
  end

  defp log_assets_result({:ok, %{symbols_count: symbols_count, sets_count: sets_count}}) do
    Logger.info(
      "Scryfall asset sync completed: #{symbols_count} symbols, #{sets_count} set icons"
    )
  end

  defp log_assets_result({:error, reason}) do
    Logger.warning("Scryfall asset sync failed: #{inspect(reason)}")
  end

  defp log_assets_result(other) do
    Logger.debug("Scryfall asset sync returned #{inspect(other)}")
  end

  defp schedule_sync(delay), do: Process.send_after(self(), :sync_if_stale, delay)

  defp server_pid(server) when is_pid(server), do: server

  defp server_pid(server) when is_atom(server) do
    Process.whereis(server)
  end

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
