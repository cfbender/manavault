defmodule Manavault.Pricing do
  @moduledoc """
  Vendor price data and the user's selected price source.

  Vendor prices live in their own `vendor_prices` table, written only by
  vendor syncs. Scryfall catalog imports keep writing
  `scryfall_printings.prices`; neither overwrites the other. Reads go through
  `price_cents/2`, which resolves against the active source and returns `nil`
  when the source is Scryfall or has no price, so callers can fall back to the
  Scryfall data.
  """

  import Ecto.Query

  alias Manavault.Pricing.{Settings, Store, Sync, VendorPrice}
  alias Manavault.Repo

  @singleton_id 1
  @vendors ~w(tcgplayer cardkingdom manapool)

  defdelegate sources, to: Settings

  def vendors, do: @vendors

  def settings do
    Repo.get(Settings, @singleton_id) || insert_default_settings!()
  end

  def set_source(source) do
    result =
      settings()
      |> Settings.changeset(%{source: source})
      |> Repo.update()

    with {:ok, _settings} <- result do
      Store.refresh()
      result
    end
  end

  @doc """
  Price in cents for the printing under the active vendor source, or `nil`
  when the source is Scryfall or the vendor has no price for any finish in
  `finish_chain`.
  """
  def price_cents(scryfall_id, finish_chain) when is_list(finish_chain) do
    Store.price_cents(scryfall_id, finish_chain)
  end

  def sync_vendors(vendors \\ @vendors), do: Sync.run(vendors)

  def vendor_statuses do
    counts =
      VendorPrice
      |> group_by([v], v.vendor)
      |> select([v], {v.vendor, count(v.scryfall_id)})
      |> Repo.all()
      |> Map.new()

    Enum.map(@vendors, fn vendor ->
      %{
        vendor: vendor,
        price_count: Map.get(counts, vendor, 0),
        last_synced_at: last_synced_at(vendor)
      }
    end)
  end

  def last_synced_at(vendor) do
    VendorPrice
    |> where([v], v.vendor == ^vendor)
    |> order_by([v], desc: v.updated_at)
    |> limit(1)
    |> select([v], v.updated_at)
    |> Repo.one()
  end

  def replace_vendor_prices(vendor, rows) when vendor in @vendors do
    Sync.replace_vendor_prices(vendor, rows)
  end

  defp insert_default_settings! do
    %Settings{id: @singleton_id}
    |> Settings.changeset(%{})
    |> Repo.insert!(on_conflict: :nothing)

    Repo.get!(Settings, @singleton_id)
  end
end
