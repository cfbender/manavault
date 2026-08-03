defmodule Manavault.Trade.Lists do
  @moduledoc """
  Public API for the trade list feature: resolving a pasted decklist or a
  supported deck URL into normalized entries, matching those entries against
  the trade binder and want list, and diffing them against an existing deck.

  Reads `Manavault.Trade`'s want list through its public API
  (`wants_by_oracle_ids/1`) and `Manavault.Catalog.CollectionItem.for_trade`
  without owning either — this context only owns list resolution, matching,
  and deck diffing.
  """

  alias Manavault.Trade.{DeckDiff, EntryResolver, ListSource, Matcher}

  @doc """
  Resolves pasted `text` or a supported `url` (text wins if both are given)
  into `%{source_name, entries}`. Returns `{:error, message}` for an
  unsupported link, an unreachable/oversized/timed-out fetch, or when
  neither `text` nor `url` is present.
  """
  def resolve(%{url: _url, text: _text} = args), do: ListSource.resolve(args)

  @doc "Matches a resolved list against the trade binder and want list."
  def matches(args) do
    with {:ok, %{source_name: source_name, entries: entries}} <- resolve(args),
         {:ok, resolved} <- EntryResolver.resolve(entries) do
      {:ok, Matcher.match(source_name, resolved)}
    end
  end

  @doc "Diffs a resolved list against `deck_id`'s non-maybeboard cards."
  def deck_diff(deck_id, args) do
    with {:ok, %{source_name: source_name, entries: entries}} <- resolve(args),
         {:ok, resolved} <- EntryResolver.resolve(entries) do
      DeckDiff.diff(deck_id, source_name, resolved)
    end
  end
end
