defmodule ManavaultWeb.DeckSharePreview.ArtifactCacheTest do
  use Manavault.DataCase, async: false
  use Oban.Testing, repo: Manavault.Repo, engine: Oban.Engines.Lite

  alias ManavaultWeb.DeckSharePreview.ArtifactCache
  alias ManavaultWeb.DeckSharePreview.{ArtifactStore, CoverFetcher, Renderer, RenderWorker}

  setup do
    cache_dir =
      Path.join(
        System.tmp_dir!(),
        "manavault-preview-artifacts-#{System.unique_integer([:positive])}"
      )

    previous = Application.get_env(:manavault, ArtifactCache, [])
    Application.put_env(:manavault, ArtifactCache, Keyword.put(previous, :cache_dir, cache_dir))

    on_exit(fn ->
      Application.put_env(:manavault, ArtifactCache, previous)
      File.rm_rf(cache_dir)
    end)

    {:ok, cache_dir: cache_dir}
  end

  test "a cache miss queues one unique render job and reuses the artifact", context do
    test_pid = self()

    configure(
      cover_fetcher: fn url ->
        send(test_pid, {:cover_fetched, url})
        "data:image/png;base64,Y292ZXI="
      end,
      renderer: fn preview ->
        send(test_pid, {:rendered, preview.deck_name})
        {:ok, "png:#{preview.deck_name}"}
      end
    )

    preview = preview()
    caller = Task.async(fn -> ArtifactCache.png(preview) end)

    assert_enqueued([worker: RenderWorker], 1_000)
    assert [job] = all_enqueued(worker: RenderWorker)
    refute Map.has_key?(job.args["preview"], "token")

    assert {:ok, duplicate_job} = job.args |> RenderWorker.new() |> Oban.insert()
    assert duplicate_job.id == job.id
    assert duplicate_job.conflict?

    assert :ok = perform_job(RenderWorker, job.args)
    assert {:ok, "png:Preview Deck"} = Task.await(caller)
    assert_receive {:cover_fetched, "https://cards.scryfall.io/preview.png"}
    assert_receive {:rendered, "Preview Deck"}

    assert {:ok, "png:Preview Deck"} = ArtifactCache.png(preview)
    assert length(all_enqueued(worker: RenderWorker)) == 1
    assert File.read!(artifact_path(context.cache_dir, preview)) == "png:Preview Deck"
  end

  test "inline render failures return an error and the next request may retry", context do
    configure(
      cover_fetcher: fn _url -> nil end,
      renderer: fn _preview -> {:error, :renderer_unavailable} end
    )

    preview = preview()

    assert {:error, :render_failed} =
             Oban.Testing.with_testing_mode(:inline, fn -> ArtifactCache.png(preview) end)

    refute File.exists?(artifact_path(context.cache_dir, preview))

    configure(renderer: fn _preview -> {:ok, "recovered-png"} end)

    assert {:ok, "recovered-png"} =
             Oban.Testing.with_testing_mode(:inline, fn -> ArtifactCache.png(preview) end)

    assert File.read!(artifact_path(context.cache_dir, preview)) == "recovered-png"
  end

  test "the fingerprint changes for every byte-affecting preview and renderer input" do
    base = preview()
    base_fingerprint = ArtifactCache.fingerprint(base)

    for changed_preview <- [
          %{base | card_count_label: "61 cards"},
          %{base | color_identity: ["U"]},
          %{base | cover_image_url: "https://cards.scryfall.io/another.png"},
          %{base | deck_name: "Another Deck"},
          %{base | format_label: "Modern"},
          %{base | image_alt: "Another preview"},
          Map.put(base, :bracket_label, "Bracket 3 · Pace 2"),
          %{base | legality_label: "Illegal"},
          %{base | price_label: "$2"},
          %{base | status_label: "Archived"}
        ] do
      refute ArtifactCache.fingerprint(changed_preview) == base_fingerprint
    end

    for options <- [
          [asset_version: "asset-v2"],
          [assets_version: "symbols-v2"],
          [renderer_version: "rsvg-v2"],
          [source_version: "preview-v3"]
        ] do
      refute ArtifactCache.fingerprint(base, options) == base_fingerprint
    end
  end

  test "the fingerprint changes when the bearer token rotates" do
    base = Map.put(preview(), :token, Manavault.Catalog.Decks.ShareToken.generate())
    rotated = Map.put(base, :token, Manavault.Catalog.Decks.ShareToken.generate())

    refute ArtifactCache.fingerprint(base) == ArtifactCache.fingerprint(rotated)
  end

  test "invalid, timed out, and oversized remote covers fall back safely" do
    url = "https://cards.scryfall.io/preview.png"

    assert "data:image/png;base64,cG5n" =
             CoverFetcher.prepare(url,
               max_bytes: 4,
               fetcher: fn _url, _opts ->
                 {:ok,
                  %{
                    status: 200,
                    headers: %{"content-length" => ["3"], "content-type" => ["image/png"]},
                    body: "png"
                  }}
               end
             )

    assert nil ==
             CoverFetcher.prepare(url,
               fetcher: fn _url, _opts -> {:error, :timeout} end
             )

    assert nil ==
             CoverFetcher.prepare(url,
               max_bytes: 4,
               fetcher: fn _url, _opts ->
                 {:ok,
                  %{
                    status: 200,
                    headers: %{"content-length" => ["5"], "content-type" => ["image/png"]},
                    body: "png"
                  }}
               end
             )

    assert nil ==
             CoverFetcher.prepare(url,
               max_bytes: 4,
               fetcher: fn _url, _opts ->
                 {:ok,
                  %{
                    status: 200,
                    headers: %{"content-type" => ["image/png"]},
                    body: "overs"
                  }}
               end
             )

    assert nil ==
             CoverFetcher.prepare(url,
               fetcher: fn _url, _opts ->
                 {:ok,
                  %{
                    status: 200,
                    headers: %{"content-type" => ["text/html"]},
                    body: "not an image"
                  }}
               end
             )

    assert nil == CoverFetcher.prepare("http://cards.scryfall.io/preview.png")
    assert nil == CoverFetcher.prepare("https://example.com/preview.png")
  end

  test "render startup removes stale partial artifacts", context do
    File.mkdir_p!(context.cache_dir)
    stale_path = Path.join(context.cache_dir, "orphan.png.tmp-interrupted")
    File.write!(stale_path, "partial")

    assert {:error, :renderer_unavailable} =
             RenderWorker.render(preview(), ArtifactCache.fingerprint(preview()),
               cache_dir: context.cache_dir,
               cover_fetcher: fn _url -> nil end,
               renderer: fn _preview -> {:error, :renderer_unavailable} end
             )

    refute File.exists?(stale_path)
  end

  test "retention prunes the oldest artifacts without deleting the published artifact", context do
    File.mkdir_p!(context.cache_dir)
    oldest = String.duplicate("a", 64)
    middle = String.duplicate("b", 64)
    current = String.duplicate("c", 64)

    assert :ok = ArtifactStore.write(context.cache_dir, oldest, "oldest", 2)

    assert :ok =
             File.touch(ArtifactStore.path(context.cache_dir, oldest), {{2020, 1, 1}, {0, 0, 0}})

    assert :ok = ArtifactStore.write(context.cache_dir, middle, "middle", 2)

    assert :ok =
             File.touch(ArtifactStore.path(context.cache_dir, middle), {{2021, 1, 1}, {0, 0, 0}})

    assert :ok = ArtifactStore.write(context.cache_dir, current, "current", 2)

    refute File.exists?(ArtifactStore.path(context.cache_dir, oldest))
    assert File.read!(ArtifactStore.path(context.cache_dir, middle)) == "middle"
    assert File.read!(ArtifactStore.path(context.cache_dir, current)) == "current"
  end

  test "the renderer command runner is injectable" do
    test_pid = self()

    assert {:ok, "fake png"} =
             Renderer.render(preview(),
               command_runner: fn command, args ->
                 send(test_pid, {:renderer_command, command, args})
                 assert File.read!(List.last(args)) =~ "<svg"
                 {"fake png", 0}
               end
             )

    assert_receive {:renderer_command, "rsvg-convert", _args}
  end

  defp configure(options) do
    config = Application.fetch_env!(:manavault, ArtifactCache)
    Application.put_env(:manavault, ArtifactCache, Keyword.merge(config, options))
  end

  defp artifact_path(cache_dir, preview) do
    ArtifactStore.path(cache_dir, ArtifactCache.fingerprint(preview))
  end

  defp preview do
    %{
      kind: :deck,
      card_count_label: "60 cards",
      color_identity: ["W"],
      cover_image_url: "https://cards.scryfall.io/preview.png",
      deck_name: "Preview Deck",
      format_label: "Commander",
      image_alt: "Preview for Preview Deck",
      legality_label: "Legal",
      price_label: "$1",
      status_label: "Active"
    }
  end
end
