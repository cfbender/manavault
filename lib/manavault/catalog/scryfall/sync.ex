defmodule Manavault.Catalog.Scryfall.Sync do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.Scryfall.{Fetch, Import}
  alias Manavault.Catalog.Sync, as: SyncRecord
  alias Manavault.Repo

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

    with {:ok, metadata_body} <- fetcher.(bulk_url),
         {:ok, metadata} <- Jason.decode(metadata_body),
         {:ok, download_uri} <- fetch_download_uri(metadata),
         {:ok, bulk_body} <- fetcher.(download_uri),
         {:ok, cards} <- Jason.decode(bulk_body),
         {:ok, oracle_tags} <- fetch_oracle_tags(fetcher, oracle_tags_bulk_url),
         {:ok, counts} <- Import.run(cards, download_uri, oracle_tags: oracle_tags) do
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
    else
      {:error, reason} -> {:error, fail_sync!(sync, reason)}
      other -> {:error, fail_sync!(sync, inspect(other))}
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
