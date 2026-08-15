defmodule Manavault.Catalog.Search.CardNameSuggestions do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, Printing}
  alias Manavault.Catalog.Search.NameMatch
  alias Manavault.Repo

  @card_name_cache_key {__MODULE__, :card_name_suggestions, 3}

  def suggest_card_names(term, opts \\ []) when is_binary(term) do
    limit = Keyword.get(opts, :limit, 5)
    normalized_term = NameMatch.normalize(term)

    if normalized_term == "" do
      []
    else
      normalized_term
      |> candidate_pool()
      |> Enum.filter(&NameMatch.candidate?(normalized_term, &1))
      |> Enum.map(&{NameMatch.score(normalized_term, &1), &1.source_priority, &1.result_name})
      |> Enum.sort()
      |> Enum.uniq_by(fn {_score, _source_priority, result_name} -> result_name end)
      |> Enum.take(limit)
      |> Enum.map(fn {_score, _source_priority, result_name} -> result_name end)
    end
  end

  defp candidate_pool(term) do
    %{by_initial: by_initial, by_ngram: by_ngram} = cached_card_names()

    if byte_size(term) < 3 do
      term
      |> String.split(" ", trim: true)
      |> Enum.flat_map(&token_initial/1)
      |> Enum.flat_map(&Map.get(by_initial, &1, []))
      |> uniq_card_name_entries()
    else
      ngram_candidates =
        term
        |> String.replace(" ", "")
        |> name_ngrams()
        |> Enum.flat_map(&Map.get(by_ngram, &1, []))

      initial_candidates =
        term
        |> String.split(" ", trim: true)
        |> Enum.flat_map(&token_initial/1)
        |> Enum.flat_map(&Map.get(by_initial, &1, []))

      uniq_card_name_entries(ngram_candidates ++ initial_candidates)
    end
  end

  defp cached_card_names do
    case :persistent_term.get(@card_name_cache_key, nil) do
      nil ->
        canonical_entries =
          Card
          |> select([card], card.name)
          |> order_by([card], asc: card.name)
          |> Repo.all()
          |> Enum.uniq()
          |> Enum.map(&card_name_cache_entry(&1, &1, 0))

        alternate_entries =
          Printing
          |> join(:inner, [printing], card in assoc(printing, :card))
          |> where(
            [printing, _card],
            not is_nil(printing.flavor_name) and printing.flavor_name != ""
          )
          |> select([printing, card], {card.name, printing.flavor_name})
          |> distinct(true)
          |> order_by([printing, card], asc: card.name, asc: printing.flavor_name)
          |> Repo.all()
          |> Enum.map(fn {card_name, flavor_name} ->
            card_name_cache_entry(card_name, flavor_name, 1)
          end)

        entries = canonical_entries ++ alternate_entries

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

  defp card_name_cache_entry(result_name, matched_name, source_priority) do
    normalized_name = NameMatch.normalize(matched_name)

    %{
      name: matched_name,
      result_name: result_name,
      source_priority: source_priority,
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

  defp token_initial(token) do
    case String.graphemes(token) do
      [initial | _rest] -> [initial]
      [] -> []
    end
  end

  defp uniq_card_name_entries(entries) do
    entries
    |> Enum.uniq_by(&{&1.result_name, &1.normalized_name})
    |> Enum.sort_by(&{String.downcase(&1.result_name), &1.source_priority})
  end
end
