defmodule ManavaultWeb.DeckSharePreview.ArtifactCacheTest do
  use ExUnit.Case, async: false

  alias ManavaultWeb.DeckSharePreview.ArtifactCache
  alias ManavaultWeb.DeckSharePreview.{ArtifactStore, CoverFetcher, Renderer}

  setup do
    cache_dir =
      Path.join(
        System.tmp_dir!(),
        "manavault-preview-artifacts-#{System.unique_integer([:positive])}"
      )

    on_exit(fn -> File.rm_rf(cache_dir) end)

    {:ok, cache_dir: cache_dir, task_supervisor: start_supervised!(Task.Supervisor)}
  end

  test "repeat requests reuse one artifact without cover or renderer work", context do
    test_pid = self()

    cache =
      start_cache(context,
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

    assert {:ok, "png:Preview Deck"} = ArtifactCache.png(preview, server: cache)
    assert_receive {:cover_fetched, "https://cards.scryfall.io/preview.png"}
    assert_receive {:rendered, "Preview Deck"}

    assert {:ok, "png:Preview Deck"} = ArtifactCache.png(preview, server: cache)
    refute_receive {:cover_fetched, _url}
    refute_receive {:rendered, _deck_name}
  end

  test "a shared fingerprint coalesces concurrent callers", context do
    test_pid = self()

    cache =
      start_cache(context,
        cover_fetcher: fn url ->
          send(test_pid, {:cover_fetched, url})
          "data:image/png;base64,Y292ZXI="
        end,
        renderer: fn preview ->
          send(test_pid, {:render_started, preview.deck_name, self()})

          receive do
            :release -> {:ok, "png:#{preview.deck_name}"}
          end
        end
      )

    preview = preview()

    callers =
      Enum.map(1..2, fn _ ->
        Task.async(fn -> ArtifactCache.png(preview, server: cache) end)
      end)

    assert_receive {:cover_fetched, "https://cards.scryfall.io/preview.png"}
    assert_receive {:render_started, "Preview Deck", renderer_pid}
    refute_receive {:cover_fetched, _url}, 100
    refute_receive {:render_started, _deck_name, _pid}, 100

    send(renderer_pid, :release)

    assert Enum.all?(callers, &(Task.await(&1) == {:ok, "png:Preview Deck"}))
  end

  test "different fingerprints respect the finite render concurrency bound", context do
    test_pid = self()

    cache =
      start_cache(context,
        max_concurrency: 2,
        cover_fetcher: fn _url -> nil end,
        renderer: fn preview ->
          send(test_pid, {:render_started, preview.deck_name, self()})

          receive do
            :release -> {:ok, "png:#{preview.deck_name}"}
          end
        end
      )

    previews = Enum.map(["A", "B", "C"], &Map.put(preview(), :deck_name, &1))

    callers =
      Enum.map(previews, fn preview ->
        Task.async(fn -> ArtifactCache.png(preview, server: cache) end)
      end)

    assert_receive {:render_started, _name_one, first_renderer}
    assert_receive {:render_started, _name_two, second_renderer}
    refute_receive {:render_started, _queued_name, _queued_renderer}, 100

    send(first_renderer, :release)
    send(second_renderer, :release)

    assert_receive {:render_started, _name_three, third_renderer}
    send(third_renderer, :release)

    assert Enum.all?(callers, &match?({:ok, _png}, Task.await(&1)))
  end

  test "the fingerprint changes for every byte-affecting preview input and renderer input" do
    base = preview()
    base_fingerprint = ArtifactCache.fingerprint(base)

    for changed_preview <- [
          %{base | card_count_label: "61 cards"},
          %{base | color_identity: ["U"]},
          %{base | cover_image_url: "https://cards.scryfall.io/another.png"},
          %{base | deck_name: "Another Deck"},
          %{base | format_label: "Modern"},
          %{base | image_alt: "Another preview"},
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

  test "startup removes stale partial artifacts", context do
    File.mkdir_p!(context.cache_dir)
    stale_path = Path.join(context.cache_dir, "orphan.png.tmp-interrupted")
    File.write!(stale_path, "partial")

    _cache = start_cache(context, [])

    refute File.exists?(stale_path)
  end

  test "retention prunes the oldest completed artifacts without deleting the published artifact",
       context do
    File.mkdir_p!(context.cache_dir)
    oldest = String.duplicate("a", 64)
    middle = String.duplicate("b", 64)
    current = String.duplicate("c", 64)

    assert :ok = ArtifactStore.write(context.cache_dir, oldest, "oldest", 2)

    assert :ok =
             File.touch(
               ArtifactStore.path(context.cache_dir, oldest),
               {{2020, 1, 1}, {0, 0, 0}}
             )

    assert :ok = ArtifactStore.write(context.cache_dir, middle, "middle", 2)

    assert :ok =
             File.touch(
               ArtifactStore.path(context.cache_dir, middle),
               {{2021, 1, 1}, {0, 0, 0}}
             )

    assert :ok = ArtifactStore.write(context.cache_dir, current, "current", 2)

    refute File.exists?(ArtifactStore.path(context.cache_dir, oldest))
    assert File.read!(ArtifactStore.path(context.cache_dir, middle)) == "middle"
    assert File.read!(ArtifactStore.path(context.cache_dir, current)) == "current"
  end

  test "the renderer command runner is injectable", _context do
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

  test "a render failure leaves no readable artifact and the next request retries", context do
    counter = start_supervised!({Agent, fn -> 0 end})

    cache =
      start_cache(context,
        cover_fetcher: fn _url -> nil end,
        renderer: fn _preview ->
          attempt = Agent.get_and_update(counter, fn count -> {count + 1, count + 1} end)

          if attempt == 1 do
            {:error, :renderer_unavailable}
          else
            {:ok, "recovered-png"}
          end
        end
      )

    preview = preview()
    artifact_path = ArtifactStore.path(context.cache_dir, ArtifactCache.fingerprint(preview))

    assert {:error, :renderer_unavailable} = ArtifactCache.png(preview, server: cache)
    refute File.exists?(artifact_path)
    refute Enum.any?(File.ls!(context.cache_dir), &String.contains?(&1, ".tmp-"))

    assert {:ok, "recovered-png"} = ArtifactCache.png(preview, server: cache)
    assert File.read!(artifact_path) == "recovered-png"
    assert Agent.get(counter, & &1) == 2
  end

  defp start_cache(context, opts) do
    start_supervised!(
      {ArtifactCache,
       Keyword.merge(
         [
           cache_dir: context.cache_dir,
           name: nil,
           task_supervisor: context.task_supervisor
         ],
         opts
       )}
    )
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
