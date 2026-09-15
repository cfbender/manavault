defmodule ManavaultWeb.Schema.Catalog.TradeTypes do
  @moduledoc false

  use Absinthe.Schema.Notation

  import Absinthe.Resolution.Helpers, only: [dataloader: 1, dataloader: 2]

  alias Manavault.Catalog
  alias Manavault.Trade

  object :trade_want do
    field :id, non_null(:id)
    field :quantity, non_null(:integer)
    field :card, :card, resolve: dataloader(Catalog)
    field :printing, :printing, resolve: dataloader(Catalog, :preferred_printing)

    field :image_url, :string do
      resolve(fn want, _args, _resolution -> {:ok, Trade.want_image_url(want)} end)
    end
  end

  object :wants_list_entry do
    field :card_name, non_null(:string)
    field :quantity, non_null(:integer)
    field :type_line, :string
    field :set_code, :string
    field :collector_number, :string
    field :image_url, :string
  end

  object :binder_list_entry do
    field :card_name, non_null(:string)
    field :quantity, non_null(:integer)
    field :type_line, :string
    field :set_code, :string
    field :collector_number, :string
    field :image_url, :string
    field :finish, :string
    field :condition, :string
  end

  object :binder_list do
    field :entries, non_null(list_of(non_null(:binder_list_entry)))
  end

  object :wants_list do
    field :entries, non_null(list_of(non_null(:wants_list_entry)))
  end
end
