defmodule ManavaultWeb.Schema.Catalog.TradeListTypes do
  @moduledoc false

  use Absinthe.Schema.Notation

  object :trade_match_result do
    field :source_name, :string
    field :entry_count, non_null(:integer)
    field :unrecognized, non_null(list_of(non_null(:string)))
    field :binder_matches, non_null(list_of(non_null(:trade_binder_match)))
    field :want_matches, non_null(list_of(non_null(:trade_want_match)))
  end

  object :trade_binder_match do
    field :card_name, non_null(:string)
    field :oracle_id, non_null(:id)
    field :their_quantity, non_null(:integer)
    field :items, non_null(list_of(non_null(:collection_item)))
  end

  object :trade_want_match do
    field :card_name, non_null(:string)
    field :oracle_id, non_null(:id)
    field :their_quantity, non_null(:integer)
    field :want, non_null(:trade_want)
  end

  object :deck_diff_result do
    field :source_name, :string
    field :adds, non_null(list_of(non_null(:deck_diff_entry)))
    field :cuts, non_null(list_of(non_null(:deck_diff_entry)))
    field :changes, non_null(list_of(non_null(:deck_diff_change)))
    field :unrecognized, non_null(list_of(non_null(:string)))
  end

  object :deck_diff_entry do
    field :card_name, non_null(:string)
    field :quantity, non_null(:integer)
    field :oracle_id, :id
    field :image_url, :string
  end

  object :deck_diff_change do
    field :card_name, non_null(:string)
    field :from_quantity, non_null(:integer)
    field :to_quantity, non_null(:integer)
    field :oracle_id, :id
  end
end
