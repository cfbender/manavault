defmodule ManavaultWeb.DeckSharePreview.ArtifactCache do
  @moduledoc """
  Shares generated public-preview PNG artifacts across requests.

  At most `max_concurrency` render tasks run application-wide (two by default).
  Requests for the same content fingerprint join one render; different
  fingerprints wait in a FIFO queue once that finite bound is reached.
  """

  use GenServer

  alias ManavaultWeb.{AssetVersion, DeckSharePreview}
  alias ManavaultWeb.DeckSharePreview.{ArtifactStore, CoverFetcher, Renderer}

  @default_max_concurrency 2
  @default_assets_version "scryfall-symbols-v1"
  @default_renderer_version "rsvg-convert"

  def start_link(opts \\ []) do
    case Keyword.get(opts, :name, __MODULE__) do
      nil -> GenServer.start_link(__MODULE__, opts)
      name -> GenServer.start_link(__MODULE__, opts, name: name)
    end
  end

  def png(%{kind: :deck} = preview, opts \\ []) do
    GenServer.call(Keyword.get(opts, :server, __MODULE__), {:png, preview}, :infinity)
  end

  def fingerprint(%{kind: :deck} = preview, opts \\ []) do
    preview
    |> fingerprint_payload(fingerprint_options(opts))
    |> :erlang.term_to_binary([:deterministic])
    |> then(&:crypto.hash(:sha256, &1))
    |> Base.encode16(case: :lower)
  end

  @impl true
  def init(opts) do
    config = Application.get_env(:manavault, __MODULE__, [])
    opts = Keyword.merge(config, opts)
    cache_dir = Keyword.fetch!(opts, :cache_dir)

    case ArtifactStore.prepare(cache_dir) do
      :ok ->
        {:ok,
         %{
           cache_dir: cache_dir,
           cover_fetcher: Keyword.get(opts, :cover_fetcher, &CoverFetcher.prepare/1),
           fingerprint_options: fingerprint_options(opts),
           jobs: %{},
           max_concurrency: positive_integer(Keyword.get(opts, :max_concurrency, @default_max_concurrency)),
           queued: :queue.new(),
           renderer: Keyword.get(opts, :renderer, &Renderer.render/1),
           running: %{},
           task_supervisor:
             Keyword.get(opts, :task_supervisor, ManavaultWeb.DeckSharePreview.TaskSupervisor),
           waiter_index: %{}
         }}

      {:error, reason} ->
        {:stop, {:artifact_cache_unavailable, reason}}
    end
  end

  @impl true
  def handle_call({:png, preview}, from, state) do
    fingerprint = fingerprint(preview, state.fingerprint_options)

    case ArtifactStore.read(state.cache_dir, fingerprint) do
      {:ok, png} ->
        {:reply, {:ok, png}, state}

      {:error, _reason} ->
        state = join_or_enqueue(state, fingerprint, preview, from)
        {:noreply, start_queued_jobs(state)}
    end
  end

  @impl true
  def handle_info({task_ref, result}, state) when is_reference(task_ref) do
    case Map.fetch(state.running, task_ref) do
      {:ok, fingerprint} ->
        Process.demonitor(task_ref, [:flush])
        state = %{state | running: Map.delete(state.running, task_ref)}
        {:noreply, finish_job(state, fingerprint, artifact_result(state.cache_dir, fingerprint, result))}

      :error ->
        {:noreply, state}
    end
  end

  def handle_info({:DOWN, ref, :process, _pid, _reason}, state) do
    case Map.pop(state.running, ref) do
      {nil, _running} ->
        {:noreply, remove_dead_waiter(state, ref)}

      {fingerprint, running} ->
        state = %{state | running: running}
        {:noreply, finish_job(state, fingerprint, {:error, :render_failed})}
    end
  end

  defp join_or_enqueue(state, fingerprint, preview, from) do
    {waiter_ref, waiter_index} = monitor_waiter(from, fingerprint, state.waiter_index)

    case Map.fetch(state.jobs, fingerprint) do
      {:ok, job} ->
        job = %{job | waiters: Map.put(job.waiters, waiter_ref, from)}
        %{state | jobs: Map.put(state.jobs, fingerprint, job), waiter_index: waiter_index}

      :error ->
        job = %{preview: preview, task_ref: nil, waiters: %{waiter_ref => from}}

        %{
          state
          | jobs: Map.put(state.jobs, fingerprint, job),
            queued: :queue.in(fingerprint, state.queued),
            waiter_index: waiter_index
        }
    end
  end

  defp monitor_waiter({pid, _tag}, fingerprint, waiter_index) do
    waiter_ref = Process.monitor(pid)
    {waiter_ref, Map.put(waiter_index, waiter_ref, fingerprint)}
  end

  defp start_queued_jobs(state) do
    if map_size(state.running) < state.max_concurrency do
      case :queue.out(state.queued) do
        {{:value, fingerprint}, queued} ->
          job = Map.fetch!(state.jobs, fingerprint)

          cover_fetcher = state.cover_fetcher
          renderer = state.renderer

          task =
            Task.Supervisor.async_nolink(state.task_supervisor, fn ->
              render_preview(job.preview, cover_fetcher, renderer)
            end)

          job = %{job | task_ref: task.ref}

          state = %{
            state
            | jobs: Map.put(state.jobs, fingerprint, job),
              queued: queued,
              running: Map.put(state.running, task.ref, fingerprint)
          }

          start_queued_jobs(state)

        {:empty, _queued} ->
          state
      end
    else
      state
    end
  end

  defp render_preview(preview, cover_fetcher, renderer) do
    cover_image_url = cover_fetcher.(preview.cover_image_url)
    preview = %{preview | cover_image_url: cover_image_url}

    case renderer.(preview) do
      {:ok, png} when is_binary(png) -> {:ok, png}
      {:error, reason} -> {:error, reason}
      _result -> {:error, :render_failed}
    end
  end

  defp artifact_result(cache_dir, fingerprint, {:ok, png}) when is_binary(png) do
    case ArtifactStore.write(cache_dir, fingerprint, png) do
      :ok -> {:ok, png}
      {:error, _reason} -> {:error, :artifact_write_failed}
    end
  end

  defp artifact_result(_cache_dir, _fingerprint, {:error, _reason} = error), do: error
  defp artifact_result(_cache_dir, _fingerprint, _result), do: {:error, :render_failed}

  defp finish_job(state, fingerprint, result) do
    {job, jobs} = Map.pop(state.jobs, fingerprint)

    state = %{state | jobs: jobs}

    state =
      Enum.reduce(job.waiters, state, fn {waiter_ref, from}, state ->
        Process.demonitor(waiter_ref, [:flush])
        GenServer.reply(from, result)
        %{state | waiter_index: Map.delete(state.waiter_index, waiter_ref)}
      end)

    start_queued_jobs(state)
  end

  defp remove_dead_waiter(state, waiter_ref) do
    case Map.pop(state.waiter_index, waiter_ref) do
      {nil, _waiter_index} ->
        state

      {fingerprint, waiter_index} ->
        job = Map.fetch!(state.jobs, fingerprint)
        job = %{job | waiters: Map.delete(job.waiters, waiter_ref)}
        %{state | jobs: Map.put(state.jobs, fingerprint, job), waiter_index: waiter_index}
    end
  end

  defp fingerprint_payload(preview, opts) do
    %{
      artifact_format: "png",
      assets_version: Keyword.fetch!(opts, :assets_version),
      asset_version: Keyword.fetch!(opts, :asset_version),
      dimensions: %{height: DeckSharePreview.image_height(), width: DeckSharePreview.image_width()},
      preview: %{
        card_count_label: preview.card_count_label,
        color_identity: List.wrap(preview.color_identity),
        cover_image_url: preview.cover_image_url,
        deck_name: preview.deck_name,
        format_label: preview.format_label,
        image_alt: preview.image_alt,
        legality_label: preview.legality_label,
        price_label: preview.price_label,
        status_label: preview.status_label
      },
      renderer_options: %{symbol_embedding: "data-uri", version: Keyword.fetch!(opts, :renderer_version)},
      source_version: Keyword.fetch!(opts, :source_version)
    }
  end

  defp fingerprint_options(opts) do
    [
      assets_version: Keyword.get(opts, :assets_version, @default_assets_version),
      asset_version: Keyword.get(opts, :asset_version, AssetVersion.current()),
      renderer_version: Keyword.get(opts, :renderer_version, @default_renderer_version),
      source_version: Keyword.get(opts, :source_version, DeckSharePreview.source_version())
    ]
  end

  defp positive_integer(value) when is_integer(value) and value > 0, do: value
  defp positive_integer(_value), do: @default_max_concurrency
end
