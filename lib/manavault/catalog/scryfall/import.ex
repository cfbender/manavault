defmodule Manavault.Catalog.Scryfall.Import do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, Printing, ScryfallOracleTags, Search}

  alias Manavault.Catalog.Scryfall.{BulkData, ImportRows, ReconcilePrintings}
  alias Manavault.Repo

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
                 log_progress?
               ),
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

  defp import_card_batches(
         cards,
         now,
         oracle_tag_index,
         replace_oracle_tag_fields?,
         source_count,
         log_progress?
       ) do
    cards
    |> Enum.chunk_every(@batch_size)
    |> Enum.reduce_while({:ok, initial_import_counts()}, fn batch, {:ok, counts} ->
      rows =
        batch
        |> Enum.reject(&excluded_set_type?/1)
        |> ImportRows.rows(now, oracle_tag_index)

      case import_batch(rows, replace_oracle_tag_fields?) do
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

  defp import_batch(rows, replace_oracle_tag_fields?) do
    Repo.transact(
      fn ->
        insert_card_rows(rows.cards, replace_oracle_tag_fields?)
        insert_printing_rows(rows.printings)
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
      next_progress: @progress_source_card_interval
    }
  end

  defp advance_import_counts(counts, source_count, rows) do
    %{
      counts
      | source_count: counts.source_count + source_count,
        cards_count: counts.cards_count + length(rows.cards),
        printings_count: counts.printings_count + length(rows.printings)
    }
  end

  defp insert_card_rows(rows, replace_oracle_tag_fields?) do
    replace_fields = [
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
      :rulings_uri,
      :updated_at
    ]

    replace_fields =
      if replace_oracle_tag_fields? do
        replace_fields ++ [:oracle_tags, :deck_category, :deck_themes]
      else
        replace_fields
      end

    insert_in_batches(Card, rows,
      conflict_target: [:oracle_id],
      on_conflict: {:replace, replace_fields}
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
           :normalized_flavor_name,
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
        "cards=#{counts.cards_count} printings=#{counts.printings_count}"
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

  defp maybe_reconcile_printings(false, _imported_at), do: :ok

  defp maybe_reconcile_printings(true, imported_at) do
    case ReconcilePrintings.run(imported_at) do
      {:ok, :reconciled} -> :ok
      {:error, reason} -> {:error, reason}
    end
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
