defmodule Manavault.Pricing.Sync do
  @moduledoc """
  Fetches vendor price feeds and replaces each vendor's rows in
  `vendor_prices`. Only this module writes vendor prices; Scryfall catalog
  imports never touch the table.
  """

  import Ecto.Query

  require Logger

  alias Manavault.Catalog.Cache
  alias Manavault.Pricing.{Store, VendorPrice}
  alias Manavault.Pricing.Vendors.{CardKingdom, ManaPool, TcgCsv}
  alias Manavault.Repo

  @vendor_modules %{
    "cardkingdom" => CardKingdom,
    "manapool" => ManaPool,
    "tcgplayer" => TcgCsv
  }

  @batch_size 200

  # Tests override the vendor map to exercise sync behavior without the network.
  def vendor_module(vendor) do
    :manavault
    |> Application.get_env(:pricing_vendor_modules, @vendor_modules)
    |> Map.fetch!(vendor)
  end

  @doc """
  Syncs the given vendors sequentially and refreshes the price store once at
  the end. Returns `{:ok, results}` where each result is
  `{vendor, {:ok, count} | {:error, reason}}`.
  """
  def run(vendors) do
    results =
      Enum.map(vendors, fn vendor ->
        {vendor, sync_vendor(vendor)}
      end)

    Store.refresh()

    {:ok, results}
  end

  @doc """
  Replaces every price row for `vendor` with `rows`
  (`%{scryfall_id, finish, price_cents}`). Duplicate printing/finish pairs
  keep the cheapest price. Rows not present anymore are deleted.

  Batches are written in autocommit mode on purpose: one transaction over a
  full feed would hold SQLite's single write lock for seconds, long enough to
  push other writers past `busy_timeout`. Each batch instead retries when it
  finds the database busy.
  """
  def replace_vendor_prices(vendor, rows) do
    now = DateTime.utc_now()
    deduped = dedupe_cheapest(rows)
    context = "Vendor price sync vendor=#{vendor}"

    deduped
    |> Enum.map(fn row ->
      %{
        vendor: vendor,
        scryfall_id: row.scryfall_id,
        finish: row.finish,
        price_cents: row.price_cents,
        inserted_at: now,
        updated_at: now
      }
    end)
    |> Enum.chunk_every(@batch_size)
    |> Enum.each(fn batch ->
      Repo.retry_when_busy(
        fn ->
          Repo.insert_all(VendorPrice, batch,
            conflict_target: [:vendor, :scryfall_id, :finish],
            on_conflict: {:replace, [:price_cents, :updated_at]}
          )
        end,
        context
      )
    end)

    {deleted, _} =
      Repo.retry_when_busy(
        fn ->
          VendorPrice
          |> where([v], v.vendor == ^vendor and v.updated_at < ^now)
          |> Repo.delete_all(timeout: :infinity)
        end,
        context
      )

    Cache.invalidate_collection()

    %{upserted: length(deduped), deleted: deleted}
  end

  # Each vendor is isolated: an exception while fetching or storing one vendor
  # is logged and reported as that vendor's error rather than crashing the Oban
  # job, which would retry already-synced vendors from the top.
  defp sync_vendor(vendor) do
    module = vendor_module(vendor)
    Logger.info("Vendor price sync started vendor=#{vendor}")

    store_fetched_rows(vendor, module.fetch())
  rescue
    exception ->
      Logger.error(
        "Vendor price sync crashed vendor=#{vendor}\n" <>
          Exception.format(:error, exception, __STACKTRACE__)
      )

      {:error, exception}
  end

  defp store_fetched_rows(vendor, fetch_result) do
    case fetch_result do
      {:ok, rows} when rows != [] ->
        %{upserted: upserted, deleted: deleted} = replace_vendor_prices(vendor, rows)

        Logger.info(
          "Vendor price sync completed vendor=#{vendor} prices=#{upserted} removed=#{deleted}"
        )

        {:ok, upserted}

      {:ok, []} ->
        Logger.warning(
          "Vendor price sync returned no rows vendor=#{vendor}; keeping existing prices"
        )

        {:error, :empty_feed}

      {:error, reason} ->
        Logger.warning("Vendor price sync failed vendor=#{vendor} error=#{inspect(reason)}")
        {:error, reason}
    end
  end

  defp dedupe_cheapest(rows) do
    rows
    |> Enum.group_by(fn row -> {row.scryfall_id, row.finish} end)
    |> Enum.map(fn {_key, group} -> Enum.min_by(group, & &1.price_cents) end)
  end
end
