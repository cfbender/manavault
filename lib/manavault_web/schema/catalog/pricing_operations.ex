defmodule ManavaultWeb.Schema.Catalog.PricingOperations do
  @moduledoc false

  use Absinthe.Schema.Notation
  use Absinthe.Relay.Schema.Notation, :modern

  alias ManavaultWeb.Schema.PricingResolvers

  object :pricing_queries do
    field :pricing_settings, non_null(:pricing_settings) do
      resolve(&PricingResolvers.pricing_settings/3)
    end
  end

  object :pricing_mutations do
    payload field :update_pricing_settings do
      arg(:source, non_null(:string))

      output do
        field :pricing_settings, :pricing_settings
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &PricingResolvers.update_pricing_settings/3,
          :pricing_settings
        )
      end)
    end

    payload field :sync_vendor_prices do
      output do
        field :pricing_settings, :pricing_settings
      end

      resolve(fn parent, args, resolution ->
        payload(
          parent,
          args,
          resolution,
          &PricingResolvers.sync_vendor_prices/3,
          :pricing_settings
        )
      end)
    end
  end

  defp payload(parent, args, resolution, resolver, field) do
    case resolver.(parent, args, resolution) do
      {:ok, value} -> {:ok, %{field => value}}
      other -> other
    end
  end
end
