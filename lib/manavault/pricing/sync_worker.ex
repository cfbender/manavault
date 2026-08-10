defmodule Manavault.Pricing.SyncWorker do
  @moduledoc """
  Periodically refreshes vendor prices. Card Kingdom and ManaPool refresh
  every 6 hours; TCGPlayer (via tcgtracking) refreshes daily because its
  upstream data only updates once a day. Staleness is derived from the newest
  `updated_at` per vendor, so failed syncs are retried on the next check.
  """

  use GenServer

  require Logger

  alias Manavault.Pricing

  @default_check_interval :timer.minutes(30)
  @default_initial_delay :timer.minutes(2)
  @task_supervisor Manavault.Pricing.TaskSupervisor

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Queue an immediate sync of all vendors, ignoring staleness."
  def sync_now(opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)

    case Process.whereis(server) do
      nil -> :not_started
      pid -> GenServer.cast(pid, :sync_all)
    end
  end

  @impl true
  def init(opts) do
    state = %{
      check_interval: Keyword.get(opts, :check_interval, @default_check_interval),
      task_supervisor: Keyword.get(opts, :task_supervisor, @task_supervisor),
      task_ref: nil,
      sync_fun: Keyword.get(opts, :sync_fun, &Pricing.sync_vendors/1),
      last_synced_at_fun: Keyword.get(opts, :last_synced_at_fun, &Pricing.last_synced_at/1)
    }

    schedule_check(Keyword.get(opts, :initial_delay, @default_initial_delay))
    {:ok, state}
  end

  @impl true
  def handle_cast(:sync_all, state) do
    {:noreply, sync_vendors(state, Pricing.vendors())}
  end

  @impl true
  def handle_info(:sync_if_stale, state) do
    state = sync_vendors(state, stale_vendors(state))
    schedule_check(state.check_interval)
    {:noreply, state}
  end

  def handle_info({ref, result}, %{task_ref: ref} = state) do
    Process.demonitor(ref, [:flush])
    log_result(result)
    {:noreply, %{state | task_ref: nil}}
  end

  def handle_info({:DOWN, ref, :process, _pid, reason}, %{task_ref: ref} = state) do
    Logger.warning("Vendor price sync crashed: #{inspect(reason)}")
    {:noreply, %{state | task_ref: nil}}
  end

  def handle_info(_message, state), do: {:noreply, state}

  defp stale_vendors(state) do
    Enum.filter(Pricing.vendors(), fn vendor ->
      interval = Manavault.Pricing.Sync.vendor_module(vendor).sync_interval()

      case state.last_synced_at_fun.(vendor) do
        nil ->
          true

        %DateTime{} = synced_at ->
          DateTime.diff(DateTime.utc_now(), synced_at, :millisecond) >= interval
      end
    end)
  end

  defp sync_vendors(state, []), do: state

  defp sync_vendors(%{task_ref: ref} = state, _vendors) when is_reference(ref) do
    Logger.debug("Vendor price sync already running; skipping duplicate request")
    state
  end

  defp sync_vendors(state, vendors) do
    sync_fun = state.sync_fun
    task = Task.Supervisor.async_nolink(state.task_supervisor, fn -> sync_fun.(vendors) end)
    %{state | task_ref: task.ref}
  end

  defp log_result({:ok, results}) do
    summary =
      Enum.map_join(results, " ", fn
        {vendor, {:ok, count}} -> "#{vendor}=#{count}"
        {vendor, {:error, reason}} -> "#{vendor}=error(#{inspect(reason)})"
      end)

    Logger.info("Vendor price sync finished #{summary}")
  end

  defp log_result(other) do
    Logger.debug("Vendor price sync returned #{inspect(other)}")
  end

  defp schedule_check(delay), do: Process.send_after(self(), :sync_if_stale, delay)
end
