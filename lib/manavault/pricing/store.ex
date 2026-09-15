defmodule Manavault.Pricing.Store do
  @moduledoc """
  ETS lookup table holding the vendor prices for the active price source.

  The table is derived state: it is rebuilt from `vendor_prices` at boot,
  after every vendor sync, and whenever the price source changes. Lookups are
  safe to call even when the store is not running (they return `nil`), so
  price formatting keeps working in tests and during boot.
  """

  use GenServer

  import Ecto.Query

  require Logger

  alias Manavault.Pricing.VendorPrice
  alias Manavault.Repo

  @table :manavault_vendor_prices
  @scryfall_source "scryfall"

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Price in cents for the first finish in `finish_chain` that the active
  vendor source has a price for, or `nil` when the active source is Scryfall
  or nothing matches.
  """
  def price_cents(scryfall_id, finish_chain) do
    if active_source() in [nil, @scryfall_source] do
      nil
    else
      Enum.find_value(finish_chain, fn finish ->
        case :ets.lookup(@table, {scryfall_id, finish}) do
          [{_key, cents}] -> cents
          [] -> nil
        end
      end)
    end
  rescue
    ArgumentError -> nil
  end

  def active_source do
    case :ets.lookup(@table, :source) do
      [{:source, source}] -> source
      [] -> nil
    end
  rescue
    ArgumentError -> nil
  end

  @doc "Rebuild the table from the database. No-op when the store is not running."
  def refresh(timeout \\ :timer.seconds(60)) do
    case Process.whereis(__MODULE__) do
      nil -> :not_started
      pid -> GenServer.call(pid, :refresh, timeout)
    end
  end

  @impl true
  def init(_opts) do
    :ets.new(@table, [:named_table, :set, :protected, read_concurrency: true])
    {:ok, %{}, {:continue, :load}}
  end

  @impl true
  def handle_continue(:load, state) do
    load()
    {:noreply, state}
  end

  @impl true
  def handle_call(:refresh, _from, state) do
    load()
    {:reply, :ok, state}
  end

  defp load do
    source = Manavault.Pricing.settings().source

    :ets.delete_all_objects(@table)

    entries =
      if source == @scryfall_source do
        []
      else
        VendorPrice
        |> where([v], v.vendor == ^source)
        |> select([v], {{v.scryfall_id, v.finish}, v.price_cents})
        |> Repo.all(timeout: :infinity)
      end

    :ets.insert(@table, entries)
    :ets.insert(@table, {:source, source})

    Logger.debug("Pricing store loaded source=#{source} prices=#{length(entries)}")
  end
end
