defmodule Manavault.Catalog.Scryfall.Import do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, CardToken, Printing, ScryfallOracleTags, Search}

  alias Manavault.Catalog.Scryfall.{BulkData, ImportDiff, ImportRows, ReconcilePrintings}
  alias Manavault.Repo

  require Logger

  @batch_size 200
  @excluded_set_types ~w(memorabilia token)
  @insert_set_types ~w(memorabilia minigame)
  @progress_source_card_interval 5_000

  # SQLite has no lock queue: a writer blocked on the database-wide write lock
  # (Oban's stager, a user saving a card) re-polls it, and Exqlite's busy
  # handler polls every 50 ms once its initial ramp is spent. Back-to-back
  # batch commits leave only a few ms between transactions, so a waiter can
  # miss every poll until its busy_timeout expires. Keeping at least this much
  # time between one commit and the next BEGIN guarantees every waiter's next
  # poll finds the lock free. Decoding and diffing the next batch already
  # happens in that gap, so the sleep only covers whatever time remains.
  @min_commit_gap_ms 75

  def run(cards, bulk_uri \\ nil, opts \\ [])

  def run(cards, opts, []) when is_list(cards) and is_list(opts) do
    run(cards, nil, opts)
  end

  def run(cards, bulk_uri, opts) when is_list(opts) do
    log_progress? = Keyword.get(opts, :log_progress, false)
    source_count = Keyword.get(opts, :source_count) || enumerable_count(cards)
    reconcile? = Keyword.get(opts, :reconcile, false)
    now = utc_now()
    oracle_tags = Keyword.get(opts, :oracle_tags, [])
    oracle_tag_index = ScryfallOracleTags.build_index(oracle_tags)
    replace_oracle_tag_fields? = oracle_tags != :skip

    log_import_started(log_progress?, source_count)

    result =
      try do
        with {:ok, counts} <-
               import_card_batches(
                 cards,
                 now,
                 oracle_tag_index,
                 replace_oracle_tag_fields?,
                 source_count,
                 log_progress?,
                 reconcile?
               ),
             :ok <- maybe_reconcile_printings(reconcile?, counts.seen_scryfall_ids) do
          {:ok,
           %{
             cards_count: counts.cards_count,
             printings_count: counts.printings_count,
             written_cards_count: counts.written_cards_count,
             written_printings_count: counts.written_printings_count,
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

  # Chunking lazily keeps only one batch of decoded cards in memory and lets
  # decoding, row building, and the stored-row diff run between transactions.
  defp import_card_batches(
         cards,
         now,
         oracle_tag_index,
         replace_oracle_tag_fields?,
         source_count,
         log_progress?,
         track_seen?
       ) do
    cards
    |> Stream.chunk_every(@batch_size)
    |> Enum.reduce_while({:ok, initial_import_counts(track_seen?)}, fn batch, {:ok, counts} ->
      rows =
        batch
        |> Enum.reject(&excluded?/1)
        |> ImportRows.rows(now, oracle_tag_index)

      changes = ImportDiff.changes(rows, replace_oracle_tag_fields?)
      wait_for_commit_gap(counts.last_commit_at)

      case import_batch(changes, replace_oracle_tag_fields?) do
        {:ok, outcome} ->
          counts =
            counts
            |> advance_import_counts(length(batch), rows, changes, outcome)
            |> maybe_log_import_progress(log_progress?, source_count)

          {:cont, {:ok, counts}}

        {:error, reason} ->
          {:halt, {:error, reason}}
      end
    end)
  end

  defp wait_for_commit_gap(nil), do: :ok

  defp wait_for_commit_gap(last_commit_at) do
    elapsed = System.monotonic_time(:millisecond) - last_commit_at

    if elapsed < @min_commit_gap_ms do
      Process.sleep(@min_commit_gap_ms - elapsed)
    end

    :ok
  end

  # Memorabilia and token sets are skipped, except for the tokens and emblems
  # themselves: those sets also carry art cards. Scryfall types game helpers
  # (The Monarch, On an Adventure, Day // Night, Punchcard) as a bare "Card",
  # like non-game inserts (World Championship decklists and ads, Booster Blitz
  # minigame cards, checklists, substitute cards). Helpers printed as tokens
  # are kept; inserts, and bare "Card" cards Scryfall does not file as tokens
  # (Secret Lair "Red Mana", Experience and Poison counters), are not.
  defp excluded?(card) do
    token? = Card.token?(card["layout"])

    non_game_insert?(card) or
      (not token? and (bare_card?(card) or excluded_set_type?(card)))
  end

  defp excluded_set_type?(%{"set_type" => set_type}), do: set_type in @excluded_set_types
  defp excluded_set_type?(_card), do: false

  defp non_game_insert?(card) do
    bare_card?(card) and
      (card["set_type"] in @insert_set_types or
         String.contains?(card["name"] || "", ["Checklist", "Substitute Card"]))
  end

  defp bare_card?(%{"type_line" => type_line}) when is_binary(type_line) do
    type_line
    |> String.split("//")
    |> Enum.any?(&(String.trim(&1) == "Card"))
  end

  defp bare_card?(_card), do: false

  # A batch with nothing to write never takes the write lock.
  defp import_batch(%{cards: [], printings: [], relinked_scryfall_ids: []}, _replace_tags?) do
    {:ok, :unchanged}
  end

  defp import_batch(changes, replace_oracle_tag_fields?) do
    Repo.transact(
      fn ->
        insert_card_rows(changes.cards, replace_oracle_tag_fields?)
        insert_printing_rows(changes.printings)
        replace_card_token_rows(changes.relinked_scryfall_ids, changes.card_tokens)
        {:ok, :imported}
      end,
      timeout: :infinity
    )
  end

  defp initial_import_counts(track_seen?) do
    %{
      source_count: 0,
      cards_count: 0,
      printings_count: 0,
      written_cards_count: 0,
      written_printings_count: 0,
      seen_scryfall_ids: if(track_seen?, do: MapSet.new(), else: nil),
      last_commit_at: nil,
      next_progress: @progress_source_card_interval
    }
  end

  defp advance_import_counts(counts, source_count, rows, changes, outcome) do
    %{
      counts
      | source_count: counts.source_count + source_count,
        cards_count: counts.cards_count + length(rows.cards),
        printings_count: counts.printings_count + length(rows.printings),
        written_cards_count: counts.written_cards_count + length(changes.cards),
        written_printings_count: counts.written_printings_count + length(changes.printings),
        seen_scryfall_ids: track_seen(counts.seen_scryfall_ids, rows.printings),
        last_commit_at: last_commit_at(outcome, counts.last_commit_at)
    }
  end

  defp last_commit_at(:imported, _previous), do: System.monotonic_time(:millisecond)
  defp last_commit_at(:unchanged, previous), do: previous

  defp track_seen(nil, _printing_rows), do: nil

  defp track_seen(seen, printing_rows) do
    Enum.reduce(printing_rows, seen, &MapSet.put(&2, &1.scryfall_id))
  end

  defp insert_card_rows(rows, replace_oracle_tag_fields?) do
    insert_in_batches(Card, rows,
      conflict_target: [:oracle_id],
      on_conflict: {:replace, ImportRows.card_fields(replace_oracle_tag_fields?) ++ [:updated_at]}
    )
  end

  defp insert_printing_rows(rows) do
    insert_in_batches(Printing, rows,
      conflict_target: [:scryfall_id],
      on_conflict: {:replace, ImportRows.printing_fields() ++ [:updated_at]}
    )
  end

  # A relinked printing's token links are replaced wholesale so links Scryfall
  # dropped disappear on the next import rather than lingering.
  defp replace_card_token_rows([], _rows), do: :ok

  defp replace_card_token_rows(scryfall_ids, rows) do
    scryfall_ids
    |> Enum.chunk_every(@batch_size)
    |> Enum.each(fn ids ->
      Repo.delete_all(from link in CardToken, where: link.scryfall_id in ^ids)
    end)

    insert_in_batches(CardToken, rows, on_conflict: :nothing)
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
        written_counts_log(counts)
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
        "cards=#{counts.cards_count} printings=#{counts.printings_count} " <>
        written_counts_log(counts)
    )
  end

  defp written_counts_log(counts) do
    "written_cards=#{counts.written_cards_count} " <>
      "written_printings=#{counts.written_printings_count}"
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

  defp maybe_reconcile_printings(false, _seen_scryfall_ids), do: :ok

  defp maybe_reconcile_printings(true, seen_scryfall_ids) do
    case ReconcilePrintings.run(seen_scryfall_ids) do
      {:ok, :reconciled} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  defp utc_now do
    DateTime.utc_now() |> DateTime.truncate(:second)
  end
end
