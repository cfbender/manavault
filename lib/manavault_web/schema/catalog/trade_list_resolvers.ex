defmodule ManavaultWeb.Schema.Catalog.TradeListResolvers do
  @moduledoc false

  alias Manavault.Trade.Lists
  alias ManavaultWeb.Schema.RelayHelpers

  def collection_check(_parent, args, _resolution) do
    Lists.collection_check(list_source_args(args),
      include_considering: Map.get(args, :include_considering, false)
    )
  end

  def trade_matches(_parent, args, _resolution) do
    Lists.matches(list_source_args(args))
  end

  def deck_diff(_parent, %{deck_id: deck_id} = args, resolution) do
    with {:ok, id} <- RelayHelpers.node_id(deck_id, :deck, resolution) do
      Lists.deck_diff(id, list_source_args(args))
    end
  end

  defp list_source_args(args) do
    %{url: Map.get(args, :url), text: Map.get(args, :text)}
  end
end
