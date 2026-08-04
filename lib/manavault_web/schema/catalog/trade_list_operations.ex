defmodule ManavaultWeb.Schema.Catalog.TradeListOperations do
  @moduledoc false

  use Absinthe.Schema.Notation
  use Absinthe.Relay.Schema.Notation, :modern

  alias ManavaultWeb.Schema.Catalog.TradeListResolvers

  object :trade_list_mutations do
    field :trade_matches, non_null(:trade_match_result) do
      arg(:url, :string)
      arg(:text, :string)
      resolve(&TradeListResolvers.trade_matches/3)
    end

    field :deck_diff, non_null(:deck_diff_result) do
      arg(:deck_id, non_null(:id))
      arg(:url, :string)
      arg(:text, :string)
      resolve(&TradeListResolvers.deck_diff/3)
    end
  end
end
