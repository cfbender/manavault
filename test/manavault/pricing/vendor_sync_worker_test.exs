defmodule Manavault.Pricing.VendorSyncWorkerTest do
  use Manavault.DataCase, async: false
  use Oban.Testing, repo: Manavault.Repo, engine: Oban.Engines.Lite

  alias Manavault.Pricing
  alias Manavault.Pricing.{VendorPrice, VendorSyncWorker}

  test "manual syncs enqueue one unique forced job" do
    assert {:ok, job} = Pricing.sync_vendors_async()
    assert job.queue == "pricing"
    assert job.args == %{force: true}

    assert {:ok, duplicate_job} = Pricing.sync_vendors_async()
    assert duplicate_job.id == job.id
    assert duplicate_job.conflict?

    assert_enqueued(worker: VendorSyncWorker, args: %{force: true})
  end

  test "periodic jobs skip vendors with fresh prices" do
    now = DateTime.utc_now()

    Pricing.vendors()
    |> Enum.with_index()
    |> Enum.each(fn {vendor, index} ->
      Repo.insert!(%VendorPrice{
        vendor: vendor,
        scryfall_id: "fresh-#{index}",
        finish: "nonfoil",
        price_cents: 100,
        inserted_at: now,
        updated_at: now
      })
    end)

    assert :ok = perform_job(VendorSyncWorker, %{})
  end
end
