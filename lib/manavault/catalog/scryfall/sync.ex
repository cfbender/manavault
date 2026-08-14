defmodule Manavault.Catalog.Scryfall.Sync do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.EDHRec.CommanderRanks
  alias Manavault.Catalog.Mtgjson.Saltiness
  alias Manavault.Catalog.Scryfall.{BulkData, Fetch, Import}
  alias Manavault.Catalog.Sync, as: SyncRecord
  alias Manavault.Repo

  require Logger

  @bulk_metadata_url "https://api.scryfall.com/bulk-data/default-cards"
  @oracle_tags_bulk_metadata_url "https://api.scryfall.com/bulk-data/oracle-tags"
  @commander_ranks_url "https://json.edhrec.com/pages/commanders/year.json"
  @saltiness_url "https://mtgjson.com/api/v5/AtomicCards.json.gz"
  @bulk_type "default_cards_paper_v2"

  def latest do
    Repo.one(from sync in SyncRecord, order_by: [desc: sync.started_at], limit: 1)
  end

  def run(opts \\ []) do
    fetcher = Keyword.get(opts, :fetcher, &Fetch.url/1)
    bulk_url = Keyword.get(opts, :bulk_url, @bulk_metadata_url)

    oracle_tags_bulk_url =
      Keyword.get(opts, :oracle_tags_bulk_url, @oracle_tags_bulk_metadata_url)

    saltiness_url = Keyword.get(opts, :saltiness_url, @saltiness_url)
    commander_ranks_url = Keyword.get(opts, :commander_ranks_url, @commander_ranks_url)
    commander_ranks_page_delay_ms = Keyword.get(opts, :commander_ranks_page_delay_ms, 200)

    reconcile? = paper_reconciliation_needed?()
    now = utc_now()

    {:ok, sync} =
      %SyncRecord{}
      |> SyncRecord.changeset(%{status: "running", bulk_type: @bulk_type, started_at: now})
      |> Repo.insert()

    Logger.info("Scryfall catalog sync started sync_id=#{sync.id}")
    Logger.info("Scryfall catalog sync fetching default-cards metadata sync_id=#{sync.id}")

    with {:ok, metadata_body} <- fetcher.(bulk_url),
         {:ok, metadata} <- Jason.decode(metadata_body),
         {:ok, download_uri} <- BulkData.download_uri(metadata),
         :ok <- log_bulk_download_started(sync, "default-cards"),
         {:ok, bulk_body} <- fetcher.(download_uri),
         :ok <- log_bulk_downloaded(sync, "default-cards", bulk_body),
         {:ok, cards, source_count} <- BulkData.decode(bulk_body),
         :ok <- log_bulk_decoded(sync, "default-cards", source_count),
         {:ok, oracle_tags} <- fetch_oracle_tags(fetcher, oracle_tags_bulk_url, sync),
         {:ok, saltiness_scores} <- fetch_saltiness(fetcher, saltiness_url, sync),
         {:ok, commander_ranks} <-
           fetch_commander_ranks(
             fetcher,
             commander_ranks_url,
             commander_ranks_page_delay_ms,
             sync
           ),
         {:ok, counts} <-
           Import.run(Stream.filter(cards, &paper_card?/1), download_uri,
             oracle_tags: oracle_tags,
             log_progress: true,
             source_count: source_count,
             reconcile: reconcile?
           ),
         {:ok, saltiness_count} <- update_saltiness(saltiness_scores),
         {:ok, commander_rank_count} <- update_commander_ranks(commander_ranks) do
      if saltiness_count do
        Logger.info(
          "Scryfall catalog sync updated EDHREC saltiness sync_id=#{sync.id} count=#{saltiness_count}"
        )
      end

      if commander_rank_count do
        Logger.info(
          "Scryfall catalog sync updated EDHREC commander ranks " <>
            "sync_id=#{sync.id} count=#{commander_rank_count}"
        )
      end

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

  defp fetch_oracle_tags(_fetcher, nil, sync) do
    Logger.info("Scryfall catalog sync skipping oracle-tags bulk sync_id=#{sync.id}")
    {:ok, []}
  end

  defp fetch_oracle_tags(fetcher, oracle_tags_bulk_url, sync) do
    Logger.info("Scryfall catalog sync fetching oracle-tags metadata sync_id=#{sync.id}")

    result =
      with {:ok, metadata_body} <- fetcher.(oracle_tags_bulk_url),
           {:ok, metadata} <- Jason.decode(metadata_body),
           {:ok, download_uri} <- BulkData.download_uri(metadata),
           :ok <- log_bulk_download_started(sync, "oracle-tags"),
           {:ok, bulk_body} <- fetcher.(download_uri),
           :ok <- log_bulk_downloaded(sync, "oracle-tags", bulk_body),
           {:ok, tags} <- BulkData.decode_list(bulk_body),
           :ok <- log_bulk_decoded(sync, "oracle-tags", length(tags)) do
        {:ok, tags}
      end

    case result do
      {:ok, tags} ->
        {:ok, tags}

      {:error, reason} ->
        Logger.warning(
          "Scryfall catalog sync preserving existing oracle tags " <>
            "sync_id=#{sync.id} error=#{format_error(reason)}"
        )

        {:ok, :skip}
    end
  end

  defp fetch_saltiness(_fetcher, nil, sync) do
    Logger.info("Scryfall catalog sync skipping MTGJSON saltiness sync_id=#{sync.id}")
    {:ok, :skip}
  end

  defp fetch_saltiness(fetcher, saltiness_url, sync) do
    Logger.info("Scryfall catalog sync fetching MTGJSON saltiness sync_id=#{sync.id}")

    result =
      with {:ok, body} <- fetcher.(saltiness_url),
           :ok <- log_bulk_downloaded(sync, "MTGJSON AtomicCards", body),
           {:ok, scores} <- Saltiness.decode(body),
           :ok <- log_bulk_decoded(sync, "MTGJSON AtomicCards saltiness", map_size(scores)) do
        {:ok, scores}
      end

    case result do
      {:ok, scores} ->
        {:ok, scores}

      {:error, reason} ->
        Logger.warning(
          "Scryfall catalog sync preserving existing EDHREC saltiness " <>
            "sync_id=#{sync.id} error=#{format_error(reason)}"
        )

        {:ok, :skip}
    end
  end

  defp update_saltiness(:skip), do: {:ok, nil}
  defp update_saltiness(scores), do: Saltiness.update_cards(scores)

  defp fetch_commander_ranks(_fetcher, nil, _page_delay_ms, sync) do
    Logger.info("Scryfall catalog sync skipping EDHREC commander ranks sync_id=#{sync.id}")
    {:ok, :skip}
  end

  defp fetch_commander_ranks(fetcher, url, page_delay_ms, sync) do
    Logger.info("Scryfall catalog sync fetching EDHREC commander ranks sync_id=#{sync.id}")

    case CommanderRanks.fetch(fetcher, url, page_delay_ms: page_delay_ms) do
      {:ok, ranks, page_count} ->
        Logger.info(
          "Scryfall catalog sync decoded EDHREC commander ranks " <>
            "sync_id=#{sync.id} count=#{map_size(ranks)} pages=#{page_count}"
        )

        {:ok, ranks}

      {:error, reason} ->
        Logger.warning(
          "Scryfall catalog sync preserving existing EDHREC commander ranks " <>
            "sync_id=#{sync.id} error=#{format_error(reason)}"
        )

        {:ok, :skip}
    end
  end

  defp update_commander_ranks(:skip), do: {:ok, nil}
  defp update_commander_ranks(ranks), do: CommanderRanks.update_cards(ranks)

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

  defp paper_card?(%{"games" => games}) when is_list(games), do: "paper" in games
  defp paper_card?(_card), do: false

  defp paper_reconciliation_needed? do
    not Repo.exists?(
      from sync in SyncRecord,
        where: sync.bulk_type == @bulk_type and sync.status == "succeeded"
    )
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
