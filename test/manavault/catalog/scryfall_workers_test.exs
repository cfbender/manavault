defmodule Manavault.Catalog.ScryfallWorkersTest do
  use Manavault.DataCase, async: false
  use Oban.Testing, repo: Manavault.Repo, engine: Oban.Engines.Lite

  alias Manavault.Catalog
  alias Manavault.Catalog.{ScryfallAssetsWorker, ScryfallCatalogWorker, Sync}

  test "manual reloads enqueue unique forced jobs" do
    assert {:ok, catalog_job} = Catalog.reload_scryfall_catalog_async()
    assert catalog_job.queue == "catalog"
    assert catalog_job.args == %{force: true}

    assert {:ok, duplicate_catalog_job} = Catalog.reload_scryfall_catalog_async()
    assert duplicate_catalog_job.id == catalog_job.id
    assert duplicate_catalog_job.conflict?

    assert {:ok, assets_job} = Catalog.reload_scryfall_assets_async()
    assert assets_job.queue == "catalog"
    assert assets_job.args == %{force: true}

    assert_enqueued(worker: ScryfallCatalogWorker, args: %{force: true})
    assert_enqueued(worker: ScryfallAssetsWorker, args: %{force: true})
  end

  test "Lifeline recovers orphaned SQLite jobs and unblocks exhausted catalog syncs" do
    plugins = Application.fetch_env!(:manavault, Oban) |> Keyword.fetch!(:plugins)
    lifeline_options = Keyword.fetch!(plugins, Oban.Plugins.Lifeline)

    start_supervised!(
      {Oban,
       name: __MODULE__,
       repo: Repo,
       engine: Oban.Engines.Lite,
       peer: Oban.Peers.Isolated,
       queues: [],
       testing: :disabled,
       plugins: [{Oban.Plugins.Lifeline, lifeline_options}]}
    )

    stale_time = DateTime.add(DateTime.utc_now(), -61, :minute)
    recent_time = DateTime.add(DateTime.utc_now(), -59, :minute)

    stale_job =
      ScryfallCatalogWorker.new(%{},
        state: "executing",
        attempt: 1,
        attempted_at: stale_time
      )
      |> Repo.insert!()

    recent_job =
      ScryfallAssetsWorker.new(%{},
        state: "executing",
        attempt: 1,
        attempted_at: recent_time
      )
      |> Repo.insert!()

    # Reproduce the blockage: even a forced reload returns the orphaned job.
    assert {:ok, blocked} = Catalog.reload_scryfall_catalog_async()
    assert blocked.id == stale_job.id
    assert blocked.conflict?

    lifeline = Oban.Registry.whereis(__MODULE__, {:plugin, Oban.Plugins.Lifeline})
    send(lifeline, :rescue)
    :sys.get_state(lifeline)

    assert %{state: "available", attempt: 1} = Repo.reload!(stale_job)
    assert %{state: "executing", attempt: 1} = Repo.reload!(recent_job)

    # An orphan on its final attempt must be discarded, not retried forever.
    stale_job
    |> Repo.reload!()
    |> Ecto.Changeset.change(state: "executing", attempt: stale_job.max_attempts)
    |> Repo.update!()

    send(lifeline, :rescue)
    :sys.get_state(lifeline)

    assert %{state: "discarded"} = Repo.reload!(stale_job)
    assert %{state: "executing"} = Repo.reload!(recent_job)
    assert {:ok, replacement} = Catalog.reload_scryfall_catalog_async()
    assert replacement.id != stale_job.id
    refute replacement.conflict?
    assert replacement.state == "available"
  end

  test "periodic catalog jobs skip a fresh successful sync" do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    %Sync{}
    |> Sync.changeset(%{
      status: "succeeded",
      bulk_type: "default_cards_paper_v2",
      started_at: now,
      completed_at: now
    })
    |> Repo.insert!()

    assert :ok = perform_job(ScryfallCatalogWorker, %{})
  end

  test "periodic asset jobs skip fresh manifests" do
    previous = Application.get_env(:manavault, :scryfall_assets_dir)

    asset_root =
      Path.join(
        System.tmp_dir!(),
        "manavault-scryfall-assets-#{System.unique_integer([:positive])}"
      )

    Application.put_env(:manavault, :scryfall_assets_dir, asset_root)
    File.mkdir_p!(Path.join(asset_root, "symbols"))
    File.mkdir_p!(Path.join(asset_root, "sets"))
    File.write!(Path.join(asset_root, "symbols/symbology.json"), "[]")
    File.write!(Path.join(asset_root, "sets/sets.json"), "[]")

    on_exit(fn ->
      File.rm_rf(asset_root)

      if previous do
        Application.put_env(:manavault, :scryfall_assets_dir, previous)
      else
        Application.delete_env(:manavault, :scryfall_assets_dir)
      end
    end)

    assert :ok = perform_job(ScryfallAssetsWorker, %{})
  end
end
