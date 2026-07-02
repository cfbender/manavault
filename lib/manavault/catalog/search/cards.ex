defmodule Manavault.Catalog.Search.Cards do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.{Card, Printing}
  alias Manavault.Catalog.Search.Cards.Filter
  alias Manavault.Repo

  def search_cards(term, opts \\ []) when is_binary(term) do
    limit = Keyword.get(opts, :limit, 20)

    card_ids =
      from(card in Card, as: :card)
      |> join(:left, [card], printing in assoc(card, :printings), as: :printing)
      |> Filter.apply(term)
      |> group_by([card, _printing], card.oracle_id)
      |> order_by([card, _printing], asc: card.name)
      |> limit(^limit)
      |> select([card, _printing], card.oracle_id)
      |> Repo.all()

    Card
    |> where([card], card.oracle_id in ^card_ids)
    |> Repo.all()
    |> Enum.sort_by(&Enum.find_index(card_ids, fn oracle_id -> oracle_id == &1.oracle_id end))
    |> Repo.preload(printings: from(printing in Printing, order_by: [desc: printing.released_at]))
  end
end
