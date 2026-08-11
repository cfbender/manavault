defmodule Manavault.Catalog.Scryfall.Import do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{
    Card,
    CollectionItem,
    DeckCard,
    Location,
    Printing,
    ScryfallOracleTags,
    Search
  }

  alias Manavault.Catalog.Scryfall.{BulkData, ImportRows}
  alias Manavault.Repo
  alias Manavault.Trade.Want

  require Logger

  @batch_size 200
  @excluded_set_types ~w(memorabilia token)
  @progress_source_card_interval 5_000

  def run(cards, bulk_uri \\ nil, opts \\ [])

  def run(cards, opts, []) when is_list(cards) and is_list(opts) do
    run(cards, nil, opts)
  end

  def run(cards, bulk_uri, opts) when is_list(opts) do
    log_progress? = Keyword.get(opts, :log_progress, false)
    source_count = Keyword.get(opts, :source_count) || enumerable_count(cards)
    reconcile? = Keyword.get(opts, :reconcile, false)
    now = import_timestamp(reconcile?)
    oracle_tag_index = ScryfallOracleTags.build_index(Keyword.get(opts, :oracle_tags, []))

    log_import_started(log_progress?, source_count)

    result =
      try do
        with {:ok, counts} <-
               import_card_batches(cards, now, oracle_tag_index, source_count, log_progress?),
             :ok <- maybe_reconcile_printings(reconcile?, now) do
          {:ok,
           %{
             cards_count: counts.cards_count,
             printings_count: counts.printings_count,
             source_count: counts.source_count,
             bulk_uri: bulk_uri
           }}
        end
      rescue
        error in BulkData.DecodeError -> {:error, error.message}
      end

    case result do
      {:ok, counts} ->
        log_import_completed(log_progress?, counts, counts.source_count)
        Search.clear_card_name_suggestion_cache()

      {:error, reason} ->
        log_import_failed(log_progress?, reason)
    end

    result
  end

  defp enumerable_count(cards) when is_list(cards), do: length(cards)
  defp enumerable_count(_cards), do: nil

  defp import_card_batches(cards, now, oracle_tag_index, source_count, log_progress?) do
    cards
    |> Enum.chunk_every(@batch_size)
    |> Enum.reduce_while({:ok, initial_import_counts()}, fn batch, {:ok, counts} ->
      rows =
        batch
        |> Enum.reject(&excluded_set_type?/1)
        |> ImportRows.rows(now, oracle_tag_index)

      case import_batch(rows) do
        {:ok, :imported} ->
          counts =
            counts
            |> advance_import_counts(length(batch), rows)
            |> maybe_log_import_progress(log_progress?, source_count)

          {:cont, {:ok, counts}}

        {:error, reason} ->
          {:halt, {:error, reason}}
      end
    end)
  end

  defp excluded_set_type?(%{"set_type" => set_type}),
    do: set_type in @excluded_set_types

  defp excluded_set_type?(_card), do: false

  defp import_batch(rows) do
    Repo.transact(
      fn ->
        insert_card_rows(rows.cards)
        insert_printing_rows(rows.printings)
        refresh_printing_search_rows(rows.search_rows)
        {:ok, :imported}
      end,
      timeout: :infinity
    )
  end

  defp initial_import_counts do
    %{
      source_count: 0,
      cards_count: 0,
      printings_count: 0,
      search_rows_count: 0,
      next_progress: @progress_source_card_interval
    }
  end

  defp advance_import_counts(counts, source_count, rows) do
    %{
      counts
      | source_count: counts.source_count + source_count,
        cards_count: counts.cards_count + length(rows.cards),
        printings_count: counts.printings_count + length(rows.printings),
        search_rows_count: counts.search_rows_count + length(rows.search_rows)
    }
  end

  defp insert_card_rows(rows) do
    insert_in_batches(Card, rows,
      conflict_target: [:oracle_id],
      on_conflict:
        {:replace,
         [
           :name,
           :normalized_name,
           :type_line,
           :oracle_text,
           :mana_cost,
           :cmc,
           :colors,
           :color_identity,
           :legalities,
           :game_changer,
           :edhrec_rank,
           :oracle_tags,
           :deck_category,
           :deck_themes,
           :rulings_uri,
           :updated_at
         ]}
    )
  end

  defp insert_printing_rows(rows) do
    insert_in_batches(Printing, rows,
      conflict_target: [:scryfall_id],
      on_conflict:
        {:replace,
         [
           :oracle_id,
           :set_code,
           :set_name,
           :collector_number,
           :lang,
           :flavor_name,
           :flavor_text,
           :rarity,
           :finishes,
           :promo_types,
           :image_uris,
           :prices,
           :released_at,
           :updated_at
         ]}
    )
  end

  defp maybe_log_import_progress(counts, false, _source_count), do: counts

  defp maybe_log_import_progress(
         %{source_count: processed, next_progress: next} = counts,
         true,
         source_count
       )
       when processed >= next or processed == source_count do
    Logger.info(
      "Scryfall catalog import progress source_cards=#{processed}/#{source_count} " <>
        "cards=#{counts.cards_count} printings=#{counts.printings_count} " <>
        "search_rows=#{counts.search_rows_count}"
    )

    %{counts | next_progress: next_progress_after(processed)}
  end

  defp maybe_log_import_progress(counts, true, _source_count), do: counts

  defp next_progress_after(processed) do
    (div(processed, @progress_source_card_interval) + 1) * @progress_source_card_interval
  end

  defp log_import_started(false, _source_count), do: :ok

  defp log_import_started(true, source_count) do
    Logger.info("Scryfall catalog import started source_cards=#{source_count}")
  end

  defp log_import_completed(false, _counts, _source_count), do: :ok

  defp log_import_completed(true, counts, source_count) do
    Logger.info(
      "Scryfall catalog import completed source_cards=#{source_count} " <>
        "cards=#{counts.cards_count} printings=#{counts.printings_count}"
    )
  end

  defp log_import_failed(false, _reason), do: :ok

  defp log_import_failed(true, reason) do
    Logger.warning("Scryfall catalog import failed error=#{inspect(reason)}")
  end

  defp insert_in_batches(_schema, [], _opts), do: :ok

  defp insert_in_batches(schema, rows, opts) do
    rows
    |> Enum.chunk_every(@batch_size)
    |> Enum.each(fn batch -> Repo.insert_all(schema, batch, opts) end)
  end

  defp refresh_printing_search_rows([]), do: :ok

  defp refresh_printing_search_rows(rows) do
    rows
    |> Enum.map(& &1.scryfall_id)
    |> Enum.chunk_every(@batch_size)
    |> Enum.each(fn ids ->
      placeholders = Enum.map_join(ids, ",", fn _ -> "?" end)

      Repo.query!(
        "DELETE FROM scryfall_printing_search WHERE scryfall_id IN (#{placeholders})",
        ids
      )
    end)

    rows
    |> Enum.chunk_every(@batch_size)
    |> Enum.each(fn batch ->
      values = Enum.map_join(batch, ",", fn _ -> "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)" end)

      params =
        Enum.flat_map(batch, fn row ->
          [
            row.scryfall_id,
            row.name,
            row.compact_name,
            row.flavor_name,
            row.compact_flavor_name,
            row.flavor_text,
            row.compact_flavor_text,
            row.type_line,
            row.oracle_text,
            row.compact_oracle_text,
            row.set_code,
            row.collector_number
          ]
        end)

      Repo.query!(
        """
        INSERT INTO scryfall_printing_search (
          scryfall_id,
          name,
          compact_name,
          flavor_name,
          compact_flavor_name,
          flavor_text,
          compact_flavor_text,
          type_line,
          oracle_text,
          compact_oracle_text,
          set_code,
          collector_number
        )
        VALUES #{values}
        """,
        params
      )
    end)
  end

  defp maybe_reconcile_printings(false, _imported_at), do: :ok

  defp maybe_reconcile_printings(true, imported_at) do
    case reconcile_printings(imported_at) do
      {:ok, :reconciled} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  defp reconcile_printings(imported_at) do
    Repo.transact(
      fn ->
        current_printings =
          Repo.all(
            from printing in Printing,
              where: printing.updated_at == ^imported_at,
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

        stale_printings =
          Repo.all(
            from printing in Printing,
              where: printing.updated_at != ^imported_at,
              select: %{
                scryfall_id: printing.scryfall_id,
                oracle_id: printing.oracle_id,
                lang: printing.lang,
                finishes: printing.finishes
              }
          )

        replacements_by_oracle = Enum.group_by(current_printings, & &1.oracle_id)
        referenced_ids = referenced_printing_ids()

        replacement_groups =
          stale_printings
          |> Enum.reduce(%{}, fn stale, groups ->
            if MapSet.member?(referenced_ids, stale.scryfall_id) do
              case replacement_for(stale, replacements_by_oracle[stale.oracle_id] || []) do
                nil ->
                  groups

                replacement ->
                  Map.update(
                    groups,
                    replacement.scryfall_id,
                    [stale.scryfall_id],
                    &[stale.scryfall_id | &1]
                  )
              end
            else
              groups
            end
          end)

        Enum.each(replacement_groups, fn {replacement_id, stale_ids} ->
          Enum.each(Enum.chunk_every(stale_ids, @batch_size), fn ids ->
            Repo.update_all(
              from(item in CollectionItem, where: item.scryfall_id in ^ids),
              set: [scryfall_id: replacement_id]
            )

            Repo.update_all(
              from(deck_card in DeckCard, where: deck_card.preferred_printing_id in ^ids),
              set: [preferred_printing_id: replacement_id]
            )

            Repo.update_all(
              from(location in Location, where: location.cover_scryfall_id in ^ids),
              set: [cover_scryfall_id: replacement_id]
            )

            reassign_trade_wants(ids, replacement_id)
          end)
        end)

        stale_ids = Enum.map(stale_printings, & &1.scryfall_id)
        replaced_ids = replacement_groups |> Map.values() |> List.flatten() |> MapSet.new()

        stale_ids
        |> Enum.filter(&MapSet.member?(referenced_ids, &1))
        |> Enum.reject(&MapSet.member?(replaced_ids, &1))
        |> Enum.chunk_every(@batch_size)
        |> Enum.each(&clear_trade_wants/1)

        delete_printing_search_rows(stale_ids)

        Enum.each(Enum.chunk_every(stale_ids, @batch_size), fn ids ->
          Repo.delete_all(from printing in Printing, where: printing.scryfall_id in ^ids)
        end)

        delete_cards_without_printings()

        {:ok, :reconciled}
      end,
      timeout: :infinity
    )
  end

  defp delete_cards_without_printings do
    orphaned_card_ids =
      Repo.all(
        from card in Card,
          left_join: printing in Printing,
          on: printing.oracle_id == card.oracle_id,
          where: is_nil(printing.scryfall_id),
          select: card.oracle_id
      )

    Enum.each(Enum.chunk_every(orphaned_card_ids, @batch_size), fn ids ->
      Repo.delete_all(from deck_card in DeckCard, where: deck_card.oracle_id in ^ids)
      Repo.delete_all(from card in Card, where: card.oracle_id in ^ids)
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

  defp referenced_printing_ids do
    collection_ids = Repo.all(from item in CollectionItem, select: item.scryfall_id)

    deck_ids =
      Repo.all(
        from deck_card in DeckCard,
          where: not is_nil(deck_card.preferred_printing_id),
          select: deck_card.preferred_printing_id
      )

    location_ids =
      Repo.all(
        from location in Location,
          where: not is_nil(location.cover_scryfall_id),
          select: location.cover_scryfall_id
      )

    want_ids =
      Repo.all(
        from want in Want,
          where: not is_nil(want.preferred_printing_id),
          select: want.preferred_printing_id
      )

    MapSet.new(collection_ids ++ deck_ids ++ location_ids ++ want_ids)
  end

  defp decode_finishes(finishes) do
    case Jason.decode(finishes) do
      {:ok, values} when is_list(values) -> MapSet.new(values)
      _other -> MapSet.new()
    end
  end

  defp reassign_trade_wants(stale_ids, replacement_id) do
    stale_wants = Repo.all(from want in Want, where: want.preferred_printing_id in ^stale_ids)

    Enum.each(stale_wants, fn stale_want ->
      case Repo.one(
             from want in Want,
               where:
                 want.oracle_id == ^stale_want.oracle_id and
                   want.preferred_printing_id == ^replacement_id
           ) do
        nil ->
          Repo.update_all(
            from(want in Want, where: want.id == ^stale_want.id),
            set: [preferred_printing_id: replacement_id]
          )

        existing ->
          Repo.update_all(
            from(want in Want, where: want.id == ^existing.id),
            inc: [quantity: stale_want.quantity]
          )

          Repo.delete!(stale_want)
      end
    end)
  end

  defp clear_trade_wants([]), do: :ok

  defp clear_trade_wants(stale_ids) do
    stale_wants = Repo.all(from want in Want, where: want.preferred_printing_id in ^stale_ids)

    Enum.each(stale_wants, fn stale_want ->
      case Repo.one(
             from want in Want,
               where:
                 want.oracle_id == ^stale_want.oracle_id and
                   is_nil(want.preferred_printing_id)
           ) do
        nil ->
          Repo.update_all(
            from(want in Want, where: want.id == ^stale_want.id),
            set: [preferred_printing_id: nil]
          )

        existing ->
          Repo.update_all(
            from(want in Want, where: want.id == ^existing.id),
            inc: [quantity: stale_want.quantity]
          )

          Repo.delete!(stale_want)
      end
    end)
  end

  defp delete_printing_search_rows([]), do: :ok

  defp delete_printing_search_rows(ids) do
    Enum.each(Enum.chunk_every(ids, @batch_size), fn batch ->
      placeholders = Enum.map_join(batch, ",", fn _ -> "?" end)

      Repo.query!(
        "DELETE FROM scryfall_printing_search WHERE scryfall_id IN (#{placeholders})",
        batch
      )
    end)
  end

  defp import_timestamp(false), do: utc_now()

  defp import_timestamp(true) do
    now = utc_now()
    latest = Repo.one(from printing in Printing, select: max(printing.updated_at))

    case latest do
      %DateTime{} = timestamp ->
        if DateTime.compare(timestamp, now) == :lt,
          do: now,
          else: DateTime.add(timestamp, 1, :second)

      nil ->
        now
    end
  end

  defp utc_now do
    DateTime.utc_now() |> DateTime.truncate(:second)
  end
end
