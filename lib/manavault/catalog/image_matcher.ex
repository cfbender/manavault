defmodule Manavault.Catalog.ImageMatcher do
  @moduledoc """
  Local perceptual-hash image matching for scanner recognition.

  The matcher is intentionally small and self-hostable: it shells out to the
  same Python environment used by RapidOCR and computes deterministic dHashes
  for locally cached Scryfall reference images.
  """

  import Bitwise
  require Logger

  @default_limit 5
  @default_threshold 0.82

  def build_references(fixtures, opts \\ []) when is_list(fixtures) do
    crop = Keyword.get(opts, :crop, "art")

    fixtures
    |> Enum.map(&fixture_reference/1)
    |> Enum.reject(&is_nil/1)
    |> hash_references(crop)
  end

  def match(image_path, references, opts \\ [])
      when is_binary(image_path) and is_list(references) do
    limit = Keyword.get(opts, :limit, @default_limit)
    threshold = Keyword.get(opts, :threshold, @default_threshold)
    crop = Keyword.get(opts, :crop, "art")

    with {:ok, %{^image_path => query_hash}} <- hash_paths([image_path], crop) do
      references
      |> Enum.map(&score_reference(&1, query_hash))
      |> Enum.filter(&(&1.score >= threshold))
      |> Enum.sort_by(&{-&1.score, &1.scryfall_id})
      |> Enum.take(limit)
    else
      {:ok, _hashes} ->
        []

      {:error, reason} ->
        Logger.warning("Image matching failed for #{image_path}: #{reason}")
        []
    end
  end

  def hamming_similarity(left, right) when is_binary(left) and is_binary(right) do
    distance =
      left
      |> hex_to_integer()
      |> Bitwise.bxor(hex_to_integer(right))
      |> count_bits()

    1.0 - distance / 64
  end

  defp fixture_reference(%{"image_path" => image_path, "card" => card})
       when is_binary(image_path) and is_map(card) do
    %{
      path: image_path,
      scryfall_id: card["id"],
      oracle_id: card["oracle_id"],
      name: card["name"]
    }
  end

  defp fixture_reference(_fixture), do: nil

  defp hash_references(references, crop) do
    paths = Enum.map(references, & &1.path)

    case hash_paths(paths, crop) do
      {:ok, hashes} ->
        references
        |> Enum.map(fn reference ->
          case Map.fetch(hashes, reference.path) do
            {:ok, hash} -> Map.put(reference, :hash, hash)
            :error -> nil
          end
        end)
        |> Enum.reject(&is_nil/1)

      {:error, reason} ->
        Logger.warning("Image reference hashing failed: #{reason}")
        []
    end
  end

  defp score_reference(reference, query_hash) do
    %{
      scryfall_id: reference.scryfall_id,
      oracle_id: reference.oracle_id,
      name: reference.name,
      score: hamming_similarity(query_hash, reference.hash),
      hash: reference.hash
    }
  end

  defp hash_paths([], _crop), do: {:ok, %{}}

  defp hash_paths(paths, crop) do
    case System.cmd(rapidocr_python_path(), [hash_script_path(), crop | paths],
           stderr_to_stdout: true
         ) do
      {output, 0} ->
        decode_hash_output(output)

      {output, status} ->
        {:error, "image hash exited with #{status}: #{String.trim(output)}"}
    end
  rescue
    ErlangError -> {:error, "image hash Python environment is not available"}
  end

  defp hash_script_path do
    Application.app_dir(:manavault, "priv/image_hash.py")
  end

  defp decode_hash_output(output) do
    with {:ok, decoded} <- Jason.decode(output) do
      hashes =
        decoded
        |> Enum.flat_map(fn {path, result} ->
          case result do
            %{"ok" => true, "hash" => hash} -> [{path, hash}]
            _ -> []
          end
        end)
        |> Map.new()

      {:ok, hashes}
    else
      {:error, reason} -> {:error, "invalid image hash output: #{inspect(reason)}"}
    end
  end

  defp rapidocr_python_path do
    Application.get_env(
      :manavault,
      :rapidocr_python,
      Path.expand(".venv/bin/python", File.cwd!())
    )
  end

  defp hex_to_integer(value) do
    {integer, ""} = Integer.parse(value, 16)
    integer
  end

  defp count_bits(0), do: 0

  defp count_bits(value) do
    (value &&& 1) + count_bits(value >>> 1)
  end
end
