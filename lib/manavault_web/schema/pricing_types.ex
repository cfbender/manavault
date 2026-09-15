defmodule ManavaultWeb.Schema.PricingTypes do
  use Absinthe.Schema.Notation
  use Absinthe.Relay.Schema.Notation, :modern

  object :pricing_settings do
    field :source, non_null(:string)
    field :sources, non_null(list_of(non_null(:string)))
    field :vendors, non_null(list_of(non_null(:pricing_vendor_status)))
  end

  object :pricing_vendor_status do
    field :vendor, non_null(:string)
    field :price_count, non_null(:integer)
    field :last_synced_at, :string
  end
end
