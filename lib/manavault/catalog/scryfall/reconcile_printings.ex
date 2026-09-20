defmodule Manavault.Catalog.Scryfall.ReconcilePrintings do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, CollectionItem, DeckCard, Location, Printing}
  alias Manavault.Repo
  alias Manavault.Trade.Want

  @batch_size 200

  def run(imported_at) do
    with :ok <- reconcile_batches(imported_at),
         :ok <- delete_orphaned_cards() do
      {:ok, :reconciled}
    end
  end

  defp reconcile_batches(imported_at) do
    case stale_batch(imported_at) do
      [] ->
        :ok

      stale_printings ->
        case reconcile_batch(stale_printings, imported_at) do
          {:ok, :reconciled} -> reconcile_batches(imported_at)
          {:error, reason} -> {:error, reason}
        end
    end
  end

  defp stale_batch(imported_at) do
    Repo.all(
      from printing in Printing,
        where: printing.updated_at != ^imported_at,
        order_by: [asc: printing.scryfall_id],
        limit: @batch_size,
        select: %{
          scryfall_id: printing.scryfall_id,
          oracle_id: printing.oracle_id,
          lang: printing.lang,
          finishes: printing.finishes
        }
    )
  end

  defp reconcile_batch(stale_printings, imported_at) do
    oracle_ids = stale_printings |> Enum.map(& &1.oracle_id) |> Enum.uniq()
    replacements = current_replacements(oracle_ids, imported_at)
    replacements_by_oracle = Enum.group_by(replacements, & &1.oracle_id)

    {replacement_groups, without_replacement} =
      group_replacements(stale_printings, replacements_by_oracle)

    Repo.transact(fn ->
      Enum.each(replacement_groups, fn {replacement_id, stale_ids} ->
        reassign_references(stale_ids, replacement_id)
      end)

      clear_trade_wants(without_replacement)
      stale_ids = Enum.map(stale_printings, & &1.scryfall_id)
      Repo.delete_all(from printing in Printing, where: printing.scryfall_id in ^stale_ids)
      {:ok, :reconciled}
    end)
  end

  defp current_replacements(oracle_ids, imported_at) do
    Repo.all(
      from printing in Printing,
        where: printing.updated_at == ^imported_at and printing.oracle_id in ^oracle_ids,
        order_by: [
          desc: printing.released_at,
          asc: printing.set_code,
          asc: printing.collector_number
        ],
        select: %{
          scryfall_id: printing.scryfall_id,
          oracle_id: printing.oracle_id,
          lang: printing.lang,
          finishes: printing.finishes
        }
    )
  end

  defp group_replacements(stale_printings, replacements_by_oracle) do
    Enum.reduce(stale_printings, {%{}, []}, fn stale, {groups, without_replacement} ->
      case replacement_for(stale, Map.get(replacements_by_oracle, stale.oracle_id, [])) do
        nil ->
          {groups, [stale.scryfall_id | without_replacement]}

        replacement ->
          groups =
            Map.update(
              groups,
              replacement.scryfall_id,
              [stale.scryfall_id],
              &[stale.scryfall_id | &1]
            )

          {groups, without_replacement}
      end
    end)
  end

  defp replacement_for(_stale, []), do: nil

  defp replacement_for(stale, replacements) do
    stale_finishes = decode_finishes(stale.finishes)

    Enum.find(replacements, fn replacement ->
      replacement.lang == stale.lang and
        not MapSet.disjoint?(stale_finishes, decode_finishes(replacement.finishes))
    end) || Enum.find(replacements, &(&1.lang == stale.lang)) || List.first(replacements)
  end

  defp reassign_references(stale_ids, replacement_id) do
    merge_trade_wants(stale_ids, replacement_id)

    Repo.update_all(
      from(item in CollectionItem, where: item.scryfall_id in ^stale_ids),
      set: [scryfall_id: replacement_id]
    )

    Repo.update_all(
      from(deck_card in DeckCard, where: deck_card.preferred_printing_id in ^stale_ids),
      set: [preferred_printing_id: replacement_id]
    )

    Repo.update_all(
      from(location in Location, where: location.cover_scryfall_id in ^stale_ids),
      set: [cover_scryfall_id: replacement_id]
    )
  end

  defp merge_trade_wants(stale_ids, replacement_id) do
    placeholders = placeholders(stale_ids)

    Repo.query!(
      """
      INSERT INTO trade_wants
        (oracle_id, preferred_printing_id, quantity, inserted_at, updated_at)
      SELECT oracle_id, ?, SUM(quantity), MIN(inserted_at), MAX(updated_at)
      FROM trade_wants
      WHERE preferred_printing_id IN (#{placeholders})
      GROUP BY oracle_id
      ON CONFLICT (oracle_id, preferred_printing_id)
        WHERE preferred_printing_id IS NOT NULL
      DO UPDATE SET
        quantity = trade_wants.quantity + excluded.quantity,
        updated_at = excluded.updated_at
      """,
      [replacement_id | stale_ids]
    )

    Repo.delete_all(from want in Want, where: want.preferred_printing_id in ^stale_ids)
  end

  defp clear_trade_wants([]), do: :ok

  defp clear_trade_wants(stale_ids) do
    placeholders = placeholders(stale_ids)

    Repo.query!(
      """
      INSERT INTO trade_wants
        (oracle_id, preferred_printing_id, quantity, inserted_at, updated_at)
      SELECT oracle_id, NULL, SUM(quantity), MIN(inserted_at), MAX(updated_at)
      FROM trade_wants
      WHERE preferred_printing_id IN (#{placeholders})
      GROUP BY oracle_id
      ON CONFLICT (oracle_id) WHERE preferred_printing_id IS NULL
      DO UPDATE SET
        quantity = trade_wants.quantity + excluded.quantity,
        updated_at = excluded.updated_at
      """,
      stale_ids
    )

    Repo.delete_all(from want in Want, where: want.preferred_printing_id in ^stale_ids)
  end

  defp delete_orphaned_cards do
    case orphaned_card_batch() do
      [] ->
        :ok

      oracle_ids ->
        case Repo.transact(fn ->
               Repo.delete_all(
                 from deck_card in DeckCard, where: deck_card.oracle_id in ^oracle_ids
               )

               Repo.delete_all(from card in Card, where: card.oracle_id in ^oracle_ids)
               {:ok, :deleted}
             end) do
          {:ok, :deleted} -> delete_orphaned_cards()
          {:error, reason} -> {:error, reason}
        end
    end
  end

  defp orphaned_card_batch do
    Repo.all(
      from card in Card,
        left_join: printing in Printing,
        on: printing.oracle_id == card.oracle_id,
        where: is_nil(printing.scryfall_id),
        order_by: [asc: card.oracle_id],
        limit: @batch_size,
        select: card.oracle_id
    )
  end

  defp decode_finishes(finishes) do
    case Jason.decode(finishes) do
      {:ok, values} when is_list(values) -> MapSet.new(values)
      _other -> MapSet.new()
    end
  end

  defp placeholders(values), do: Enum.map_join(values, ", ", fn _value -> "?" end)
end
