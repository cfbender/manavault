defmodule Manavault.Catalog.Scryfall.Import do
  @moduledoc false

  alias Manavault.Catalog.{Card, Printing, ScryfallOracleTags, Search}
  alias Manavault.Catalog.Scryfall.ImportRows
  alias Manavault.Repo

  @batch_size 200

  def run(cards, bulk_uri \\ nil, opts \\ [])

  def run(cards, opts, []) when is_list(cards) and is_list(opts) do
    run(cards, nil, opts)
  end

  def run(cards, bulk_uri, opts) when is_list(cards) and is_list(opts) do
    now = utc_now()
    oracle_tag_index = ScryfallOracleTags.build_index(Keyword.get(opts, :oracle_tags, []))

    result =
      Repo.transaction(
        fn ->
          rows = ImportRows.card_rows(cards, now, oracle_tag_index)
          printing_rows = ImportRows.printing_rows(cards, now)
          search_rows = ImportRows.printing_search_rows(cards)

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
                 :oracle_tags,
                 :deck_category,
                 :deck_themes,
                 :rulings_uri,
                 :updated_at
               ]}
          )

          insert_in_batches(Printing, printing_rows,
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

          refresh_printing_search_rows(search_rows)

          %{cards_count: length(rows), printings_count: length(printing_rows), bulk_uri: bulk_uri}
        end,
        timeout: :infinity
      )

    if match?({:ok, _counts}, result) do
      Search.clear_card_name_suggestion_cache()
    end

    result
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
