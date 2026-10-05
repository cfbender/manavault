defmodule Manavault.Repo.Migrations.DeallocateConsideringDeckCards do
  @moduledoc """
  Considering cards must never hold collection copies, but adding collection
  items to a deck's considering zone used to allocate them. This releases
  every allocation on a considering deck card back to its source location,
  mirroring `AllocationItems.restore_from_deck!/3`, and clears proxy counts
  on considering cards to match moving a card into considering.

  Idempotent: once released, no considering allocations or proxies remain.
  """

  use Ecto.Migration

  import Ecto.Query

  def up do
    flush()

    # Stored as ISO 8601 text to match how `:utc_datetime` schema fields are written.
    now = DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()

    considering_allocations()
    |> Enum.each(&release_allocation(&1, now))

    repo().update_all(
      from(dc in "deck_cards", where: dc.zone == "considering" and dc.proxy_quantity > 0),
      set: [proxy_quantity: 0, updated_at: now]
    )
  end

  # Released copies cannot be reattached to the original considering cards.
  def down, do: :ok

  defp considering_allocations do
    repo().all(
      from(a in "deck_allocations",
        join: dc in "deck_cards",
        on: dc.id == a.deck_card_id,
        join: ci in "collection_items",
        on: ci.id == a.collection_item_id,
        where: dc.zone == "considering",
        select: %{
          id: a.id,
          quantity: a.quantity,
          source_location_id: a.source_location_id,
          item_id: ci.id,
          item_quantity: ci.quantity,
          for_trade_quantity: ci.for_trade_quantity,
          scryfall_id: ci.scryfall_id,
          condition: ci.condition,
          language: ci.language,
          finish: ci.finish,
          notes: ci.notes
        }
      )
    )
  end

  defp release_allocation(%{item_quantity: item_quantity, quantity: quantity} = allocation, now)
       when item_quantity > quantity do
    remaining = item_quantity - quantity
    for_trade_quantity = min(allocation.for_trade_quantity || 0, remaining)

    repo().update_all(
      from(ci in "collection_items", where: ci.id == ^allocation.item_id),
      set: [
        quantity: remaining,
        for_trade_quantity: for_trade_quantity,
        for_trade: if(for_trade_quantity > 0, do: 1, else: 0),
        updated_at: now
      ]
    )

    repo().insert_all("collection_items", [
      %{
        scryfall_id: allocation.scryfall_id,
        quantity: quantity,
        condition: allocation.condition,
        language: allocation.language,
        finish: allocation.finish,
        notes: allocation.notes,
        location_id: allocation.source_location_id,
        location_changed_at: allocation.source_location_id && now,
        for_trade: 0,
        for_trade_quantity: 0,
        inserted_at: now,
        updated_at: now
      }
    ])

    delete_allocation(allocation)
  end

  defp release_allocation(allocation, now) do
    location_changes =
      if allocation.source_location_id,
        do: [location_id: allocation.source_location_id, location_changed_at: now],
        else: [location_id: nil]

    repo().update_all(
      from(ci in "collection_items", where: ci.id == ^allocation.item_id),
      set: location_changes ++ [updated_at: now]
    )

    delete_allocation(allocation)
  end

  defp delete_allocation(allocation) do
    repo().delete_all(from(a in "deck_allocations", where: a.id == ^allocation.id))
  end
end
