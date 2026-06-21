defmodule Manavault.Catalog.ArtIndex do
  @moduledoc """
  Builds the persisted Scryfall art hash index used by art-first scanning.
  """

  import Ecto.Query

  require Logger

  alias Manavault.Catalog.{ArtMatcher, ImageHashDaemon, Printing, PrintingArtHash}
  alias Manavault.Repo

  @user_agent "ManaVault/0.1 (scanner art index)"
  @batch_size 100
  @hash_batch_size 25
  @download_concurrency 4
  @download_timeout 15_000

  def build(opts \\ []) do
    build_opts = build_options(opts)
    started_at = System.monotonic_time(:millisecond)

    summary =
      build_opts
      |> build_batches(nil, empty_summary(), started_at)
      |> Map.take([:indexed, :candidates, :references, :failed, :batches])

    ArtMatcher.clear_cache()
    ArtMatcher.index_status()
    {:ok, summary}
  end

  def import_fixture_hashes(fixtures, fixtures_dir) when is_list(fixtures) do
    references =
      fixtures
      |> Enum.flat_map(fn
        %{"image_path" => image_path, "card" => %{"id" => scryfall_id}} = fixture ->
          path = Path.expand(image_path, fixtures_dir)

          if File.regular?(path) do
            [
              %{
                scryfall_id: scryfall_id,
                path: path,
                crop: "art",
                source_url: Map.get(fixture, "image_url"),
                image_path: path
              }
            ]
          else
            []
          end

        _fixture ->
          []
      end)

    rows = hash_references(references, @hash_batch_size, &ImageHashDaemon.hash_paths/2)
    {count, _rows} = ArtMatcher.upsert_hashes(rows)
    ArtMatcher.index_status()
    {:ok, %{indexed: count, candidates: length(references)}}
  end

  defp build_options(opts) do
    %{
      limit: opts |> Keyword.get(:limit, :all) |> normalize_limit(),
      force?: Keyword.get(opts, :force, false),
      batch_size: opts |> Keyword.get(:batch_size, @batch_size) |> positive_integer(@batch_size),
      hash_batch_size:
        opts
        |> Keyword.get(:hash_batch_size, @hash_batch_size)
        |> positive_integer(@hash_batch_size),
      max_concurrency:
        opts
        |> Keyword.get(:max_concurrency, default_download_concurrency())
        |> positive_integer(@download_concurrency),
      fetch_image_fun: Keyword.get(opts, :fetch_image_fun, &download_image/2),
      hash_paths_fun: Keyword.get(opts, :hash_paths_fun, &ImageHashDaemon.hash_paths/2)
    }
  end

  defp empty_summary do
    %{indexed: 0, candidates: 0, references: 0, failed: 0, batches: 0}
  end

  defp build_batches(opts, cursor, summary, started_at) do
    case next_batch_limit(opts.limit, summary.candidates, opts.batch_size) do
      0 ->
        summary

      batch_limit ->
        case list_printing_batch(cursor, batch_limit, opts.force?) do
          [] ->
            summary

          printings ->
            batch_summary = build_batch(printings, opts)

            summary =
              summary
              |> Map.update!(:indexed, &(&1 + batch_summary.indexed))
              |> Map.update!(:candidates, &(&1 + length(printings)))
              |> Map.update!(:references, &(&1 + batch_summary.references))
              |> Map.update!(:failed, &(&1 + batch_summary.failed))
              |> Map.update!(:batches, &(&1 + 1))

            log_progress(summary, batch_summary, length(printings), started_at)
            build_batches(opts, printing_cursor(List.last(printings)), summary, started_at)
        end
    end
  end

  defp build_batch(printings, opts) do
    references = fetch_references(printings, opts)
    rows = hash_references(references, opts.hash_batch_size, opts.hash_paths_fun)
    {indexed, _rows} = upsert_hash_rows(rows)

    %{
      indexed: indexed,
      references: length(references),
      failed: max(length(printings) - length(rows), 0)
    }
  end

  defp upsert_hash_rows([]), do: {0, []}
  defp upsert_hash_rows(rows), do: ArtMatcher.upsert_hashes(rows, clear_cache: false)

  defp list_printing_batch(cursor, limit, force?) do
    Printing
    |> where([printing], printing.lang == "en")
    |> where([printing], not is_nil(printing.image_uris))
    |> maybe_after_cursor(cursor)
    |> order_by([printing], desc: printing.released_at, asc: printing.scryfall_id)
    |> maybe_missing_only(force?)
    |> limit(^limit)
    |> Repo.all()
  end

  defp maybe_missing_only(query, true), do: query

  defp maybe_missing_only(query, false) do
    query
    |> join(:left, [printing], hash in PrintingArtHash,
      on: hash.scryfall_id == printing.scryfall_id
    )
    |> where([_printing, hash], is_nil(hash.scryfall_id))
  end

  defp maybe_after_cursor(query, nil), do: query

  defp maybe_after_cursor(query, {nil, scryfall_id}) do
    where(query, [printing], is_nil(printing.released_at) and printing.scryfall_id > ^scryfall_id)
  end

  defp maybe_after_cursor(query, {released_at, scryfall_id}) do
    where(
      query,
      [printing],
      printing.released_at < ^released_at or
        (printing.released_at == ^released_at and printing.scryfall_id > ^scryfall_id) or
        is_nil(printing.released_at)
    )
  end

  defp printing_cursor(%Printing{} = printing), do: {printing.released_at, printing.scryfall_id}

  defp fetch_references(printings, %{
         fetch_image_fun: fetch_image_fun,
         max_concurrency: max_concurrency
       }) do
    printings
    |> Task.async_stream(&cached_reference(&1, fetch_image_fun),
      max_concurrency: max_concurrency,
      ordered: false,
      timeout: :infinity
    )
    |> Enum.flat_map(fn
      {:ok, references} ->
        references

      {:exit, reason} ->
        Logger.warning("Art index image cache task failed: #{inspect(reason)}")
        []
    end)
  end

  defp log_progress(summary, batch_summary, batch_count, started_at) do
    elapsed_ms = System.monotonic_time(:millisecond) - started_at

    Logger.info(fn ->
      "Scanner art index progress: " <>
        "#{summary.indexed}/#{summary.candidates} indexed this run " <>
        "batches=#{summary.batches} " <>
        "last_batch=#{batch_summary.indexed}/#{batch_count} " <>
        "references=#{summary.references} failed=#{summary.failed} elapsed_ms=#{elapsed_ms}"
    end)
  end

  defp next_batch_limit(:all, _processed, batch_size), do: batch_size

  defp next_batch_limit(limit, processed, batch_size) do
    remaining = max(limit - processed, 0)

    if remaining == 0 do
      0
    else
      min(batch_size, remaining)
    end
  end

  defp normalize_limit(value) when is_integer(value) and value > 0, do: value
  defp normalize_limit(_value), do: :all

  defp positive_integer(value, _default) when is_integer(value) and value > 0, do: value

  defp positive_integer(value, default) when is_binary(value) do
    case Integer.parse(value) do
      {integer, ""} when integer > 0 -> integer
      _invalid -> default
    end
  end

  defp positive_integer(_value, default), do: default

  defp default_download_concurrency do
    Application.get_env(:manavault, :scan_art_index_download_concurrency, @download_concurrency)
  end

  defp cached_reference(%Printing{} = printing, fetch_image_fun) do
    with {:ok, image_uris} <- decode_json(printing.image_uris),
         %{url: url, crop: crop} <- image_reference(image_uris),
         {:ok, path} <- cached_image(printing.scryfall_id, url, fetch_image_fun) do
      [
        %{
          scryfall_id: printing.scryfall_id,
          path: path,
          crop: crop,
          source_url: url,
          image_path: path
        }
      ]
    else
      _reason -> []
    end
  end

  defp decode_json(value) when is_binary(value), do: Jason.decode(value)
  defp decode_json(_value), do: {:ok, %{}}

  defp image_reference(uris) when is_map(uris) do
    cond do
      is_binary(uris["art_crop"]) -> %{url: uris["art_crop"], crop: "full"}
      is_binary(uris["normal"]) -> %{url: uris["normal"], crop: "art"}
      is_binary(uris["large"]) -> %{url: uris["large"], crop: "art"}
      is_binary(uris["png"]) -> %{url: uris["png"], crop: "art"}
      is_binary(uris["small"]) -> %{url: uris["small"], crop: "art"}
      true -> nil
    end
  end

  defp image_reference(uris) when is_list(uris), do: Enum.find_value(uris, &image_reference/1)
  defp image_reference(_uris), do: nil

  defp cached_image(scryfall_id, url, fetch_image_fun) do
    path = Path.join(cache_dir(), "#{scryfall_id}-art#{image_extension(url)}")

    cond do
      File.regular?(path) -> {:ok, path}
      true -> fetch_image_fun.(url, path)
    end
  end

  defp download_image(url, path) do
    File.mkdir_p!(Path.dirname(path))

    case Req.get(url,
           headers: [{"user-agent", @user_agent}],
           retry: :transient,
           max_retries: 2,
           receive_timeout: @download_timeout
         ) do
      {:ok, %{status: status, body: body}} when status in 200..299 and is_binary(body) ->
        File.write!(path, body)
        {:ok, path}

      {:ok, %{status: status}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp hash_references(references, hash_batch_size, hash_paths_fun) do
    references
    |> Enum.group_by(& &1.crop)
    |> Enum.flat_map(fn {crop, crop_references} ->
      crop_references
      |> Enum.chunk_every(hash_batch_size)
      |> Enum.flat_map(&hash_reference_batch(&1, crop, hash_paths_fun))
    end)
  end

  defp hash_reference_batch(references, crop, hash_paths_fun) do
    paths = Enum.map(references, & &1.path)

    case hash_paths_fun.(paths, crop: crop) do
      {:ok, hashes} ->
        references
        |> Enum.flat_map(fn reference ->
          case Map.fetch(hashes, reference.path) do
            {:ok, hash} ->
              [
                %{
                  scryfall_id: reference.scryfall_id,
                  hash: hash,
                  source_url: reference.source_url,
                  image_path: reference.image_path
                }
              ]

            :error ->
              []
          end
        end)

      {:error, reason} ->
        Logger.warning("Art index hashing failed crop=#{crop}: #{inspect(reason)}")
        []
    end
  end

  defp cache_dir do
    Application.get_env(
      :manavault,
      :scan_image_cache_dir,
      Path.join(["data", "cache", "scryfall", "scanner-images"])
    )
  end

  defp image_extension(url) do
    path = URI.parse(url).path || ""

    cond do
      String.match?(path, ~r/\.png$/i) -> ".png"
      String.match?(path, ~r/\.webp$/i) -> ".webp"
      true -> ".jpg"
    end
  end
end
