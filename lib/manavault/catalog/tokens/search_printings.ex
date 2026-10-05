defmodule Manavault.Catalog.Tokens.SearchPrintings do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, Printing, Util}
  alias Manavault.Catalog.Search.NameMatch
  alias Manavault.Repo

  @doc """
  Token printings matching the filters, newest first, each with its card.

  Filters: `:q` (name), `:set_code`, and `:exclude_scryfall_id` (the scanned
  front face when picking the back of a double-sided token).
  """
  def run(filters, opts \\ []) when is_list(filters) and is_list(opts) do
    limit = Keyword.get(opts, :limit, 60)
    name = filters |> Keyword.get(:q, "") |> Util.normalize_filter()

    set_code =
      filters |> Keyword.get(:set_code, "") |> Util.normalize_filter() |> String.downcase()

    exclude_id = Keyword.get(filters, :exclude_scryfall_id)

    if name == "" and set_code == "" do
      []
    else
      Printing
      |> join(:inner, [printing], card in assoc(printing, :card), as: :card)
      |> where(^Card.token())
      |> maybe_filter_name(name)
      |> maybe_filter_set_code(set_code)
      |> maybe_exclude(exclude_id)
      |> preload([_printing, card], card: card)
      |> order_by([printing, card],
        desc: printing.released_at,
        asc: card.name,
        asc: printing.set_code,
        asc: printing.collector_number
      )
      |> limit(^limit)
      |> Repo.all()
    end
  end

  defp maybe_filter_name(query, ""), do: query

  defp maybe_filter_name(query, name) do
    pattern = NameMatch.like_pattern(name)
    where(query, [card: card], fragment("? LIKE ? ESCAPE '\\'", card.normalized_name, ^pattern))
  end

  defp maybe_filter_set_code(query, ""), do: query

  defp maybe_filter_set_code(query, set_code) do
    where(query, [printing], printing.set_code == ^set_code)
  end

  defp maybe_exclude(query, id) when is_binary(id) and id != "" do
    where(query, [printing], printing.scryfall_id != ^id)
  end

  defp maybe_exclude(query, _id), do: query
end
