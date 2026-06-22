defmodule Manavault.Backup.Scheduler do
  @moduledoc false

  use GenServer

  require Logger

  alias Manavault.Backup.{Cloud, Cron, Settings}

  @minute 60_000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: Keyword.get(opts, :name, __MODULE__))
  end

  @impl true
  def init(opts) do
    tick_after = Keyword.get(opts, :initial_delay, next_minute_delay())
    schedule_tick(tick_after)

    {:ok,
     %{
       last_run_key: nil,
       running?: false,
       backup_fun: Keyword.get(opts, :backup_fun, &Cloud.run_backup/0)
     }}
  end

  @impl true
  def handle_info(:tick, state) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    state = maybe_run_backup(state, now)
    schedule_tick(next_minute_delay())
    {:noreply, state}
  end

  @impl true
  def handle_info({ref, result}, %{task_ref: ref} = state) do
    Process.demonitor(ref, [:flush])
    log_result(result)
    {:noreply, %{state | running?: false, task_ref: nil}}
  end

  @impl true
  def handle_info({:DOWN, ref, :process, _pid, reason}, %{task_ref: ref} = state) do
    Logger.error("scheduled cloud backup crashed: #{inspect(reason)}")
    {:noreply, %{state | running?: false, task_ref: nil}}
  end

  def handle_info(_message, state), do: {:noreply, state}

  defp maybe_run_backup(state, now) do
    settings = Settings.get!()
    run_key = Calendar.strftime(now, "%Y%m%d%H%M")

    cond do
      not settings.enabled ->
        state

      settings.provider == "none" ->
        state

      state.running? ->
        state

      state.last_run_key == run_key ->
        state

      not Cron.matches?(settings.cron, now) ->
        state

      true ->
        task = Task.Supervisor.async_nolink(Manavault.Backup.TaskSupervisor, state.backup_fun)
        %{state | running?: true, task_ref: task.ref, last_run_key: run_key}
    end
  end

  defp schedule_tick(delay), do: Process.send_after(self(), :tick, delay)

  defp next_minute_delay do
    now = DateTime.utc_now()
    @minute - rem(now.second * 1000 + div(now.microsecond |> elem(0), 1000), @minute)
  end

  defp log_result({:ok, remote}),
    do: Logger.info("scheduled cloud backup uploaded #{remote.name}")

  defp log_result({:error, reason}),
    do: Logger.error("scheduled cloud backup failed: #{inspect(reason)}")

  defp log_result(other), do: Logger.debug("scheduled cloud backup returned #{inspect(other)}")
end
