defmodule Manavault.Trade.ForTradeQuery do
  @moduledoc """
  The base query for for-trade collection items visible to someone else:
  every `Manavault.Catalog.CollectionItem` with a positive offered quantity,
  excluding items stored in list-kind locations (a "list" location tracks
  cards wanted from someone else, not cards actually on hand to trade).

  Shared by `Manavault.Trade.Matcher` (matching a parsed list against the
  binder) and `Manavault.Trade.BinderShare` (the public binder share), so
  the exclusion behaves identically in both.

  Binds `[item, printing, card, location]` — inner-joined to the item's
  printing and card, left-joined to its (possibly absent) location.
  """

  import Ecto.Query

  alias Manavault.Catalog.CollectionItem

  def base_query do
    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:inner, [_item, printing], card in assoc(printing, :card))
    |> join(:left, [item], location in assoc(item, :location_assoc))
    |> where([item], item.for_trade_quantity > 0)
    |> where(
      [_item, _printing, _card, location],
      is_nil(location.id) or location.kind != "list"
    )
  end
end
