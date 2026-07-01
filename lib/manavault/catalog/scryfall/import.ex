defmodule Manavault.Catalog.Scryfall.Import do
  @moduledoc false

  alias Manavault.Catalog.{Card, Printing, ScryfallOracleTags, Search}
  alias Manavault.Catalog.Scryfall.ImportRows
  alias Manavault.Repo

  require Logger

  @batch_size 200
  @progress_source_card_interval 5_000

  def run(cards, bulk_uri \\ nil, opts \\ [])

  def run(cards, opts, []) when is_list(cards) and is_list(opts) do
    run(cards, nil, opts)
  end

  def run(cards, bulk_uri, opts) when is_list(cards) and is_list(opts) do
    log_progress? = Keyword.get(opts, :log_progress, false)
    source_count = Keyword.get(opts, :source_count) || if(log_progress?, do: length(cards))
    now = utc_now()
    oracle_tag_index = ScryfallOracleTags.build_index(Keyword.get(opts, :oracle_tags, []))

    log_import_started(log_progress?, source_count)

    result =
      Repo.transact(
        fn ->
          counts = import_card_batches(cards, now, oracle_tag_index, source_count, log_progress?)

          {:ok,
           %{
             cards_count: counts.cards_count,
             printings_count: counts.printings_count,
             bulk_uri: bulk_uri
           }}
        end,
        timeout: :infinity
      )

    case result do
      {:ok, counts} ->
        log_import_completed(log_progress?, counts, source_count)
        Search.clear_card_name_suggestion_cache()

      {:error, reason} ->
        log_import_failed(log_progress?, reason)
    end

    result
  end

  defp import_card_batches(cards, now, oracle_tag_index, source_count, log_progress?) do
    cards
    |> Enum.chunk_every(@batch_size)
    |> Enum.reduce(initial_import_counts(), fn batch, counts ->
      rows = ImportRows.rows(batch, now, oracle_tag_index)

      insert_card_rows(rows.cards)
      insert_printing_rows(rows.printings)
      refresh_printing_search_rows(rows.search_rows)

      counts
      |> advance_import_counts(length(batch), rows)
      |> maybe_log_import_progress(log_progress?, source_count)
    end)
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
           :type_line,
           :oracle_text,
           :mana_cost,
           :cmc,
           :colors,
           :color_identity,
           :legalities,
           :game_changer,
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

  defp utc_now do
    DateTime.utc_now() |> DateTime.truncate(:second)
  end
end
