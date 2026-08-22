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
