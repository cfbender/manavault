defmodule Manavault.Repo.Migrations.MergeDeckZonesIntoConsidering do
  @moduledoc """
  Collapses the `sideboard` and `maybeboard` deck-card zones into a single
  `considering` zone.

  A deck can already have both a `sideboard` row and a `maybeboard` row for
  the same `(deck_id, oracle_id)` pair (the unique index only forbids two
  rows sharing a zone), and both would land on `considering`. Those pairs
  are merged first — quantities and proxy quantities summed, tag precedence
  `consider_cutting` > `getting` > `NULL`, `preferred_printing_id` kept from
  the lower-id "keeper" row unless it's nil (then the loser's), `finish`
  kept as the keeper's — with the loser's `deck_allocations` repointed onto
  the keeper (merging quantities on a collision) and the loser row deleted,
  before the remaining `sideboard`/`maybeboard` rows are bulk-renamed to
  `considering`.

  Idempotent: after the first run no rows have zone `sideboard` or
  `maybeboard` anymore, so both the merge pass and the rename are no-ops on
  a second run.
  """

  use Ecto.Migration

  import Ecto.Query

  @merged_zones ["sideboard", "maybeboard"]

  def up do
    flush()

    now = DateTime.utc_now() |> DateTime.truncate(:second)

    merge_colliding_rows(now)
    rename_remaining_zones()
  end

  def down do
    # The merge is lossy (loser deck_cards/deck_allocations rows are deleted
    # and quantities summed into the keeper) and which "considering" rows
    # originally came from sideboard vs. maybeboard is no longer known, so
    # the original per-zone split cannot be reconstructed. Left as a no-op,
    # matching the precedent set by the deck-tag backfill migration.
    :ok
  end

  defp merge_colliding_rows(now) do
    rows =
      repo().all(
        from(dc in "deck_cards",
          where: dc.zone in ^@merged_zones,
          select: %{
            id: dc.id,
            deck_id: dc.deck_id,
            oracle_id: dc.oracle_id,
            quantity: dc.quantity,
            proxy_quantity: dc.proxy_quantity,
            tag: dc.tag,
            preferred_printing_id: dc.preferred_printing_id
          }
        )
      )

    rows
    |> Enum.group_by(&{&1.deck_id, &1.oracle_id})
    |> Enum.each(fn {_deck_and_oracle, group} -> merge_group(group, now) end)
  end

  # A single row for this (deck_id, oracle_id) has no collision to merge —
  # the later bulk rename handles it.
  defp merge_group([_row], _now), do: :ok

  defp merge_group([_ | _] = group, now) do
    [keeper | losers] = Enum.sort_by(group, & &1.id)

    total_quantity = Enum.sum_by(group, & &1.quantity)
    total_proxy_quantity = Enum.sum_by(group, & &1.proxy_quantity)
    tag = merged_tag(group)

    preferred_printing_id =
      keeper.preferred_printing_id || first_present(losers, :preferred_printing_id)

    repoint_allocations(losers, keeper.id, now)

    repo().update_all(
      from(dc in "deck_cards", where: dc.id == ^keeper.id),
      set: [
        quantity: total_quantity,
        proxy_quantity: total_proxy_quantity,
        tag: tag,
        preferred_printing_id: preferred_printing_id,
        updated_at: now
      ]
    )

    repo().delete_all(from(dc in "deck_cards", where: dc.id in ^Enum.map(losers, & &1.id)))
  end

  defp merged_tag(group) do
    tags = Enum.map(group, & &1.tag)

    cond do
      "consider_cutting" in tags -> "consider_cutting"
      "getting" in tags -> "getting"
      true -> nil
    end
  end

  defp first_present(rows, key) do
    Enum.find_value(rows, &Map.get(&1, key))
  end

  # Repoints every deck_allocations row belonging to `losers` onto `keeper_id`,
  # merging quantities into the keeper's existing allocation for the same
  # collection_item_id when one is already present (the unique index is on
  # `(deck_card_id, collection_item_id)`).
  defp repoint_allocations(losers, keeper_id, now) do
    index = allocation_index(keeper_id)

    Enum.reduce(losers, index, fn loser, index ->
      loser
      |> loser_allocations()
      |> Enum.reduce(index, fn allocation, index ->
        merge_allocation(allocation, keeper_id, index, now)
      end)
    end)
  end

  defp allocation_index(deck_card_id) do
    repo().all(
      from(a in "deck_allocations",
        where: a.deck_card_id == ^deck_card_id,
        select: %{id: a.id, collection_item_id: a.collection_item_id, quantity: a.quantity}
      )
    )
    |> Map.new(&{&1.collection_item_id, %{id: &1.id, quantity: &1.quantity}})
  end

  defp loser_allocations(loser) do
    repo().all(
      from(a in "deck_allocations",
        where: a.deck_card_id == ^loser.id,
        select: %{id: a.id, collection_item_id: a.collection_item_id, quantity: a.quantity}
      )
    )
  end

  defp merge_allocation(allocation, keeper_id, index, now) do
    case Map.fetch(index, allocation.collection_item_id) do
      {:ok, %{id: existing_id, quantity: existing_quantity}} ->
        new_quantity = existing_quantity + allocation.quantity

        repo().update_all(
          from(a in "deck_allocations", where: a.id == ^existing_id),
          set: [quantity: new_quantity, updated_at: now]
        )

        repo().delete_all(from(a in "deck_allocations", where: a.id == ^allocation.id))

        Map.put(index, allocation.collection_item_id, %{id: existing_id, quantity: new_quantity})

      :error ->
        repo().update_all(
          from(a in "deck_allocations", where: a.id == ^allocation.id),
          set: [deck_card_id: keeper_id, updated_at: now]
        )

        Map.put(index, allocation.collection_item_id, %{
          id: allocation.id,
          quantity: allocation.quantity
        })
    end
  end

  defp rename_remaining_zones do
    repo().update_all(
      from(dc in "deck_cards", where: dc.zone in ^@merged_zones),
      set: [zone: "considering"]
    )
  end
end
