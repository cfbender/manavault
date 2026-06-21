defmodule Manavault.Catalog.RuntimeImageMatcher do
  @moduledoc """
  Candidate-scoped image matching for scanner recognition.

  The scanner first narrows candidates with OCR. This module then downloads and
  caches only those candidate printings' card images, hashes them, and compares
  them with the captured frame.
  """

  require Logger

  alias Manavault.Catalog.{ImageMatcher, Printing}

  @user_agent "ManaVault/0.1 (local scanner image matcher)"
  @default_limit 5
  @default_threshold 0.45
  @reference_cache_table :manavault_runtime_image_reference_cache

  def clear_cache do
    case :ets.whereis(@reference_cache_table) do
      :undefined -> :ok
      table -> :ets.delete_all_objects(table)
    end
  end

  def match(image_path, printings, opts \\ [])
      when is_binary(image_path) and is_list(printings) do
    match_opts =
      opts
      |> Keyword.put_new(:limit, @default_limit)
      |> Keyword.put_new(:threshold, @default_threshold)

    printings
    |> Enum.flat_map(&reference_fixture/1)
    |> cached_references(Keyword.take(match_opts, [:crop]))
    |> then(
      &ImageMatcher.match(image_path, &1, Keyword.take(match_opts, [:crop, :limit, :threshold]))
    )
  rescue
    exception ->
      Logger.warning(
        "Runtime image matching failed for #{image_path}: #{Exception.message(exception)}"
      )

      []
  end

  defp reference_fixture(%Printing{} = printing) do
    with {:ok, uris} <- decode_json(printing.image_uris),
         url when is_binary(url) <- image_url(uris),
         {:ok, path} <- cached_image(printing.scryfall_id, url) do
      [
        %{
          path: path,
          scryfall_id: printing.scryfall_id,
          oracle_id: printing.oracle_id,
          name: printing.card && printing.card.name
        }
      ]
    else
      _error -> []
    end
  end

  defp cached_references(references, opts) do
    crop = opts |> Keyword.get(:crop, "art") |> to_string()
    table = reference_cache_table()

    {cached, missing} =
      Enum.reduce(references, {[], []}, fn reference, {cached, missing} ->
        key = reference_cache_key(reference, crop)

        case :ets.lookup(table, key) do
          [{^key, hash}] -> {[Map.put(reference, :hash, hash) | cached], missing}
          [] -> {cached, [reference | missing]}
        end
      end)

    missing = Enum.reverse(missing)

    hashed =
      missing
      |> hash_missing_references(crop)
      |> tap(fn hashed_references ->
        Enum.each(hashed_references, fn reference ->
          :ets.insert(table, {reference_cache_key(reference, crop), reference.hash})
        end)
      end)

    Enum.reverse(cached) ++ hashed
  end

  defp hash_missing_references([], _crop), do: []

  defp hash_missing_references(references, crop) do
    paths = Enum.map(references, & &1.path)

    case ImageMatcher.hash_paths(paths, crop: crop) do
      {:ok, hashes} ->
        references
        |> Enum.flat_map(fn reference ->
          case Map.fetch(hashes, reference.path) do
            {:ok, hash} -> [Map.put(reference, :hash, hash)]
            :error -> []
          end
        end)

      {:error, reason} ->
        Logger.warning("Runtime image reference hashing failed: #{reason}")
        []
    end
  end

  defp reference_cache_key(reference, crop), do: {crop, reference.scryfall_id, reference.path}

  defp reference_cache_table do
    case :ets.whereis(@reference_cache_table) do
      :undefined ->
        try do
          :ets.new(@reference_cache_table, [
            :named_table,
            :public,
            read_concurrency: true,
            write_concurrency: true
          ])
        rescue
          ArgumentError -> @reference_cache_table
        end

      table ->
        table
    end
  end

  defp decode_json(value) when is_binary(value), do: Jason.decode(value)
  defp decode_json(_value), do: {:ok, %{}}

  defp image_url(uris) when is_map(uris) do
    uris["normal"] || uris["large"] || uris["png"] || uris["small"]
  end

  defp image_url(uris) when is_list(uris) do
    Enum.find_value(uris, &image_url/1)
  end

  defp image_url(_uris), do: nil

  defp cached_image(scryfall_id, url) do
    path = Path.join(cache_dir(), "#{scryfall_id}#{image_extension(url)}")

    cond do
      File.regular?(path) ->
        {:ok, path}

      true ->
        download_image(url, path)
    end
  end

  defp download_image(url, path) do
    File.mkdir_p!(Path.dirname(path))

    case Req.get(url, headers: [{"user-agent", @user_agent}], retry: :transient, max_retries: 2) do
      {:ok, %{status: status, body: body}} when status in 200..299 and is_binary(body) ->
        File.write!(path, body)
        {:ok, path}

      {:ok, %{status: status}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
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
