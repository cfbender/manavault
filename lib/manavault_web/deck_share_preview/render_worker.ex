defmodule ManavaultWeb.DeckSharePreview.RenderWorker do
  @moduledoc false

  use Oban.Worker,
    queue: :preview,
    max_attempts: 3,
    unique: [
      period: :infinity,
      fields: [:worker, :args],
      keys: [:fingerprint],
      states: :incomplete
    ]

  alias ManavaultWeb.DeckSharePreview.{ArtifactStore, CoverFetcher, Renderer}

  @notification_channel :preview_rendered

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"fingerprint" => fingerprint, "preview" => preview}}) do
    result = render(preview_from_args(preview), fingerprint)
    notify(fingerprint, result)

    case result do
      {:ok, _png} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  @impl Oban.Worker
  def timeout(_job), do: :timer.minutes(2)

  def notification_channel, do: @notification_channel

  def render(preview, fingerprint, opts \\ []) do
    config =
      :manavault
      |> Application.get_env(ManavaultWeb.DeckSharePreview.ArtifactCache, [])
      |> Keyword.merge(opts)

    cache_dir = Keyword.fetch!(config, :cache_dir)
    max_artifacts = Keyword.get(config, :max_artifacts, 500)
    cover_fetcher = Keyword.get(config, :cover_fetcher, &CoverFetcher.prepare/1)
    renderer = Keyword.get(config, :renderer, &Renderer.render/1)

    with :ok <- ArtifactStore.prepare(cache_dir, max_artifacts),
         cover_image_url <- cover_fetcher.(preview.cover_image_url),
         preview <- %{preview | cover_image_url: cover_image_url},
         {:ok, png} when is_binary(png) <- renderer.(preview),
         :ok <- ArtifactStore.write(cache_dir, fingerprint, png, max_artifacts) do
      {:ok, png}
    else
      {:error, reason} -> {:error, reason}
      _result -> {:error, :render_failed}
    end
  end

  defp preview_from_args(preview) do
    %{
      kind: :deck,
      token: preview["token"],
      card_count_label: preview["card_count_label"],
      color_identity: preview["color_identity"],
      cover_image_url: preview["cover_image_url"],
      deck_name: preview["deck_name"],
      format_label: preview["format_label"],
      image_alt: preview["image_alt"],
      bracket_label: preview["bracket_label"],
      legality_label: preview["legality_label"],
      price_label: preview["price_label"],
      status_label: preview["status_label"]
    }
  end

  defp notify(fingerprint, {:ok, _png}) do
    Oban.Notifier.notify(@notification_channel, %{fingerprint: fingerprint, status: "ok"})
  end

  defp notify(fingerprint, {:error, reason}) do
    Oban.Notifier.notify(@notification_channel, %{
      fingerprint: fingerprint,
      status: "error",
      reason: inspect(reason)
    })
  end
end
