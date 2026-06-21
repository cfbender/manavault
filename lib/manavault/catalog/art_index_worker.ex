defmodule Manavault.Catalog.ArtIndexWorker do
  @moduledoc """
  Background builder for the persisted scanner art hash index.

  The worker starts an index build after application boot and collapses repeated
  rebuild requests so catalog imports do not spawn overlapping long-running
  download/hash jobs.
  """

  use GenServer

  require Logger

  alias Manavault.Catalog.{ArtIndex, ArtMatcher, ScanRecognition}

  @default_initial_delay 0

  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  def rebuild_async(opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    request_opts = Keyword.delete(opts, :server)

    case server_pid(server) do
      nil -> :not_started
      pid -> GenServer.cast(pid, {:rebuild, request_opts})
    end
  end

  @impl true
  def init(opts) do
    state = %{
      build_fun: Keyword.get(opts, :build_fun, &ArtIndex.build/1),
      initial_delay: Keyword.get(opts, :initial_delay, @default_initial_delay),
      running: nil,
      queued_opts: nil
    }

    Process.send_after(self(), :warm_index, 0)

    if state.initial_delay != false do
      Process.send_after(self(), {:rebuild, reason: :startup}, state.initial_delay)
    end

    {:ok, state}
  end

  @impl true
  def handle_cast({:rebuild, opts}, state) do
    {:noreply, enqueue_build(opts, state)}
  end

  @impl true
  def handle_info({:rebuild, opts}, state) do
    {:noreply, enqueue_build(opts, state)}
  end

  def handle_info(:warm_index, state) do
    %{complete?: complete?, entry_count: entry_count, expected_count: expected_count} =
      ArtMatcher.index_status()

    Logger.info(
      "Scanner art index cache warmed: #{entry_count}/#{expected_count} complete=#{complete?}"
    )

    warm_candidate_index_cache()

    {:noreply, state}
  end

  def handle_info(
        {:art_index_build_result, pid, {:ok, summary}},
        %{running: %{pid: pid, ref: ref}} = state
      ) do
    Process.demonitor(ref, [:flush])

    Logger.info(
      "Scanner art index build completed: #{summary.indexed} indexed from #{summary.candidates} candidates"
    )

    {:noreply, maybe_start_queued(%{state | running: nil})}
  end

  def handle_info(
        {:art_index_build_result, pid, {:error, reason}},
        %{running: %{pid: pid, ref: ref}} = state
      ) do
    Process.demonitor(ref, [:flush])
    Logger.warning("Scanner art index build failed: #{inspect(reason)}")
    {:noreply, maybe_start_queued(%{state | running: nil})}
  end

  def handle_info(
        {:art_index_build_result, pid, other},
        %{running: %{pid: pid, ref: ref}} = state
      ) do
    Process.demonitor(ref, [:flush])
    Logger.warning("Scanner art index build returned unexpected result: #{inspect(other)}")
    {:noreply, maybe_start_queued(%{state | running: nil})}
  end

  def handle_info({:DOWN, ref, :process, _pid, :normal}, %{running: %{ref: ref}} = state) do
    {:noreply, maybe_start_queued(%{state | running: nil})}
  end

  def handle_info({:DOWN, ref, :process, _pid, reason}, %{running: %{ref: ref}} = state) do
    Logger.warning("Scanner art index build crashed: #{inspect(reason)}")
    {:noreply, maybe_start_queued(%{state | running: nil})}
  end

  def handle_info(_message, state), do: {:noreply, state}

  defp enqueue_build(opts, %{running: nil} = state), do: start_build(opts, state)

  defp enqueue_build(opts, state) do
    %{state | queued_opts: merge_rebuild_opts(state.queued_opts, opts)}
  end

  defp maybe_start_queued(%{queued_opts: nil} = state), do: state

  defp maybe_start_queued(%{queued_opts: opts} = state) do
    start_build(opts, %{state | queued_opts: nil})
  end

  defp start_build(opts, state) do
    parent = self()
    build_fun = state.build_fun
    build_opts = build_opts(opts)
    reason = Keyword.get(opts, :reason, :manual)

    Logger.info("Starting scanner art index build reason=#{reason}")

    {pid, ref} =
      spawn_monitor(fn ->
        send(parent, {:art_index_build_result, self(), safe_build(build_fun, build_opts)})
      end)

    %{state | running: %{pid: pid, ref: ref, opts: opts}}
  end

  defp safe_build(build_fun, build_opts) do
    apply_build_fun(build_fun, build_opts)
  rescue
    exception -> {:error, {exception, __STACKTRACE__}}
  catch
    kind, reason -> {:error, {kind, reason}}
  end

  defp warm_candidate_index_cache do
    started_at = System.monotonic_time(:millisecond)
    ScanRecognition.warm_candidate_index_cache()
    elapsed_ms = System.monotonic_time(:millisecond) - started_at
    Logger.info("Scanner OCR candidate index cache warmed in #{elapsed_ms}ms")
  rescue
    exception ->
      Logger.warning(
        "Could not warm scanner OCR candidate index: #{Exception.message(exception)}"
      )
  end

  defp apply_build_fun(build_fun, build_opts) when is_function(build_fun, 1),
    do: build_fun.(build_opts)

  defp apply_build_fun(build_fun, _build_opts) when is_function(build_fun, 0), do: build_fun.()

  defp build_opts(opts) do
    opts
    |> Keyword.take([:force, :limit])
    |> Keyword.put_new(:force, false)
  end

  defp merge_rebuild_opts(nil, opts), do: opts

  defp merge_rebuild_opts(existing, opts) do
    existing
    |> Keyword.merge(opts)
    |> Keyword.put(
      :force,
      Keyword.get(existing, :force, false) or Keyword.get(opts, :force, false)
    )
  end

  defp server_pid(server) when is_pid(server), do: server

  defp server_pid(server) when is_atom(server) do
    Process.whereis(server)
  end
end
