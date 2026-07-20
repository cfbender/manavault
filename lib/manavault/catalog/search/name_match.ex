defmodule Manavault.Catalog.Search.NameMatch do
  @moduledoc """
  Shared card-name matching for the catalog.

  This module is the single definition of name-match semantics. Every
  name-based search path delegates here:

    * `CardNameSuggestions` (the `cardNameSuggestions` combobox query) gates
      and ranks with `candidate?/2` and `score/2`.
    * `Search.Cards` (catalog `cards` connection), `CardCollection.SearchFilter`
      (collection/location item search), and `Search.Printings` (import, cover
      search) build their SQL name predicates with `like_pattern/1`.

  Matching is case-insensitive and apostrophe-insensitive on both sides. SQL
  filters normalize the column with `lower(replace(replace(name, '''', ''),
  '\\u2019', ''))`; other punctuation stays literal because SQLite cannot
  collapse it per-row, so keep term-side normalization to the same rules.
  """

  # Tokens with no discriminative weight of their own: "Mask of Memory" must
  # not be admitted or rejected on the strength of "of" alone. Stopword tokens
  # still contribute when every term token is a stopword.
  @stopwords ~w(of the a an and or to in on at for with from by de le la el di)

  @doc """
  Full normalization for in-memory matching: lowercase, drop apostrophes so
  "aurelia's" collapses to "aurelias" instead of splitting tokens, and
  collapse every non-alphanumeric run to a single space.
  """
  def normalize(value) do
    value
    |> String.downcase()
    |> String.replace(~r/['\x{2019}]/u, "")
    |> String.replace(~r/[^[:alnum:]]+/u, " ")
    |> String.trim()
  end

  def tokens(value), do: value |> normalize() |> String.split(" ", trim: true)

  @doc """
  SQL-compatible term normalization: lowercase, drop apostrophes, squash
  whitespace. Mirrors the `lower(replace(...))` column expression used by the
  SQL name predicates.
  """
  def sql_normalize(value) do
    value
    |> String.downcase()
    |> String.replace(~r/['\x{2019}]/u, "")
    |> String.replace(~r/\s+/u, " ")
    |> String.trim()
  end

  @doc "Escape LIKE metacharacters and wrap as a substring pattern."
  def substring_pattern(value) do
    value
    |> String.replace("\\", "\\\\")
    |> String.replace("%", "\\%")
    |> String.replace("_", "\\_")
    |> then(&"%#{&1}%")
  end

  @doc "LIKE pattern for a card-name search term (see `sql_normalize/1`)."
  def like_pattern(term), do: term |> sql_normalize() |> substring_pattern()

  @doc """
  Whether a name entry is a candidate for the normalized term.

  Entry shape: `%{normalized_name, compact_name, tokens}`. A candidate is an
  exact/prefix/substring/compact match, or every significant term token
  prefix- or fuzzy-matches a distinct-quality name token, or the compacted
  term is within edit distance of the compacted name.
  """
  def candidate?(term, %{normalized_name: normalized_name, compact_name: compact_name} = entry) do
    cond do
      term == "" ->
        false

      normalized_name == term or String.starts_with?(normalized_name, term) or
        String.contains?(normalized_name, term) ->
        true

      String.contains?(compact_name, String.replace(term, " ", "")) ->
        true

      true ->
        token_match?(term, entry) or compact_fuzzy_match?(term, compact_name)
    end
  end

  @doc """
  Sort key for a candidate: lower is better. Exact/prefix/substring matches
  rank by match class then name length then alphabetically — cheap, no edit
  distance. Everything else ranks by fuzzy distance then alphabetically.
  """
  def score(term, %{normalized_name: normalized_name, name: name} = entry) do
    cond do
      normalized_name == term -> {0, 0, String.downcase(name)}
      String.starts_with?(normalized_name, term) -> {1, byte_size(name), String.downcase(name)}
      substring_match?(term, entry) -> {2, byte_size(name), String.downcase(name)}
      true -> {8, fuzzy_distance(term, entry), String.downcase(name)}
    end
  end

  defp substring_match?(term, %{normalized_name: normalized_name, compact_name: compact_name}) do
    String.contains?(normalized_name, term) or
      String.contains?(compact_name, String.replace(term, " ", ""))
  end

  # Every significant term token must match some name token, either by prefix
  # or — same initial only — by a small edit distance. Requiring every token
  # (instead of any) is what keeps "of" from admitting the whole catalog.
  defp token_match?(term, %{tokens: name_tokens}) do
    term_tokens = String.split(term, " ", trim: true)
    significant = significant_tokens(term_tokens)

    Enum.all?(significant, fn term_token ->
      length = String.length(term_token)
      # Short tokens must prefix-match; fuzzy matching applies from 3 chars
      # up, where transpositions and small edits are plausible typos.
      threshold = if length >= 3, do: max(2, div(length, 2)), else: 0

      Enum.any?(name_tokens, fn name_token ->
        String.starts_with?(name_token, term_token) or
          (String.first(name_token) == String.first(term_token) and
             edit_distance(term_token, name_token) <= threshold)
      end)
    end)
  end

  defp significant_tokens(term_tokens) do
    case Enum.reject(term_tokens, &(&1 in @stopwords)) do
      [] -> term_tokens
      significant -> significant
    end
  end

  defp compact_fuzzy_match?(term, compact_name) do
    compact_term = String.replace(term, " ", "")

    String.length(compact_term) >= 4 and
      String.first(compact_term) == String.first(compact_name) and
      edit_distance(compact_term, compact_name) <= max(3, div(String.length(compact_term) + 2, 3))
  end

  defp fuzzy_distance(term, %{normalized_name: normalized_name, compact_name: compact_name}) do
    term_tokens = String.split(term, " ", trim: true)
    name_tokens = String.split(normalized_name, " ", trim: true)

    token_distances = Enum.map(name_tokens, &edit_distance(term, &1))

    Enum.min(
      [
        edit_distance(term, normalized_name),
        edit_distance(String.replace(term, " ", ""), compact_name),
        token_ordered_distance(term_tokens, name_tokens),
        token_aligned_distance(term_tokens, name_tokens) + 1
      ] ++ token_distances
    )
  end

  defp token_aligned_distance(term_tokens, name_tokens) do
    Enum.sum(
      Enum.map(term_tokens, fn term_token ->
        name_tokens |> Enum.map(&edit_distance(term_token, &1)) |> Enum.min(fn -> 0 end)
      end)
    )
  end

  defp token_ordered_distance([], name_tokens), do: Enum.sum(Enum.map(name_tokens, &String.length/1))
  defp token_ordered_distance(term_tokens, []), do: Enum.sum(Enum.map(term_tokens, &String.length/1))

  defp token_ordered_distance([term_token | term_rest], [name_token | name_rest]) do
    edit_distance(term_token, name_token) + token_ordered_distance(term_rest, name_rest)
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
         [left | _] = acc
       ) do
    cost = if left_char == right_char, do: 0, else: 1
    value = min(min(left + 1, above + 1), diagonal + cost)
    distance_row(left_char, right_rest, above_rest, above, [value | acc])
  end
end
