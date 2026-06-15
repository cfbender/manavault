defmodule Manavault.Catalog do
  @moduledoc """
  Local Scryfall catalog storage and sync functions.
  """

  import Ecto.Query

  alias Manavault.Catalog.{Card, Printing, Sync}
  alias Manavault.Repo

  @bulk_metadata_url "https://api.scryfall.com/bulk-data/default-cards"
  @bulk_type "default-cards"
  @batch_size 500

  def search_cards(term, opts \\ []) when is_binary(term) do
    limit = Keyword.get(opts, :limit, 20)
    pattern = "%#{String.downcase(term)}%"

    Card
    |> where([card], fragment("lower(?) LIKE ?", card.name, ^pattern))
    |> order_by([card], asc: card.name)
    |> limit(^limit)
    |> Repo.all()
  end

  def get_printing_by_scryfall_id(scryfall_id) when is_binary(scryfall_id) do
    Repo.get(Printing, scryfall_id)
  end

  def get_printing(set_code, collector_number)
      when is_binary(set_code) and is_binary(collector_number) do
    Repo.one(
      from printing in Printing,
        where:
          printing.set_code == ^String.downcase(set_code) and
            printing.collector_number == ^collector_number,
        limit: 1
    )
  end

  def latest_sync do
    Repo.one(from sync in Sync, order_by: [desc: sync.started_at], limit: 1)
  end

  def sync_scryfall(opts \\ []) do
    fetcher = Keyword.get(opts, :fetcher, &fetch_url/1)
    bulk_url = Keyword.get(opts, :bulk_url, @bulk_metadata_url)
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
         {:ok, counts} <- import_cards(cards, download_uri) do
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
      {:error, reason} -> fail_sync(sync, reason)
      other -> fail_sync(sync, inspect(other))
    end
  end

  def import_cards(cards, bulk_uri \\ nil) when is_list(cards) do
    now = utc_now()

    Repo.transaction(fn ->
      rows = Enum.flat_map(cards, &card_row(&1, now))
      printing_rows = Enum.flat_map(cards, &printing_row(&1, now))

      insert_in_batches(Card, rows,
        conflict_target: [:oracle_id],
        on_conflict:
          {:replace, [:name, :type_line, :oracle_text, :color_identity, :legalities, :updated_at]}
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
             :finishes,
             :image_uris,
             :prices,
             :released_at,
             :updated_at
           ]}
      )

      %{cards_count: length(rows), printings_count: length(printing_rows), bulk_uri: bulk_uri}
    end)
  end

  defp insert_in_batches(_schema, [], _opts), do: :ok

  defp insert_in_batches(schema, rows, opts) do
    rows
    |> Enum.chunk_every(@batch_size)
    |> Enum.each(fn batch -> Repo.insert_all(schema, batch, opts) end)
  end

  defp card_row(%{"oracle_id" => oracle_id, "name" => name} = card, now)
       when is_binary(oracle_id) and is_binary(name) do
    [
      %{
        oracle_id: oracle_id,
        name: name,
        type_line: card["type_line"],
        oracle_text: oracle_text(card),
        color_identity: encode_json(card["color_identity"] || []),
        legalities: encode_json(card["legalities"] || %{}),
        inserted_at: now,
        updated_at: now
      }
    ]
  end

  defp card_row(_card, _now), do: []

  defp printing_row(%{"id" => scryfall_id, "oracle_id" => oracle_id} = card, now)
       when is_binary(scryfall_id) and is_binary(oracle_id) do
    [
      %{
        scryfall_id: scryfall_id,
        oracle_id: oracle_id,
        set_code: String.downcase(card["set"] || ""),
        set_name: card["set_name"],
        collector_number: card["collector_number"] || "",
        lang: card["lang"] || "en",
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

  defp fail_sync(sync, reason) do
    sync
    |> Sync.changeset(%{
      status: "failed",
      completed_at: utc_now(),
      error: Exception.message(normalize_error(reason))
    })
    |> Repo.update()
  end

  defp normalize_error(%{__exception__: true} = exception), do: exception
  defp normalize_error(reason), do: RuntimeError.exception(inspect(reason))

  defp fetch_url(url) do
    case Req.get(url,
           headers: [{"user-agent", "ManaVault/0.1 (+https://github.com/cfbender/manavault)"}]
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
