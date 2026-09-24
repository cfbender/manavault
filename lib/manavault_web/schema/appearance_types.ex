defmodule ManavaultWeb.Schema.AppearanceTypes do
  use Absinthe.Schema.Notation

  object :appearance_settings do
    field :palette, non_null(:string)
    field :theme_style, non_null(:string)
  end
end
