defmodule Manavault.Catalog.Scryfall.Sync do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.Scryfall.{Fetch, Import}
  alias Manavault.Catalog.Sync, as: SyncRecord
  alias Manavault.Repo

  require Logger

  @bulk_metadata_url "https://api.scryfall.com/bulk-data/default-cards"
  @oracle_tags_bulk_metadata_url "https://api.scryfall.com/bulk-data/oracle-tags"
  @bulk_type "default_cards"

  def latest do
    Repo.one(from sync in SyncRecord, order_by: [desc: sync.started_at], limit: 1)
  end

  def run(opts \\ []) do
    fetcher = Keyword.get(opts, :fetcher, &Fetch.url/1)
    bulk_url = Keyword.get(opts, :bulk_url, @bulk_metadata_url)

    oracle_tags_bulk_url =
      Keyword.get(opts, :oracle_tags_bulk_url, @oracle_tags_bulk_metadata_url)

    now = utc_now()

    {:ok, sync} =
      %SyncRecord{}
      |> SyncRecord.changeset(%{status: "running", bulk_type: @bulk_type, started_at: now})
      |> Repo.insert()

    Logger.info("Scryfall catalog sync started sync_id=#{sync.id}")
    Logger.info("Scryfall catalog sync fetching default-cards metadata sync_id=#{sync.id}")

    with {:ok, metadata_body} <- fetcher.(bulk_url),
         {:ok, metadata} <- Jason.decode(metadata_body),
         {:ok, download_uri} <- fetch_download_uri(metadata),
         :ok <- log_bulk_download_started(sync, "default-cards"),
         {:ok, bulk_body} <- fetcher.(download_uri),
         :ok <- log_bulk_downloaded(sync, "default-cards", bulk_body),
         {:ok, cards} <- Jason.decode(bulk_body),
         source_count <- length(cards),
         :ok <- log_bulk_decoded(sync, "default-cards", source_count),
         {:ok, oracle_tags} <- fetch_oracle_tags(fetcher, oracle_tags_bulk_url, sync),
         {:ok, counts} <-
           Import.run(cards, download_uri,
             oracle_tags: oracle_tags,
             log_progress: true,
             source_count: source_count
           ) do
      result =
        sync
        |> SyncRecord.changeset(%{
          status: "succeeded",
          bulk_uri: download_uri,
          completed_at: utc_now(),
          cards_count: counts.cards_count,
          printings_count: counts.printings_count,
          error: nil
        })
        |> Repo.update()

      log_sync_success(sync, result)
      result
    else
      {:error, reason} ->
        Logger.warning(
          "Scryfall catalog sync failed sync_id=#{sync.id} error=#{format_error(reason)}"
        )

        {:error, fail_sync!(sync, reason)}

      other ->
        Logger.warning("Scryfall catalog sync failed sync_id=#{sync.id} error=#{inspect(other)}")
        {:error, fail_sync!(sync, inspect(other))}
    end
  end

  defp fetch_download_uri(%{"download_uri" => download_uri}) when is_binary(download_uri) do
    {:ok, download_uri}
  end

  defp fetch_download_uri(_metadata),
    do: {:error, "Scryfall bulk metadata did not include download_uri"}

  defp fetch_oracle_tags(_fetcher, nil, sync) do
    Logger.info("Scryfall catalog sync skipping oracle-tags bulk sync_id=#{sync.id}")
    {:ok, []}
  end

  defp fetch_oracle_tags(fetcher, oracle_tags_bulk_url, sync) do
    Logger.info("Scryfall catalog sync fetching oracle-tags metadata sync_id=#{sync.id}")

    with {:ok, metadata_body} <- fetcher.(oracle_tags_bulk_url),
         {:ok, metadata} <- Jason.decode(metadata_body),
         {:ok, download_uri} <- fetch_download_uri(metadata),
         :ok <- log_bulk_download_started(sync, "oracle-tags"),
         {:ok, bulk_body} <- fetcher.(download_uri),
         :ok <- log_bulk_downloaded(sync, "oracle-tags", bulk_body),
         {:ok, tags} <- decode_oracle_tags_bulk(bulk_body),
         :ok <- log_bulk_decoded(sync, "oracle-tags", length(tags)) do
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

  defp log_bulk_download_started(sync, bulk_name) do
    Logger.info("Scryfall catalog sync downloading #{bulk_name} bulk sync_id=#{sync.id}")
  end

  defp log_bulk_downloaded(sync, bulk_name, body) do
    Logger.info(
      "Scryfall catalog sync downloaded #{bulk_name} bulk sync_id=#{sync.id} " <>
        "bytes=#{payload_size(body)}"
    )
  end

  defp log_bulk_decoded(sync, bulk_name, count) do
    Logger.info(
      "Scryfall catalog sync decoded #{bulk_name} bulk sync_id=#{sync.id} count=#{count}"
    )
  end

  defp log_sync_success(_sync, {:error, changeset}) do
    Logger.warning(
      "Scryfall catalog sync could not record success error=#{inspect(changeset.errors)}"
    )
  end

  defp log_sync_success(_sync, {:ok, sync}) do
    Logger.info(
      "Scryfall catalog sync succeeded sync_id=#{sync.id} " <>
        "cards=#{sync.cards_count} printings=#{sync.printings_count}"
    )
  end

  defp payload_size(body) when is_binary(body), do: byte_size(body)
  defp payload_size(_body), do: "unknown"

  defp fail_sync!(sync, reason) do
    sync
    |> SyncRecord.changeset(%{
      status: "failed",
      completed_at: utc_now(),
      error: format_error(reason)
    })
    |> Repo.update!()
  end

  defp format_error(%{__exception__: true} = exception), do: Exception.message(exception)
  defp format_error(reason) when is_binary(reason), do: reason
  defp format_error(reason), do: inspect(reason)

  defp utc_now do
    DateTime.utc_now() |> DateTime.truncate(:second)
  end
end
