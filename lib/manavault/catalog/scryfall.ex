defmodule Manavault.Catalog.Scryfall do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, Printing, ScryfallOracleTags, Search, Sync}

  alias Manavault.Repo

  @bulk_metadata_url "https://api.scryfall.com/bulk-data/default-cards"
  @oracle_tags_bulk_metadata_url "https://api.scryfall.com/bulk-data/oracle-tags"
  @bulk_type "default_cards"
  @batch_size 200
  def latest_sync do
    Repo.one(from sync in Sync, order_by: [desc: sync.started_at], limit: 1)
  end

  def sync_scryfall(opts \\ []) do
    fetcher = Keyword.get(opts, :fetcher, &fetch_url/1)
    bulk_url = Keyword.get(opts, :bulk_url, @bulk_metadata_url)

    oracle_tags_bulk_url =
      Keyword.get(opts, :oracle_tags_bulk_url, @oracle_tags_bulk_metadata_url)

    now = utc_now()

    {:ok, sync} =
      %Sync{}
      |> Sync.changeset(%{status: "running", bulk_type: @bulk_type, started_at: now})
      |> Repo.insert()

    with {:ok, metadata_body} <- fetcher.(bulk_url),
         {:ok, metadata} <- Jason.decode(metadata_body),
         {:ok, download_uri} <- fetch_download_uri(metadata),
         {:ok, bulk_body} <- fetcher.(download_uri),
         {:ok, cards} <- Jason.decode(bulk_body),
         {:ok, oracle_tags} <- fetch_oracle_tags(fetcher, oracle_tags_bulk_url),
         {:ok, counts} <- import_cards(cards, download_uri, oracle_tags: oracle_tags) do
      sync
      |> Sync.changeset(%{
        status: "succeeded",
        bulk_uri: download_uri,
        completed_at: utc_now(),
        cards_count: counts.cards_count,
        printings_count: counts.printings_count,
        error: nil
      })
      |> Repo.update()
    else
      {:error, reason} -> {:error, fail_sync!(sync, reason)}
      other -> {:error, fail_sync!(sync, inspect(other))}
    end
  end

  def import_cards(cards, bulk_uri \\ nil, opts \\ [])

  def import_cards(cards, opts, []) when is_list(cards) and is_list(opts) do
    import_cards(cards, nil, opts)
  end

  def import_cards(cards, bulk_uri, opts) when is_list(cards) and is_list(opts) do
    now = utc_now()
    oracle_tag_index = ScryfallOracleTags.build_index(Keyword.get(opts, :oracle_tags, []))

    result =
      Repo.transaction(
        fn ->
          rows = Enum.flat_map(cards, &card_row(&1, now, oracle_tag_index))
          printing_rows = Enum.flat_map(cards, &printing_row(&1, now))
          search_rows = Enum.flat_map(cards, &printing_search_row/1)

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

  def card_rulings(card, opts \\ [])

  def card_rulings(%Card{rulings_uri: rulings_uri}, _opts) when rulings_uri in [nil, ""], do: []

  def card_rulings(%Card{rulings_uri: rulings_uri}, opts) when is_binary(rulings_uri) do
    fetcher = Keyword.get(opts, :fetcher, rulings_fetcher())

    with {:ok, body} <- fetch_rulings_body(fetcher, rulings_uri),
         {:ok, %{"data" => rulings}} when is_list(rulings) <- decode_rulings_body(body),
         true <- Enum.all?(rulings, &valid_ruling?/1) do
      Enum.map(rulings, &ruling_attrs/1)
    else
      _reason -> []
    end
  end

  def card_rulings(_card, _opts), do: []

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

  defp card_row(%{"oracle_id" => oracle_id, "name" => name} = card, now, oracle_tag_index)
       when is_binary(oracle_id) and is_binary(name) do
    tag_fields = ScryfallOracleTags.fields_for_card(card, oracle_tag_index)

    [
      %{
        oracle_id: oracle_id,
        name: name,
        type_line: card["type_line"],
        oracle_text: oracle_text(card),
        mana_cost: card["mana_cost"],
        cmc: card["cmc"],
        colors: encode_json(card["colors"] || []),
        color_identity: encode_json(card["color_identity"] || []),
        legalities: encode_json(card["legalities"] || %{}),
        oracle_tags: tag_fields.oracle_tags,
        deck_category: tag_fields.deck_category,
        deck_themes: tag_fields.deck_themes,
        rulings_uri: card["rulings_uri"],
        inserted_at: now,
        updated_at: now
      }
    ]
  end

  defp card_row(_card, _now, _oracle_tag_index), do: []

  defp printing_row(%{"id" => scryfall_id, "oracle_id" => oracle_id} = card, now)
       when is_binary(scryfall_id) and is_binary(oracle_id) do
    [
      %{
        scryfall_id: scryfall_id,
        oracle_id: oracle_id,
        set_code: String.downcase(card["set"] || ""),
        set_name: card["set_name"],
        collector_number: card["collector_number"] || "",
        flavor_name: flavor_name(card),
        flavor_text: flavor_text(card),
        lang: card["lang"] || "en",
        rarity: card["rarity"],
        finishes: encode_json(card["finishes"] || []),
        image_uris: encode_json(image_uris(card)),
        prices: encode_json(card["prices"] || %{}),
        released_at: parse_date(card["released_at"]),
        inserted_at: now,
        updated_at: now
      }
    ]
  end

  defp printing_row(_card, _now), do: []

  defp printing_search_row(%{"id" => scryfall_id, "name" => name} = card)
       when is_binary(scryfall_id) and is_binary(name) do
    oracle_text = oracle_text(card) || ""

    [
      %{
        scryfall_id: scryfall_id,
        name: normalize_search_text(name),
        compact_name: compact_search_text(name),
        flavor_name: normalize_search_text(flavor_name(card) || ""),
        compact_flavor_name: compact_search_text(flavor_name(card) || ""),
        flavor_text: normalize_search_text(flavor_text(card) || ""),
        compact_flavor_text: compact_search_text(flavor_text(card) || ""),
        type_line: normalize_search_text(card["type_line"] || ""),
        oracle_text: normalize_search_text(oracle_text),
        compact_oracle_text: compact_search_text(oracle_text),
        set_code: normalize_search_text(card["set"] || ""),
        collector_number: normalize_search_text(card["collector_number"] || "")
      }
    ]
  end

  defp printing_search_row(_card), do: []

  defp normalize_search_text(value) when is_binary(value) do
    value
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/u, " ")
    |> String.trim()
  end

  defp compact_search_text(value) when is_binary(value) do
    value
    |> String.downcase()
    |> String.replace(~r/[^a-z0-9]+/u, "")
  end

  defp flavor_name(%{"flavor_name" => name}) when is_binary(name), do: name

  defp flavor_name(%{"card_faces" => faces}) when is_list(faces) do
    faces
    |> Enum.map(&Map.get(&1, "flavor_name"))
    |> Enum.reject(&is_nil/1)
    |> Enum.join("\n---\n")
  end

  defp flavor_name(_card), do: nil

  defp flavor_text(%{"flavor_text" => text}) when is_binary(text), do: text

  defp flavor_text(%{"card_faces" => faces}) when is_list(faces) do
    faces
    |> Enum.map(&Map.get(&1, "flavor_text"))
    |> Enum.reject(&is_nil/1)
    |> Enum.join("\n---\n")
  end

  defp flavor_text(_card), do: nil

  defp oracle_text(%{"oracle_text" => text}) when is_binary(text), do: text

  defp oracle_text(%{"card_faces" => faces}) when is_list(faces) do
    faces
    |> Enum.map(&Map.get(&1, "oracle_text"))
    |> Enum.reject(&is_nil/1)
    |> Enum.join("\n---\n")
  end

  defp oracle_text(_card), do: nil

  defp image_uris(%{"image_uris" => image_uris}) when is_map(image_uris), do: image_uris

  defp image_uris(%{"card_faces" => faces}) when is_list(faces) do
    faces
    |> Enum.map(&Map.get(&1, "image_uris"))
    |> Enum.reject(&is_nil/1)
  end

  defp image_uris(_card), do: %{}

  defp encode_json(value), do: Jason.encode!(value)

  defp parse_date(nil), do: nil

  defp parse_date(date) when is_binary(date) do
    case Date.from_iso8601(date) do
      {:ok, parsed} -> parsed
      {:error, _reason} -> nil
    end
  end

  defp fetch_download_uri(%{"download_uri" => download_uri}) when is_binary(download_uri) do
    {:ok, download_uri}
  end

  defp fetch_download_uri(_metadata),
    do: {:error, "Scryfall bulk metadata did not include download_uri"}

  defp fetch_oracle_tags(_fetcher, nil), do: {:ok, []}

  defp fetch_oracle_tags(fetcher, oracle_tags_bulk_url) do
    with {:ok, metadata_body} <- fetcher.(oracle_tags_bulk_url),
         {:ok, metadata} <- Jason.decode(metadata_body),
         {:ok, download_uri} <- fetch_download_uri(metadata),
         {:ok, bulk_body} <- fetcher.(download_uri),
         {:ok, tags} <- decode_oracle_tags_bulk(bulk_body) do
      {:ok, tags}
    end
  end

  defp decode_oracle_tags_bulk(body) do
    case Jason.decode(body) do
      {:ok, tags} when is_list(tags) -> {:ok, tags}
      {:ok, %{"data" => tags}} when is_list(tags) -> {:ok, tags}
      {:ok, _value} -> {:error, "Scryfall oracle tags bulk did not decode to a list"}
      {:error, reason} -> {:error, reason}
    end
  end

  defp fail_sync!(sync, reason) do
    sync
    |> Sync.changeset(%{
      status: "failed",
      completed_at: utc_now(),
      error: format_error(reason)
    })
    |> Repo.update!()
  end

  defp format_error(%{__exception__: true} = exception), do: Exception.message(exception)
  defp format_error(reason) when is_binary(reason), do: reason
  defp format_error(reason), do: inspect(reason)

  defp rulings_fetcher do
    Application.get_env(:manavault, :scryfall_rulings_fetcher) || (&fetch_url/1)
  end

  defp fetch_rulings_body(fetcher, rulings_uri) do
    case fetcher.(rulings_uri) do
      {:ok, %{status: status, body: body}} when status in 200..299 -> {:ok, body}
      {:ok, %{status: _status}} -> :error
      {:ok, body} -> {:ok, body}
      {:error, _reason} -> :error
      _other -> :error
    end
  end

  defp decode_rulings_body(body) when is_binary(body), do: Jason.decode(body)
  defp decode_rulings_body(body) when is_map(body), do: {:ok, body}
  defp decode_rulings_body(_body), do: :error

  defp valid_ruling?(%{"comment" => comment} = ruling) when is_binary(comment) do
    optional_string?(Map.get(ruling, "source")) and
      optional_string?(Map.get(ruling, "published_at"))
  end

  defp valid_ruling?(_ruling), do: false

  defp optional_string?(nil), do: true
  defp optional_string?(value), do: is_binary(value)

  defp ruling_attrs(ruling) do
    %{
      source: Map.get(ruling, "source"),
      published_at: Map.get(ruling, "published_at"),
      comment: Map.fetch!(ruling, "comment")
    }
  end

  defp fetch_url(url) do
    case Req.get(url,
           headers: [
             {"accept", "application/json"},
             {"user-agent", "ManaVault/0.1 (+https://github.com/cfbender/manavault)"}
           ]
         ) do
      {:ok, %{status: status, body: body}} when status in 200..299 -> {:ok, normalize_body(body)}
      {:ok, %{status: status}} -> {:error, "Scryfall request failed with HTTP #{status}"}
      {:error, reason} -> {:error, reason}
    end
  end

  defp normalize_body(body) when is_binary(body), do: body
  defp normalize_body(body), do: Jason.encode!(body)

  defp utc_now do
    DateTime.utc_now() |> DateTime.truncate(:second)
  end
end
