defmodule Manavault.Catalog.Search.CardNameSuggestions do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.Card
  alias Manavault.Repo

  @card_name_cache_key {__MODULE__, :card_name_suggestions, 2}
  @suggestion_candidate_limit 250

  def suggest_card_names(term, opts \\ []) when is_binary(term) do
    limit = Keyword.get(opts, :limit, 5)
    normalized_term = normalize_card_suggestion(term)

    if normalized_term == "" do
      []
    else
      candidate_limit = Keyword.get(opts, :candidate_limit, @suggestion_candidate_limit)

      normalized_term
      |> card_name_suggestion_candidates(candidate_limit)
      |> Enum.map(fn %{name: name} -> {card_name_match_score(normalized_term, name), name} end)
      |> Enum.sort_by(fn {score, name} -> {score, String.downcase(name)} end)
      |> Enum.take(limit)
      |> Enum.map(fn {_score, name} -> name end)
    end
  end

  defp card_name_suggestion_candidates(term, candidate_limit) do
    cache = cached_card_names()

    cache
    |> candidate_pool(term)
    # Stream so matching (which runs edit distances) stops once we have enough
    # candidates instead of scanning the whole ngram bucket.
    |> Stream.filter(&card_name_candidate?(term, &1))
    |> Enum.take(candidate_limit)
  end

  defp cached_card_names do
    case :persistent_term.get(@card_name_cache_key, nil) do
      nil ->
        entries =
          Card
          |> select([card], card.name)
          |> order_by([card], asc: card.name)
          |> Repo.all()
          |> Enum.uniq()
          |> Enum.map(&card_name_cache_entry/1)

        cache = %{
          entries: entries,
          by_initial: index_card_names_by_initial(entries),
          by_ngram: index_card_names_by_ngram(entries)
        }

        :persistent_term.put(@card_name_cache_key, cache)
        cache

      %{by_initial: _by_initial, by_ngram: _by_ngram} = cache ->
        cache

      _stale_cache ->
        clear_card_name_suggestion_cache()
        cached_card_names()
    end
  end

  def clear_card_name_suggestion_cache do
    try do
      :persistent_term.erase(@card_name_cache_key)
    rescue
      ArgumentError -> :ok
    end
  end

  defp card_name_cache_entry(name) do
    normalized_name = normalize_card_suggestion(name)

    %{
      name: name,
      normalized_name: normalized_name,
      compact_name: String.replace(normalized_name, " ", ""),
      tokens: String.split(normalized_name, " ", trim: true)
    }
  end

  defp index_card_names_by_initial(entries) do
    Enum.reduce(entries, %{}, fn entry, index ->
      entry.tokens
      |> Enum.flat_map(&token_initial/1)
      |> Enum.uniq()
      |> Enum.reduce(index, fn initial, index ->
        Map.update(index, initial, [entry], &[entry | &1])
      end)
    end)
  end

  defp index_card_names_by_ngram(entries) do
    Enum.reduce(entries, %{}, fn entry, index ->
      entry.compact_name
      |> name_ngrams()
      |> Enum.reduce(index, fn ngram, index ->
        Map.update(index, ngram, [entry], &[entry | &1])
      end)
    end)
  end

  defp candidate_pool(%{by_initial: by_initial}, term) when byte_size(term) < 3 do
    term
    |> String.split(" ", trim: true)
    |> Enum.flat_map(&token_initial/1)
    |> Enum.flat_map(&Map.get(by_initial, &1, []))
    |> uniq_card_name_entries()
  end

  defp candidate_pool(%{by_initial: by_initial, by_ngram: by_ngram}, term) do
    compact_term = String.replace(term, " ", "")

    ngram_candidates =
      compact_term
      |> name_ngrams()
      |> Enum.flat_map(&Map.get(by_ngram, &1, []))

    initial_candidates =
      term
      |> String.split(" ", trim: true)
      |> Enum.flat_map(&token_initial/1)
      |> Enum.flat_map(&Map.get(by_initial, &1, []))

    uniq_card_name_entries(ngram_candidates ++ initial_candidates)
  end

  defp name_ngrams(value) do
    graphemes = String.graphemes(value)

    cond do
      length(graphemes) >= 3 ->
        graphemes
        |> Enum.chunk_every(3, 1, :discard)
        |> Enum.map(&Enum.join/1)
        |> Enum.uniq()

      value == "" ->
        []

      true ->
        [value]
    end
  end

  defp uniq_card_name_entries(entries) do
    entries
    |> Enum.uniq_by(& &1.name)
    |> Enum.sort_by(&String.downcase(&1.name))
  end

  defp normalize_card_suggestion(value) do
    value
    |> String.downcase()
    |> String.replace(~r/[^[:alnum:]]+/u, " ")
    |> String.trim()
  end

  defp card_name_match_score(term, name) do
    normalized_name = normalize_card_suggestion(name)

    contains_score =
      cond do
        normalized_name == term -> 0
        String.starts_with?(normalized_name, term) -> 1
        String.contains?(normalized_name, term) -> 2
        true -> 8
      end

    token_distance =
      normalized_name
      |> String.split(" ", trim: true)
      |> Enum.map(&edit_distance(term, &1))
      |> Enum.min(fn -> edit_distance(term, normalized_name) end)

    full_distance = edit_distance(term, normalized_name)
    aligned_token_distance = token_aligned_distance(term, normalized_name)
    ordered_token_distance = token_ordered_distance(term, normalized_name)

    contains_score * 100 +
      Enum.min([
        full_distance,
        token_distance + 2,
        ordered_token_distance,
        aligned_token_distance + 1
      ])
  end

  defp card_name_candidate?(term, %{
         normalized_name: normalized_name,
         compact_name: compact_name,
         tokens: name_tokens
       }) do
    compact_term = String.replace(term, " ", "")
    term_tokens = String.split(term, " ", trim: true)

    exact_or_substring? =
      normalized_name == term or
        String.starts_with?(normalized_name, term) or
        String.contains?(normalized_name, term) or
        String.starts_with?(compact_name, compact_term) or
        String.contains?(compact_name, compact_term) or
        token_prefix_match?(term_tokens, name_tokens)

    exact_or_substring? or fuzzy_candidate?(term, term_tokens, normalized_name, name_tokens)
  end

  defp fuzzy_candidate?(term, term_tokens, normalized_name, name_tokens) do
    String.length(term) >= 4 and
      abs(String.length(term) - String.length(normalized_name)) <= 8 and
      token_initial_match?(term_tokens, name_tokens) and
      card_name_distance_match?(term, normalized_name)
  end

  defp card_name_distance_match?(term, normalized_name) do
    distance_threshold = max(3, div(String.length(term) + 2, 3))
    distances = card_name_distances(term, normalized_name)

    Enum.min(distances) <= distance_threshold
  end

  defp token_prefix_match?(term_tokens, name_tokens) do
    Enum.any?(term_tokens, fn term_token ->
      Enum.any?(name_tokens, &String.starts_with?(&1, term_token))
    end)
  end

  defp token_initial_match?(term_tokens, name_tokens) do
    term_initials = Enum.flat_map(term_tokens, &token_initial/1)
    name_initials = Enum.flat_map(name_tokens, &token_initial/1)

    Enum.any?(term_initials, &(&1 in name_initials))
  end

  defp token_initial(token) do
    case String.graphemes(token) do
      [initial | _rest] -> [initial]
      [] -> []
    end
  end

  defp token_aligned_distance(term, normalized_name) do
    term_tokens = String.split(term, " ", trim: true)
    name_tokens = String.split(normalized_name, " ", trim: true)

    token_aligned_distance_for_tokens(term_tokens, name_tokens)
  end

  defp token_aligned_distance_for_tokens([], _name_tokens), do: 0

  defp token_aligned_distance_for_tokens(term_tokens, []),
    do: Enum.sum(Enum.map(term_tokens, &String.length/1))

  defp token_aligned_distance_for_tokens(term_tokens, name_tokens) do
    term_tokens
    |> Enum.map(fn term_token ->
      name_tokens
      |> Enum.map(&edit_distance(term_token, &1))
      |> Enum.min()
    end)
    |> Enum.sum()
  end

  defp token_ordered_distance(term, normalized_name) do
    term_tokens = String.split(term, " ", trim: true)
    name_tokens = String.split(normalized_name, " ", trim: true)

    token_ordered_distance_for_tokens(term_tokens, name_tokens)
  end

  defp token_ordered_distance_for_tokens([], name_tokens),
    do: Enum.sum(Enum.map(name_tokens, &String.length/1))

  defp token_ordered_distance_for_tokens(term_tokens, []),
    do: Enum.sum(Enum.map(term_tokens, &String.length/1))

  defp token_ordered_distance_for_tokens([term_token | term_rest], [name_token | name_rest]) do
    edit_distance(term_token, name_token) +
      token_ordered_distance_for_tokens(term_rest, name_rest)
  end

  defp card_name_distances(term, normalized_name) do
    token_distances =
      normalized_name
      |> String.split(" ", trim: true)
      |> Enum.map(&edit_distance(term, &1))

    [
      edit_distance(term, normalized_name),
      token_ordered_distance(term, normalized_name),
      token_aligned_distance(term, normalized_name) | token_distances
    ]
  end

  defp edit_distance(left, right) when left == right, do: 0
  defp edit_distance("", right), do: String.length(right)
  defp edit_distance(left, ""), do: String.length(left)

  defp edit_distance(left, right) do
    right_chars = String.graphemes(right)
    previous_row = Enum.to_list(0..length(right_chars))

    left
    |> String.graphemes()
    |> Enum.reduce({previous_row, 1}, fn left_char, {[diagonal | above_row], row_index} ->
      {distance_row(left_char, right_chars, above_row, diagonal, [row_index]), row_index + 1}
    end)
    |> elem(0)
    |> List.last()
  end

  # One Wagner-Fischer row, accumulated head-first (reversed) so there is no
  # list append or index lookup per cell — O(right length) instead of O(n^2).
  defp distance_row(_left_char, [], _above_row, _diagonal, acc), do: Enum.reverse(acc)

  defp distance_row(
         left_char,
         [right_char | right_rest],
         [above | above_rest],
         diagonal,
         [
           left | _
         ] = acc
       ) do
    cost = if left_char == right_char, do: 0, else: 1
    value = min(min(left + 1, above + 1), diagonal + cost)
    distance_row(left_char, right_rest, above_rest, above, [value | acc])
  end
end
