defmodule Manavault.Catalog.ArtMatcher do
  @moduledoc """
  Global art-first scanner matcher backed by precomputed Scryfall art hashes.

  Runtime work stays small: hash the normalized card capture once, scan an in-memory
  list of 64-bit hashes, and return the closest printings as image evidence for
  `ScanRecognition`.
  """

  import Bitwise
  import Ecto.Query

  require Logger

  alias Manavault.Catalog.{ImageHashDaemon, Printing, PrintingArtHash}
  alias Manavault.Repo

  @cache_key {__MODULE__, :index}
  @default_limit 8
  @default_threshold 0.68
  @complete_ratio 0.995
  @byte_popcounts List.to_tuple(for value <- 0..255, do: value |> Integer.digits(2) |> Enum.sum())

  def clear_cache do
    :persistent_term.erase(@cache_key)
    :ok
  end

  def upsert_hashes(rows, opts \\ []) when is_list(rows) do
    clear_cache? = Keyword.get(opts, :clear_cache, true)
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    rows =
      rows
      |> Enum.flat_map(&normalize_hash_row(&1, now))
      |> Enum.uniq_by(& &1.scryfall_id)

    result =
      Repo.insert_all(PrintingArtHash, rows,
        conflict_target: [:scryfall_id],
        on_conflict: {:replace, [:hash, :source_url, :image_path, :updated_at]}
      )

    if clear_cache?, do: clear_cache()
    result
  end

  def cached_index_status do
    case :persistent_term.get(@cache_key, :missing) do
      :missing ->
        %{loaded?: false, complete?: false, entry_count: 0, expected_count: nil}

      index ->
        index
        |> index_status_map()
        |> Map.put(:loaded?, true)
    end
  end

  def index_status do
    index = load_index()
    index_status_map(index)
  end

  def match(image_path, opts \\ []) when is_binary(image_path) do
    crop = opts |> Keyword.get(:crop, "art") |> to_string()
    limit = opts |> Keyword.get(:limit, @default_limit) |> normalize_match_limit()
    threshold = Keyword.get(opts, :threshold, @default_threshold)
    set_codes = opts |> Keyword.get(:set_codes, []) |> normalize_set_codes()

    allow_partial_index? =
      Keyword.get(opts, :allow_partial_index, Keyword.get(opts, :allow_partial_art_index, false))

    with {:ok, query_hash} <- ImageHashDaemon.hash(image_path, crop: crop),
         {:ok, query_value} <- hex_to_integer(query_hash) do
      index = load_index()

      if usable_index?(index, allow_partial_index?) do
        index.entries
        |> top_scored_entries(query_value, set_codes, limit + 1)
        |> add_match_context(index)
        |> Enum.filter(&(&1.score >= threshold))
        |> Enum.take(limit)
      else
        Logger.debug(fn ->
          "Art matching skipped for #{image_path}: incomplete art index " <>
            "#{index.entry_count}/#{index.expected_count}"
        end)

        []
      end
    else
      {:error, reason} ->
        Logger.debug("Art matching skipped for #{image_path}: #{inspect(reason)}")
        []
    end
  rescue
    exception ->
      Logger.warning("Art matching failed for #{image_path}: #{Exception.message(exception)}")
      []
  end

  defp index_status_map(index) do
    %{
      complete?: index.complete?,
      entry_count: index.entry_count,
      expected_count: index.expected_count
    }
  end

  defp usable_index?(%{complete?: true}, _allow_partial_index?), do: true
  defp usable_index?(_index, true), do: true
  defp usable_index?(_index, _allow_partial_index?), do: false

  defp load_index do
    case :persistent_term.get(@cache_key, :missing) do
      :missing ->
        entries = load_entries()
        expected_count = expected_entry_count()
        entry_count = length(entries)

        index = %{
          entries: entries,
          entry_count: entry_count,
          expected_count: expected_count,
          complete?: complete_index?(entry_count, expected_count)
        }

        :persistent_term.put(@cache_key, index)
        index

      index ->
        index
    end
  end

  defp load_entries do
    PrintingArtHash
    |> join(:inner, [hash], printing in Printing, on: printing.scryfall_id == hash.scryfall_id)
    |> where([_hash, printing], printing.lang == "en")
    |> select([hash, printing], %{
      scryfall_id: hash.scryfall_id,
      hash: hash.hash,
      set_code: printing.set_code
    })
    |> Repo.all()
    |> Enum.flat_map(fn row ->
      case hex_to_integer(row.hash) do
        {:ok, hash_value} ->
          [
            %{
              scryfall_id: row.scryfall_id,
              hash: hash_value,
              set_code: normalize_set_code(row.set_code)
            }
          ]

        {:error, _reason} ->
          []
      end
    end)
  rescue
    exception ->
      Logger.warning("Could not load scanner art hash index: #{Exception.message(exception)}")
      []
  end

  defp expected_entry_count do
    Printing
    |> where([printing], printing.lang == "en")
    |> where([printing], not is_nil(printing.image_uris))
    |> select([printing], count(printing.scryfall_id))
    |> Repo.one()
  rescue
    exception ->
      Logger.warning(
        "Could not count scanner art index coverage: #{Exception.message(exception)}"
      )

      0
  end

  defp complete_index?(_entry_count, expected_count) when expected_count <= 0, do: false

  defp complete_index?(entry_count, expected_count) do
    entry_count >= expected_count or entry_count / expected_count >= @complete_ratio
  end

  defp top_scored_entries(_entries, _query_value, _set_codes, limit) when limit <= 0, do: []

  defp top_scored_entries(entries, query_value, set_codes, limit) do
    set_codes = set_code_filter(set_codes)

    entries
    |> Enum.reduce([], fn entry, top ->
      if entry_matches_set?(entry, set_codes) do
        candidate = {hamming_distance(entry.hash, query_value), entry.scryfall_id, entry}
        keep_top_candidate(candidate, top, limit)
      else
        top
      end
    end)
    |> Enum.sort(&candidate_before?/2)
    |> Enum.map(&score_candidate/1)
  end

  defp set_code_filter([]), do: nil
  defp set_code_filter(set_codes), do: MapSet.new(set_codes)

  defp entry_matches_set?(_entry, nil), do: true
  defp entry_matches_set?(entry, set_codes), do: MapSet.member?(set_codes, entry.set_code)

  defp keep_top_candidate(candidate, top, limit) do
    cond do
      length(top) < limit ->
        [candidate | top] |> Enum.sort(&candidate_before?/2)

      candidate_before?(candidate, List.last(top)) ->
        [candidate | top] |> Enum.sort(&candidate_before?/2) |> Enum.take(limit)

      true ->
        top
    end
  end

  defp candidate_before?({left_distance, left_id, _left}, {right_distance, right_id, _right}) do
    left_distance < right_distance or
      (left_distance == right_distance and left_id < right_id)
  end

  defp score_candidate({distance, _scryfall_id, entry}) do
    %{
      scryfall_id: entry.scryfall_id,
      score: 1.0 - distance / 64,
      source: :art
    }
  end

  defp add_match_context([], _index), do: []

  defp add_match_context(scored_entries, index) do
    next_scores = Enum.map(tl(scored_entries), & &1.score) ++ [0.0]

    scored_entries
    |> Enum.zip(next_scores)
    |> Enum.with_index(1)
    |> Enum.map(fn {{entry, second_score}, rank} ->
      entry
      |> Map.put(:rank, rank)
      |> Map.put(:margin, entry.score - second_score)
      |> Map.put(:index_complete, index.complete?)
      |> Map.put(:index_size, index.entry_count)
    end)
  end

  defp normalize_match_limit(value) when is_integer(value) and value > 0, do: value
  defp normalize_match_limit(_value), do: @default_limit

  defp normalize_hash_row(row, now) when is_map(row) do
    scryfall_id = Map.get(row, :scryfall_id) || Map.get(row, "scryfall_id")
    hash = Map.get(row, :hash) || Map.get(row, "hash")

    with true <- is_binary(scryfall_id) and scryfall_id != "",
         true <- is_binary(hash),
         normalized_hash <- String.downcase(hash),
         true <- Regex.match?(~r/\A[0-9a-f]{16}\z/, normalized_hash) do
      [
        %{
          scryfall_id: scryfall_id,
          hash: normalized_hash,
          source_url: Map.get(row, :source_url) || Map.get(row, "source_url"),
          image_path: Map.get(row, :image_path) || Map.get(row, "image_path"),
          inserted_at: now,
          updated_at: now
        }
      ]
    else
      _invalid -> []
    end
  end

  defp normalize_hash_row(_row, _now), do: []

  defp hamming_distance(left, right), do: byte_popcount(bxor(left, right), 0, 0)

  defp byte_popcount(_value, 8, count), do: count

  defp byte_popcount(value, index, count) do
    byte = value >>> (index * 8) &&& 0xFF
    byte_popcount(value, index + 1, count + elem(@byte_popcounts, byte))
  end

  defp hex_to_integer(value) when is_binary(value) do
    case Integer.parse(value, 16) do
      {integer, ""} -> {:ok, integer}
      _invalid -> {:error, :invalid_hash}
    end
  end

  defp hex_to_integer(_value), do: {:error, :invalid_hash}

  defp normalize_set_codes(values) when is_list(values) do
    values
    |> Enum.map(&normalize_set_code/1)
    |> Enum.reject(&(&1 == ""))
  end

  defp normalize_set_codes(_values), do: []

  defp normalize_set_code(value) when is_binary(value), do: String.downcase(value)
  defp normalize_set_code(value), do: value |> to_string() |> String.downcase()
end
