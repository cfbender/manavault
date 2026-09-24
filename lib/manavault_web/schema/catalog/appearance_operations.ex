defmodule ManavaultWeb.Schema.Catalog.AppearanceOperations do
  @moduledoc false

  use Absinthe.Schema.Notation
  use Absinthe.Relay.Schema.Notation, :modern

  alias ManavaultWeb.Schema.AppearanceResolvers

  object :appearance_queries do
    field :appearance_settings, non_null(:appearance_settings) do
      resolve(&AppearanceResolvers.appearance_settings/3)
    end
  end

  object :appearance_mutations do
    @desc "Updates the given appearance fields; omitted fields keep their saved values."
    payload field :update_appearance_settings do
      arg(:palette, :string)
      arg(:theme_style, :string)

      output do
        field :appearance_settings, :appearance_settings
      end

      resolve(fn parent, args, resolution ->
        case AppearanceResolvers.update_appearance_settings(parent, args, resolution) do
          {:ok, settings} -> {:ok, %{appearance_settings: settings}}
          other -> other
        end
      end)
    end
  end
end
