defmodule ManavaultWeb.DeckSharePreview.ArtifactCache do
  @moduledoc """
  Queues and shares generated public-preview PNG artifacts through Oban.

  Requests for the same content fingerprint share one unique render job. The
  caller waits for that job while completed artifacts are served directly from
  the content-addressed store.
  """

  alias ManavaultWeb.{AssetVersion, DeckSharePreview}
  alias ManavaultWeb.DeckSharePreview.{ArtifactStore, RenderWorker}

  @default_assets_version "scryfall-symbols-v1"
  @default_renderer_version "rsvg-convert"
  @await_timeout :timer.minutes(2)
  @poll_interval 100

  def png(%{kind: :deck} = preview, opts \\ []) do
    config = configured_options(opts)
    fingerprint = fingerprint(preview, config)
    cache_dir = Keyword.fetch!(config, :cache_dir)

    case ArtifactStore.read(cache_dir, fingerprint) do
      {:ok, png} -> {:ok, png}
      {:error, _reason} -> enqueue_and_await(preview, fingerprint, cache_dir)
    end
  end

  def fingerprint(%{kind: :deck} = preview, opts \\ []) do
    preview
    |> fingerprint_payload(fingerprint_options(opts))
    |> :erlang.term_to_binary([:deterministic])
    |> then(&:crypto.hash(:sha256, &1))
    |> Base.encode16(case: :lower)
  end

  defp enqueue_and_await(preview, fingerprint, cache_dir) do
    channel = RenderWorker.notification_channel()
    :ok = Oban.Notifier.listen(channel)

    try do
      case ArtifactStore.read(cache_dir, fingerprint) do
        {:ok, png} ->
          {:ok, png}

        {:error, _reason} ->
          preview
          |> job_args(fingerprint)
          |> RenderWorker.new()
          |> Oban.insert()
          |> case do
            {:ok, _job} -> await_artifact(cache_dir, fingerprint)
            {:error, _changeset} -> {:error, :enqueue_failed}
          end
      end
    after
      Oban.Notifier.unlisten(channel)
    end
  end

  defp await_artifact(cache_dir, fingerprint) do
    case ArtifactStore.read(cache_dir, fingerprint) do
      {:ok, png} ->
        {:ok, png}

      {:error, _reason} ->
        deadline = System.monotonic_time(:millisecond) + @await_timeout
        await_artifact(cache_dir, fingerprint, deadline)
    end
  end

  defp await_artifact(cache_dir, fingerprint, deadline) do
    remaining = deadline - System.monotonic_time(:millisecond)

    if remaining <= 0 do
      {:error, :render_timeout}
    else
      receive do
        {:notification, :preview_rendered, %{"fingerprint" => ^fingerprint, "status" => "ok"}} ->
          await_artifact(cache_dir, fingerprint, deadline)

        {:notification, :preview_rendered, %{"fingerprint" => ^fingerprint, "status" => "error"}} ->
          {:error, :render_failed}
      after
        min(remaining, @poll_interval) ->
          case ArtifactStore.read(cache_dir, fingerprint) do
            {:ok, png} -> {:ok, png}
            {:error, _reason} -> await_artifact(cache_dir, fingerprint, deadline)
          end
      end
    end
  end

  defp job_args(preview, fingerprint) do
    %{
      fingerprint: fingerprint,
      preview: %{
        card_count_label: preview.card_count_label,
        color_identity: List.wrap(preview.color_identity),
        cover_image_url: preview.cover_image_url,
        deck_name: preview.deck_name,
        format_label: preview.format_label,
        image_alt: preview.image_alt,
        bracket_label: Map.get(preview, :bracket_label),
        legality_label: preview.legality_label,
        price_label: preview.price_label,
        status_label: preview.status_label
      }
    }
  end

  defp fingerprint_payload(preview, opts) do
    %{
      artifact_format: "png",
      assets_version: Keyword.fetch!(opts, :assets_version),
      asset_version: Keyword.fetch!(opts, :asset_version),
      dimensions: %{
        height: DeckSharePreview.image_height(),
        width: DeckSharePreview.image_width()
      },
      preview: %{
        token: Map.get(preview, :token),
        card_count_label: preview.card_count_label,
        color_identity: List.wrap(preview.color_identity),
        cover_image_url: preview.cover_image_url,
        deck_name: preview.deck_name,
        format_label: preview.format_label,
        image_alt: preview.image_alt,
        bracket_label: Map.get(preview, :bracket_label),
        legality_label: preview.legality_label,
        price_label: preview.price_label,
        status_label: preview.status_label
      },
      renderer_options: %{
        symbol_embedding: "data-uri",
        version: Keyword.fetch!(opts, :renderer_version)
      },
      source_version: Keyword.fetch!(opts, :source_version)
    }
  end

  defp configured_options(opts) do
    :manavault
    |> Application.get_env(__MODULE__, [])
    |> Keyword.merge(opts)
  end

  defp fingerprint_options(opts) do
    [
      assets_version: Keyword.get(opts, :assets_version, @default_assets_version),
      asset_version: Keyword.get(opts, :asset_version, AssetVersion.current()),
      renderer_version: Keyword.get(opts, :renderer_version, @default_renderer_version),
      source_version: Keyword.get(opts, :source_version, DeckSharePreview.source_version())
    ]
  end
end
