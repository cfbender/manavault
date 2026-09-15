defmodule Manavault.Pricing.VendorSyncWorker do
  @moduledoc false

  use Oban.Worker,
    queue: :pricing,
    max_attempts: 3,
    unique: [period: :infinity, fields: [:worker], states: :incomplete]

  require Logger

  alias Manavault.Pricing
  alias Manavault.Pricing.Sync

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    vendors = if args["force"], do: Pricing.vendors(), else: stale_vendors()

    case vendors do
      [] -> :ok
      vendors -> sync(vendors)
    end
  end

  @impl Oban.Worker
  def timeout(_job), do: :timer.minutes(30)

  defp stale_vendors do
    Enum.filter(Pricing.vendors(), fn vendor ->
      interval = Sync.vendor_module(vendor).sync_interval()

      case Pricing.last_synced_at(vendor) do
        nil ->
          true

        %DateTime{} = synced_at ->
          DateTime.diff(DateTime.utc_now(), synced_at, :millisecond) >= interval
      end
    end)
  end

  defp sync(vendors) do
    case Pricing.sync_vendors(vendors) do
      {:ok, results} ->
        summary =
          Enum.map_join(results, " ", fn
            {vendor, {:ok, count}} -> "#{vendor}=#{count}"
            {vendor, {:error, reason}} -> "#{vendor}=error(#{inspect(reason)})"
          end)

        Logger.info("Vendor price sync finished #{summary}")
        :ok

      {:error, reason} ->
        {:error, reason}
    end
  end
end
