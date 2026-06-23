defmodule Manavault.Catalog.Scryfall do
  @moduledoc false

  alias Manavault.Catalog.Scryfall.{Import, Rulings, Sync}

  def latest_sync do
    Sync.latest()
  end

  def sync_scryfall(opts \\ []) do
    Sync.run(opts)
  end

  def import_cards(cards, bulk_uri \\ nil, opts \\ [])

  def import_cards(cards, opts, []) when is_list(cards) and is_list(opts) do
    Import.run(cards, opts, [])
  end

  def import_cards(cards, bulk_uri, opts) when is_list(cards) and is_list(opts) do
    Import.run(cards, bulk_uri, opts)
  end

  def card_rulings(card, opts \\ []) do
    Rulings.list(card, opts)
  end
end
